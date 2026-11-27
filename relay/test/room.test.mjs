import assert from 'node:assert/strict';
import { Room } from '../src/room.js';

function fakeSocket(label) {
  const received = [];
  const socket = {
    label,
    closed: false,
    received,
    send(text) {
      received.push(JSON.parse(text));
    },
    close() {
      socket.closed = true;
    },
    of(type) {
      return received.filter((message) => message.t === type);
    },
  };
  return socket;
}

// 1. Gabung: pemain kedua mendapat roster, pemain pertama mendapat kabar join.
{
  const room = new Room('lobby');
  const a = fakeSocket('a');
  const b = fakeSocket('b');

  const first = room.add(a, { name: 'Bima', color: '#9fe8ff' });
  const second = room.add(b, { name: 'Citra', color: '#ffd79a' });

  assert.equal(a.of('welcome')[0].id, 'p1');
  assert.equal(b.of('welcome')[0].id, 'p2');
  assert.deepEqual(b.of('roster')[0].players, [{ id: 'p1', name: 'Bima', color: '#9fe8ff' }]);
  assert.deepEqual(a.of('join')[0].player, { id: 'p2', name: 'Citra', color: '#ffd79a' });

  // 2. Posisi disiarkan ke yang lain, bukan ke pengirim.
  room.handle(first, JSON.stringify({ t: 's', x: 1.234, y: 2, z: -3, ry: 0.5 }));
  assert.equal(b.of('state')[0].x, 1.23);
  assert.equal(a.of('state').length, 0);

  // 3. Keluar: sisa pemain diberi kabar.
  room.remove(second);
  assert.equal(a.of('leave').length, 1);
  assert.equal(room.clients.size, 1);
}

// 4. Batas laju: pesan ke-25 dalam satu detik diabaikan.
{
  const room = new Room('lobby');
  const a = fakeSocket('a');
  const b = fakeSocket('b');
  room.add(a, { name: 'A' });
  room.add(b, { name: 'B' });

  const watcher = room.clients.get('p2');
  for (let i = 0; i < 40; i += 1) {
    room.handle(watcher, JSON.stringify({ t: 's', x: i, y: 0, z: 0, ry: 0 }));
  }
  assert.equal(a.of('state').length, 24);
  assert.equal(b.of('state').length, 0);
}

// 5. Room penuh: pemain ke-25 ditolak.
{
  const room = new Room('lobby');
  for (let i = 0; i < 24; i += 1) room.add(fakeSocket(`s${i}`), { name: `P${i}` });

  const extra = fakeSocket('extra');
  const entry = room.add(extra, { name: 'Terlalu' });
  assert.equal(entry, null);
  assert.equal(extra.of('error')[0].message, 'room penuh');
}

// 6. Nama dirapikan dan dibatasi panjangnya.
{
  const room = new Room('lobby');
  const a = fakeSocket('a');
  const client = room.add(a, { name: '  NamaYangSangatPanjangSekali  ', color: '#fff' });
  assert.equal(client.name, 'NamaYangSangat');
  assert.equal(client.color, '#fff');
}

// 7. Chat: disiarkan ke yang lain, tidak disimpan, dan dirapikan.
{
  const room = new Room('lobby');
  const a = fakeSocket('a');
  const b = fakeSocket('b');
  const first = room.add(a, { name: 'Bima' });
  room.add(b, { name: 'Citra' });

  room.handle(first, JSON.stringify({ t: 'chat', m: '  halo   pulau!\n  ' }));
  const chat = b.of('chat')[0];
  assert.equal(chat.m, 'halo pulau!');
  assert.equal(chat.name, 'Bima');
  assert.equal(a.of('chat').length, 0);

  // Batas laju chat: 8 pesan per 5 detik.
  for (let i = 0; i < 20; i += 1) {
    room.handle(first, JSON.stringify({ t: 'chat', m: `pesan ${i}` }));
  }
  assert.equal(b.of('chat').length, 8);

  // Teks kosong dan terlalu panjang tidak disiarkan.
  const empty = new Room('lobby');
  const c = fakeSocket('c');
  const d = fakeSocket('d');
  const third = empty.add(c, { name: 'Daru' });
  empty.add(d, { name: 'Elang' });
  empty.handle(third, JSON.stringify({ t: 'chat', m: '   ' }));
  empty.handle(third, JSON.stringify({ t: 'chat', m: 'x'.repeat(200) }));
  assert.equal(d.of('chat').length, 1);
  assert.equal(d.of('chat')[0].m.length, 90);
}

console.log('room.test: 7 pemeriksaan lulus');
