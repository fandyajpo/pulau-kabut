// Logika lobby yang dipakai Durable Object.
//
// Kelas ini sengaja tidak menyentuh API Cloudflare sama sekali: cukup objek
// socket dengan `send(text)`. Dengan begitu logikanya bisa diuji di Node.

const MAX_CLIENTS = 24;
const MAX_MESSAGES_PER_SECOND = 24;
const MAX_IDLE_MS = 20000;

const DEFAULT_COLOR = '#9fe8ff';

function text(value, max) {
  const raw = String(value == null ? '' : value).trim();
  return raw.slice(0, max);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : fallback;
}

function send(socket, payload) {
  try {
    socket.send(JSON.stringify(payload));
  } catch (error) {
    // socket sudah putus; sweep akan membersihkannya
  }
}

export function publicPlayer(client) {
  return { id: client.id, name: client.name, color: client.color };
}

export class Room {
  constructor(name = 'lobby') {
    this.name = name;
    this.clients = new Map();
    this.counter = 0;
  }

  add(socket, meta = {}) {
    if (this.clients.size >= MAX_CLIENTS) {
      send(socket, { t: 'error', message: 'room penuh' });
      return null;
    }

    this.counter += 1;
    const client = {
      id: `p${this.counter}`,
      socket,
      name: text(meta.name, 14) || `Penjelajah${this.counter}`,
      color: text(meta.color, 9) || DEFAULT_COLOR,
      windowStart: Date.now(),
      count: 0,
      seen: Date.now(),
    };

    this.clients.set(client.id, client);

    send(socket, { t: 'welcome', id: client.id, room: this.name });
    send(socket, { t: 'roster', players: this.roster(client.id) });
    this.broadcast({ t: 'join', player: publicPlayer(client) }, client.id);

    return client;
  }

  remove(client) {
    if (!client) return;
    if (this.clients.delete(client.id)) {
      this.broadcast({ t: 'leave', id: client.id });
    }
  }

  handle(client, raw) {
    if (!client || !this.clients.has(client.id)) return;

    const now = Date.now();
    client.seen = now;

    if (now - client.windowStart > 1000) {
      client.windowStart = now;
      client.count = 0;
    }
    client.count += 1;
    if (client.count > MAX_MESSAGES_PER_SECOND) return;

    let message = null;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch (error) {
      return;
    }
    if (!message || typeof message !== 'object') return;

    if (message.t === 'hello') {
      client.name = text(message.name, 14) || client.name;
      client.color = text(message.color, 9) || client.color;
      this.broadcast({ t: 'join', player: publicPlayer(client) }, client.id);
      return;
    }

    if (message.t === 's') {
      this.broadcast(
        {
          t: 'state',
          id: client.id,
          x: number(message.x),
          y: number(message.y),
          z: number(message.z),
          ry: number(message.ry),
        },
        client.id,
      );
    }
  }

  roster(exceptId) {
    return [...this.clients.values()]
      .filter((client) => client.id !== exceptId)
      .map(publicPlayer);
  }

  broadcast(message, exceptId) {
    const payload = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.id === exceptId) continue;
      try {
        client.socket.send(payload);
      } catch (error) {
        // socket sudah putus; sweep akan membersihkannya
      }
    }
  }

  sweep(maxIdleMs = MAX_IDLE_MS) {
    const now = Date.now();
    for (const client of [...this.clients.values()]) {
      if (now - client.seen <= maxIdleMs) continue;
      this.remove(client);
      try {
        client.socket.close(1001, 'idle');
      } catch (error) {
        // sudah tertutup
      }
    }
  }
}
