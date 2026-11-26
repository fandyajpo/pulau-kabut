// Kehadiran pemain lain di pulau yang sama.
//
// Penyimpanannya in-memory: cukup untuk dev lokal dan untuk beberapa pemain yang
// kebetulan mendarat di instance server yang sama. Di Vercel tiap instance punya
// memori sendiri, jadi untuk multiplayer sungguhan ganti `store` di bawah dengan
// Upstash Redis / Vercel KV — bentuk fungsinya sengaja dibuat sesederhana itu.

const TTL = 9000;
const MAX_PLAYERS = 24;

const globalStore = globalThis.__pulauKabutPresence || new Map();
globalThis.__pulauKabutPresence = globalStore;

export const dynamic = 'force-dynamic';

function prune(now) {
  for (const [id, entry] of globalStore) {
    if (now - entry.t > TTL) globalStore.delete(id);
  }
}

function readNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export async function POST(request) {
  const now = Date.now();

  let body = null;
  try {
    body = await request.json();
  } catch (error) {
    return Response.json({ players: [], error: 'invalid body' }, { status: 400 });
  }

  const id = String(body?.id || '').slice(0, 32);

  if (id) {
    globalStore.set(id, {
      name: String(body.name || 'Penjelajah').slice(0, 16),
      color: String(body.color || '#9fe8ff').slice(0, 16),
      x: readNumber(body.x, 0),
      y: readNumber(body.y, 0),
      z: readNumber(body.z, 0),
      ry: readNumber(body.ry, 0),
      t: now,
    });
    prune(now);
  }

  const players = [];
  for (const [otherId, entry] of globalStore) {
    if (otherId === id) continue;
    players.push({
      id: otherId,
      name: entry.name,
      color: entry.color,
      x: entry.x,
      y: entry.y,
      z: entry.z,
      ry: entry.ry,
    });
    if (players.length >= MAX_PLAYERS) break;
  }

  return Response.json({ players }, { headers: { 'cache-control': 'no-store' } });
}

export async function GET() {
  prune(Date.now());
  return Response.json({ online: globalStore.size }, { headers: { 'cache-control': 'no-store' } });
}
