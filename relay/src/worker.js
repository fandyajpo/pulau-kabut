// Relay WebSocket untuk Pulau Kabut: satu Durable Object per room.
//
// Deploy: lihat relay/README.md (`npx wrangler deploy`).
// Kunci opsional: set `RELAY_TOKEN` sebagai secret worker; klien harus mengirim
// `?token=<nilai>` untuk boleh masuk.

import { Room } from './room.js';

const ROOM_PATTERN = /[^a-z0-9-]/g;

function roomName(url) {
  const raw = (url.searchParams.get('room') || 'lobby').toLowerCase();
  const clean = raw.replace(ROOM_PATTERN, '').slice(0, 16);
  return clean || 'lobby';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname !== '/ws') {
      return new Response('Pulau Kabut relay — sambung ke /ws', {
        status: 200,
        headers: { 'cache-control': 'no-store' },
      });
    }

    const upgrade = String(request.headers.get('Upgrade') || '').toLowerCase();
    if (upgrade !== 'websocket') {
      return new Response('expected websocket upgrade', { status: 426 });
    }

    if (env.RELAY_TOKEN) {
      const token = url.searchParams.get('token') || '';
      if (token !== env.RELAY_TOKEN) {
        return new Response('unauthorized', { status: 401 });
      }
    }

    const stub = env.LOBBY.get(env.LOBBY.idFromName(roomName(url)));
    return stub.fetch(request);
  },
};

export class Lobby {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.room = null;
    this.sweepTimer = null;
  }

  ensureSweep() {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      this.room.sweep();
      if (this.room.clients.size === 0) {
        clearInterval(this.sweepTimer);
        this.sweepTimer = null;
      }
    }, 5000);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (!this.room) this.room = new Room(roomName(url));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const entry = this.room.add(server, {
      name: url.searchParams.get('name'),
      color: url.searchParams.get('color'),
    });

    if (!entry) {
      try {
        server.close(1013, 'room penuh');
      } catch (error) {
        // sudah tertutup
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    server.addEventListener('message', (event) => this.room.handle(entry, event.data));
    server.addEventListener('close', () => this.room.remove(entry));
    server.addEventListener('error', () => this.room.remove(entry));

    this.ensureSweep();

    return new Response(null, { status: 101, webSocket: client });
  }
}
