import { createMqttClient } from './mqtt';
import { createRelayClient, getRelayConfig, sanitizeRoom } from './relay';

// Tiga jalur, dicoba berurutan sampai satu berhasil:
//   1. relay WebSocket sendiri (Cloudflare Worker + Durable Object, lihat relay/)
//   2. broker MQTT publik HiveMQ (cadangan tanpa akun)
//   3. polling /api/presence (cadangan terakhir, memori instance)
const BROKER = 'wss://broker.hivemq.com:8884/mqtt';
const TOPIC_PREFIX = 'pulau-kabut/v1/';

const PUBLISH_MS = 250;
const STALE_MS = 6000;
const HTTP_TICK_MS = 500;
const MQTT_GRACE_MS = 7000;

export const COLORS = ['#9fe8ff', '#ffd79a', '#b7a4ff', '#a6f0c3', '#ffa8c4', '#ffe9a8'];

const NAME_POOL = [
  'Arun',
  'Bima',
  'Citra',
  'Daru',
  'Elang',
  'Gita',
  'Hana',
  'Indra',
  'Jaka',
  'Kirana',
  'Laras',
  'Maya',
  'Nusa',
  'Oki',
  'Puri',
  'Raka',
  'Sari',
  'Tirta',
  'Umar',
  'Wulan',
];

export function randomName() {
  const base = NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
  return `${base}${Math.floor(Math.random() * 90 + 10)}`;
}

export function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function clampNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function randomId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Daftar pemain lain untuk satu jalur, dengan pemangkasan pemain yang diam. */
function createRoster(onPlayers) {
  const others = new Map();
  let timer = null;

  function report() {
    if (!onPlayers) return;
    onPlayers([...others.values()].map((entry) => ({ ...entry })));
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

  return {
    set(entry) {
      others.set(entry.id, { ...entry, t: Date.now() });
    },
    get(id) {
      return others.get(id);
    },
    keep(ids) {
      let changed = false;
      for (const key of [...others.keys()]) {
        if (!ids.has(key)) {
          others.delete(key);
          changed = true;
        }
      }
      if (changed) report();
    },
    report,
    start() {
      if (!timer) timer = setInterval(prune, 1000);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      others.clear();
    },
  };
}

export function createPresence({ name, color, room = 'lobby', onPlayers, onStatus, onChat }) {
  const id = randomId();
  const config = getRelayConfig(room);
  const activeRoom = config.room || sanitizeRoom(room);
  const topic = `${TOPIC_PREFIX}${activeRoom}`;

  let readState = null;
  let active = null;
  let stage = 'idle';

  function state() {
    if (readState) return readState();
    return { x: 0, y: 0, z: 0, ry: 0 };
  }

  function report(status, transport) {
    if (onStatus) onStatus(status, transport);
  }

  function use(transport) {
    if (active) active.stop();
    active = transport;
  }

  function startRelay() {
    stage = 'relay';

    const client = createRelayClient({
      url: config.url,
      room: activeRoom,
      token: config.token,
      name,
      color,
      onPlayers,
      onChat: (entry) => {
        if (onChat) onChat(entry);
      },
      onStatus: (status) => {
        report(status, 'relay');
        if (status === 'failed') {
          client.stop();
          if (active === client) active = null;
          startMqtt();
        }
      },
    });

    use({
      stop() {
        client.stop();
      },
      chat(text) {
        client.sendChat(text);
      },
    });
    client.start(state);
  }

  function startMqtt() {
    stage = 'mqtt';

    const roster = createRoster(onPlayers);
    roster.start();

    const client = createMqttClient({ url: BROKER, clientId: `pulau-${id}` });
    let publishTimer = null;
    let connected = false;

    const graceTimer = setTimeout(() => {
      if (connected) return;
      client.close();
      roster.stop();
      startHttp();
    }, MQTT_GRACE_MS);

    function publish() {
      const current = state();
      client.publish(
        topic,
        JSON.stringify({
          id,
          n: name,
          c: color,
          x: current.x,
          y: current.y,
          z: current.z,
          ry: current.ry,
        }),
      );
    }

    client.onStatus((status) => {
      report(status, 'mqtt');
      if (status === 'online') {
        connected = true;
        clearTimeout(graceTimer);
      }
    });

    client.onOpen(() => {
      client.subscribe(topic);
      publish();
      if (!publishTimer) publishTimer = setInterval(publish, PUBLISH_MS);
    });

    client.onMessage((incoming, payload) => {
      if (incoming !== topic) return;

      let data = null;
      try {
        data = JSON.parse(payload);
      } catch (error) {
        return;
      }
      if (!data || !data.id || data.id === id) return;

      if (data.t === 'chat') {
        if (onChat) {
          const entry = roster.get(data.id);
          onChat({
            id: data.id,
            name: (entry && entry.name) || String(data.n || 'Penjelajah').slice(0, 14),
            text: String(data.m || '').slice(0, 90),
          });
        }
        return;
      }

      roster.set({
        id: data.id,
        name: String(data.n || 'Penjelajah').slice(0, 14),
        color: typeof data.c === 'string' ? data.c : '#9fe8ff',
        x: clampNumber(data.x),
        y: clampNumber(data.y),
        z: clampNumber(data.z),
        ry: clampNumber(data.ry),
      });
      roster.report();
    });

    client.connect();

    use({
      stop() {
        clearTimeout(graceTimer);
        if (publishTimer) clearInterval(publishTimer);
        publishTimer = null;
        roster.stop();
        client.close();
      },
      chat(body) {
        client.publish(topic, JSON.stringify({ id, n: name, t: 'chat', m: body }));
      },
    });
  }

  function startHttp() {
    if (stage === 'http') return;
    stage = 'http';

    const roster = createRoster(onPlayers);
    roster.start();
    report('online', 'http');

    const tick = async () => {
      if (!readState) return;
      try {
        const current = readState();
        const response = await fetch('/api/presence', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, name, color, ...current }),
          cache: 'no-store',
        });
        if (!response.ok) return;

        const data = await response.json();
        if (!Array.isArray(data?.players)) return;

        const ids = new Set();
        for (const entry of data.players) {
          if (!entry?.id) continue;
          ids.add(entry.id);
          roster.set({
            id: entry.id,
            name: String(entry.name || 'Penjelajah').slice(0, 14),
            color: entry.color || '#9fe8ff',
            x: clampNumber(entry.x),
            y: clampNumber(entry.y),
            z: clampNumber(entry.z),
            ry: clampNumber(entry.ry),
          });
        }
        roster.keep(ids);
        roster.report();
      } catch (error) {
        // jaringan bermasalah: biarkan permainan jalan sendiri
      }
    };

    tick();
    const timer = setInterval(tick, HTTP_TICK_MS);

    use({
      stop() {
        clearInterval(timer);
        roster.stop();
      },
    });
  }

  function start(getState) {
    readState = getState;
    if (config.url) startRelay();
    else startMqtt();
  }

  function stop() {
    if (active) active.stop();
    active = null;
    stage = 'idle';
  }

  function chat(value) {
    const clean = String(value == null ? '' : value).slice(0, 90).trim();
    if (!clean) return;
    if (active && active.chat) active.chat(clean);
  }

  return { id, room: activeRoom, chat, start, stop };
}
