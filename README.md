# Pulau Kabut

Open world low-poly di atas pulau berkabut. Berjalan, lompat, dan meluncur di antara
lembah untuk mengumpulkan 26 kristal cahaya — setiap kristal yang diambil mengikis kabut
dan membuka pemandangan pulau.

- **Next.js 14** (App Router) + **Three.js**, tanpa aset: semua bentuk dan suara dibuat
  saat runtime.
- **Multiplayer** lewat `/api/presence`: posisi pemain dikirim tiap ~420 ms dan pemain lain
  muncul sebagai penjelajah berlabel nama.

## Menjalankan

```bash
npm install
npm run dev
```

Buka http://localhost:3000, lalu tap **Mulai menjelajah** (tap pertama juga menyalakan
audio, karena browser mensyaratkan gestur pengguna).

## Kontrol

| Aksi | Keyboard | Sentuh |
| --- | --- | --- |
| Jalan | WASD / panah | stik di sisi kiri |
| Lihat | gerakkan mouse (klik dulu untuk pointer lock) | geser sisi kanan |
| Lompat | Space | tombol **Lompat** |
| Meluncur | tahan Space saat di udara | tahan tombol **Lompat** |
| Lari | Shift | — |
| Zoom kamera | scroll | — |

## Struktur

```
app/page.jsx              halaman game
components/Game.jsx        HUD React (skor, kabut, tombol mulai/lompat)
lib/engine.js              renderer, fisika pemain, kamera, loop
lib/world.js               pulau prosedural, pohon, batu, kristal, langit
lib/audio.js               suara Web Audio (angin, langkah, lompat, kristal)
lib/net.js                 klien kehadiran pemain
app/api/presence/route.js  endpoint kehadiran
```

## Multiplayer: yang jujur soal Vercel

`app/api/presence/route.js` menyimpan pemain di memori instance server. Di dev dan saat
dua pemain jatuh ke instance yang sama, mereka saling terlihat; di Vercel tiap instance
punya memori sendiri, jadi bisa jadi tidak saling melihat. Untuk multiplayer sungguhan,
ganti isi `store` di route itu dengan **Upstash Redis / Vercel KV** (atau pindah ke
Partykit untuk websocket) — bentuk fungsinya sengaja dibuat sesederhana itu.

Dunia dibuat deterministik dari noise yang sama di setiap klien, jadi posisi yang dikirim
ke server selalu masuk akal di klien lain tanpa perlu menyinkronkan world state.

## Deploy

Proyek ini punya `Dockerfile`, jadi bisa dijalankan sebagai server app. Di Vercel cukup
import repo-nya dan deploy apa adanya (Next.js terdeteksi otomatis).
