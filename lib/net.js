import { createMqttClient } from './mqtt';

// Lobby publik: semua pemain bertemu di satu topik MQTT, jadi mereka tetap
// saling melihat walau Vercel menaruh tiap request di instance function yang
// berbeda. Broker publik ini tanpa akun dan tanpa kunci.
const BROKER = 'wss://broker.hivemq.com:8884/mqtt';
const TOPIC = 'pulau-kabut/v1/lobby';

const PUBLISH_MS = 250;
const STALE_MS = 6000;
const HTTP_TICK_MS = 500;
const FALLBACK_AFTER_MS = 7000;

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

/**
 * Kehadiran pemain: kirim posisi sendiri, terima posisi pemain lain.
 * Jalur utama MQTT (real-time, lintas instance). Kalau broker tidak bisa
 * dihubungi, jatuh ke polling /api/presence supaya tetap ada sesuatu.
 */
export function createPresence({ name, color, onPlayers, onStatus }) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const others = new Map();

  let client = null;
  let readState = null;
  let publishTimer = null;
  let pruneTimer = null;
  let httpTimer = null;
  let fallbackTimer = null;
  let usingMqtt = false;

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

  function publish() {
    if (!readState || !client) return;
    const state = readState();
    client.publish(
      TOPIC,
      JSON.stringify({
        id,
        n: name,
        c: color,
        x: state.x,
        y: state.y,
        z: state.z,
        ry: state.ry,
      }),
    );
  }

  function startHttpFallback() {
    if (httpTimer || usingMqtt) return;

    const tick = async () => {
      if (!readState) return;
      try {
        const state = readState();
        const response = await fetch('/api/presence', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, name, color, ...state }),
          cache: 'no-store',
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!Array.isArray(data?.players)) return;

        const seen = new Set();
        for (const entry of data.players) {
          if (!entry?.id) continue;
          seen.add(entry.id);
          others.set(entry.id, {
            id: entry.id,
            name: String(entry.name || 'Penjelajah').slice(0, 14),
            color: entry.color || '#9fe8ff',
            x: clampNumber(entry.x),
            y: clampNumber(entry.y),
            z: clampNumber(entry.z),
            ry: clampNumber(entry.ry),
            t: Date.now(),
          });
        }
        for (const key of [...others.keys()]) {
          if (!seen.has(key)) others.delete(key);
        }
        report();
      } catch (error) {
        // jaringan bermasalah: biarkan permainan jalan sendiri
      }
    };

    tick();
    httpTimer = setInterval(tick, HTTP_TICK_MS);
  }

  function start(getState) {
    readState = getState;

    client = createMqttClient({ url: BROKER, clientId: `pulau-${id}` });

    client.onStatus((status) => {
      if (onStatus) onStatus(status);
      if (status === 'online') {
        usingMqtt = true;
        if (httpTimer) {
          clearInterval(httpTimer);
          httpTimer = null;
        }
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
      }
    });

    client.onOpen(() => {
      client.subscribe(TOPIC);
      publish();
      if (!publishTimer) publishTimer = setInterval(publish, PUBLISH_MS);
    });

    client.onMessage((topic, payload) => {
      if (topic !== TOPIC) return;
      let data = null;
      try {
        data = JSON.parse(payload);
      } catch (error) {
        return;
      }
      if (!data || !data.id || data.id === id) return;

      others.set(data.id, {
        id: data.id,
        name: String(data.n || 'Penjelajah').slice(0, 14),
        color: typeof data.c === 'string' ? data.c : '#9fe8ff',
        x: clampNumber(data.x),
        y: clampNumber(data.y),
        z: clampNumber(data.z),
        ry: clampNumber(data.ry),
        t: Date.now(),
      });
      report();
    });

    client.connect();

    pruneTimer = setInterval(prune, 1000);
    fallbackTimer = setTimeout(() => {
      if (!usingMqtt) startHttpFallback();
    }, FALLBACK_AFTER_MS);
  }

  function stop() {
    if (publishTimer) clearInterval(publishTimer);
    if (pruneTimer) clearInterval(pruneTimer);
    if (httpTimer) clearInterval(httpTimer);
    if (fallbackTimer) clearTimeout(fallbackTimer);
    publishTimer = null;
    pruneTimer = null;
    httpTimer = null;
    fallbackTimer = null;
    if (client) client.close();
    client = null;
    others.clear();
  }

  return { id, start, stop };
}
