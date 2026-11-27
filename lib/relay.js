// Klien relay WebSocket (Cloudflare Worker + Durable Object, lihat relay/).
//
// Protokolnya JSON sederhana: hello, state (x/y/z/ry), ping. Server membalas
// roster, join, leave, dan state pemain lain.

const STALE_MS = 8000;
const PUBLISH_MS = 200;
const IDLE_PUBLISH_MS = 600;
const HEARTBEAT_MS = 4000;
const MAX_ATTEMPTS = 6;

export function sanitizeRoom(value) {
  const clean = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 16);
  return clean || 'lobby';
}

export function normalizeRelayUrl(value) {
  if (!value) return '';
  let url = String(value).trim();
  if (url.startsWith('https://')) url = `wss://${url.slice(8)}`;
  else if (url.startsWith('http://')) url = `ws://${url.slice(7)}`;
  if (!url.startsWith('wss://') && !url.startsWith('ws://')) return '';

  const withoutScheme = url.replace(/^wss?:\/\//, '');
  if (!withoutScheme.includes('/')) url = `${url}/ws`;
  return url;
}

/**
 * Alamat relay dan room: parameter URL menang atas env, env menang atas default.
 * `?relay=wss://…&room=kopi&token=…` enak untuk mencoba relay baru tanpa build.
 */
export function getRelayConfig(fallbackRoom = 'lobby') {
  if (typeof window === 'undefined') {
    return { url: '', room: sanitizeRoom(fallbackRoom), token: '' };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    url: normalizeRelayUrl(params.get('relay') || process.env.NEXT_PUBLIC_RELAY_URL || ''),
    room: sanitizeRoom(params.get('room') || fallbackRoom),
    token: params.get('token') || '',
  };
}

function clampNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createRelayClient({ url, room, token, name, color, onPlayers, onStatus, onChat }) {
  const others = new Map();

  let socket = null;
  let disposed = false;
  let failed = false;
  let attempt = 0;
  let retryTimer = null;
  let publishTimer = null;
  let pruneTimer = null;
  let heartbeatTimer = null;
  let readState = null;
  let lastSent = null;
  let lastSentAt = 0;

  function emit(status) {
    if (onStatus) onStatus(status);
  }

  function report() {
    if (!onPlayers) return;
    onPlayers([...others.values()].map((entry) => ({ ...entry })));
  }

  function upsert(player) {
    const existing = others.get(player.id);
    if (existing) {
      existing.name = String(player.name || existing.name).slice(0, 14);
      existing.color = typeof player.color === 'string' ? player.color : existing.color;
      return existing;
    }
    const entry = {
      id: player.id,
      name: String(player.name || 'Penjelajah').slice(0, 14),
      color: typeof player.color === 'string' ? player.color : '#9fe8ff',
      x: 0,
      y: 0,
      z: 0,
      ry: 0,
      t: Date.now(),
    };
    others.set(entry.id, entry);
    return entry;
  }

  function prune() {
    const now = Date.now();
    let changed = false;
    for (const [key, entry] of others) {
      if (now - entry.t > STALE_MS) {
        others.delete(key);
        changed = true;
      }
    }
    if (changed) report();
  }

  function send(payload) {
    if (socket && socket.readyState === 1) socket.send(JSON.stringify(payload));
  }

  function publish(force = false) {
    if (!readState) return;
    const current = readState();
    if (!current) return;

    const now = Date.now();
    const moved =
      !lastSent ||
      Math.abs(current.x - lastSent.x) > 0.03 ||
      Math.abs(current.y - lastSent.y) > 0.05 ||
      Math.abs(current.z - lastSent.z) > 0.03 ||
      Math.abs(current.ry - lastSent.ry) > 0.04;

    if (!force && !moved && now - lastSentAt < IDLE_PUBLISH_MS) return;

    lastSent = current;
    lastSentAt = now;
    send({ t: 's', x: current.x, y: current.y, z: current.z, ry: current.ry });
  }

  function stopTimers() {
    if (publishTimer) clearInterval(publishTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    publishTimer = null;
    heartbeatTimer = null;
  }

  function scheduleRetry() {
    if (disposed || failed) return;

    attempt += 1;
    if (attempt > MAX_ATTEMPTS) {
      failed = true;
      emit('failed');
      return;
    }

    const delay = Math.min(8000, 700 * 2 ** attempt);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  function handle(raw) {
    if (typeof raw !== 'string') return;

    let message = null;
    try {
      message = JSON.parse(raw);
    } catch (error) {
      return;
    }
    if (!message || typeof message !== 'object') return;

    if (message.t === 'chat' && message.id) {
      if (onChat) {
        const entry = others.get(message.id);
        onChat({
          id: message.id,
          name: (entry && entry.name) || String(message.name || 'Penjelajah').slice(0, 14),
          text: String(message.m || '').slice(0, 90),
        });
      }
      return;
    }

    if (message.t === 'roster' && Array.isArray(message.players)) {
      const ids = new Set();
      for (const player of message.players) {
        if (!player || !player.id) continue;
        ids.add(player.id);
        upsert(player);
      }
      for (const key of [...others.keys()]) {
        if (!ids.has(key)) others.delete(key);
      }
      report();
      return;
    }

    if (message.t === 'join' && message.player && message.player.id) {
      upsert(message.player);
      report();
      return;
    }

    if (message.t === 'leave' && message.id) {
      if (others.delete(message.id)) report();
      return;
    }

    if (message.t === 'state' && message.id) {
      const entry = others.get(message.id);
      if (!entry) return;
      entry.x = clampNumber(message.x);
      entry.y = clampNumber(message.y);
      entry.z = clampNumber(message.z);
      entry.ry = clampNumber(message.ry);
      entry.t = Date.now();
      report();
    }
  }

  function connect() {
    if (disposed || failed) return;

    emit(attempt === 0 ? 'connecting' : 'reconnecting');

    const params = new URLSearchParams({ room, name, color });
    if (token) params.set('token', token);

    let next = null;
    try {
      next = new WebSocket(`${url}?${params.toString()}`);
    } catch (error) {
      scheduleRetry();
      return;
    }

    socket = next;

    socket.onopen = () => {
      attempt = 0;
      emit('online');
      send({ t: 'hello', name, color });
      publish(true);
      if (!publishTimer) publishTimer = setInterval(() => publish(false), PUBLISH_MS);
      if (!heartbeatTimer) heartbeatTimer = setInterval(() => send({ t: 'ping' }), HEARTBEAT_MS);
    };

    socket.onmessage = (event) => handle(event.data);
    socket.onerror = () => {};
    socket.onclose = () => {
      stopTimers();
      emit('offline');
      scheduleRetry();
    };
  }

  function sendChat(value) {
    const clean = String(value == null ? '' : value).slice(0, 90).trim();
    if (!clean) return;
    send({ t: 'chat', m: clean });
  }

  function start(getState) {
    readState = getState;
    if (pruneTimer) clearInterval(pruneTimer);
    pruneTimer = setInterval(prune, 1000);
    connect();
  }

  function stop() {
    disposed = true;
    stopTimers();
    if (pruneTimer) clearInterval(pruneTimer);
    if (retryTimer) clearTimeout(retryTimer);
    pruneTimer = null;
    retryTimer = null;
    if (socket) {
      try {
        socket.close();
      } catch (error) {
        // sudah tertutup
      }
    }
    socket = null;
    others.clear();
  }

  return { start, stop, sendChat };
}
