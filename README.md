# Pulau Kabut

Open world low-poly di atas pulau berkabut. Isi nama penjelajah, gabung ke pulau yang sama
dengan pemain lain, lalu berjalan, lompat, dan meluncur di antara lembah untuk mengumpulkan
26 kristal cahaya — setiap kristal yang diambil mengikis kabut dan membuka pemandangan pulau.

- **Next.js 14** (App Router) + **Three.js**, tanpa aset: semua bentuk dan suara dibuat
  saat runtime.
- **Multiplayer** lewat lobby MQTT: pemain mengisi nama di halaman pertama, lalu posisi mereka
  bertukar ~4x/detik sehingga pemain lain terlihat di pulau yang sama.

## Menjalankan

```bash
npm install
npm run dev
```

Buka http://localhost:3000, isi nama penjelajah, lalu tap **Gabung ke pulau** (tap pertama
juga menyalakan audio, karena browser mensyaratkan gestur pengguna).

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
app/page.jsx               halaman game
components/Game.jsx         layar gabung (nama + warna) dan HUD React
lib/engine.js               renderer, fisika pemain, kamera, loop
lib/world.js                pulau prosedural, pohon, batu, kristal, langit
lib/audio.js                suara Web Audio (angin, langkah, lompat, kristal)
lib/mqtt.js                 klien MQTT 3.1.1 minimal di atas WebSocket (tanpa dependency)
lib/net.js                  lobby: publish/subscribe topik, fallback ke /api/presence
app/api/presence/route.js   endpoint cadangan kehadiran
```

## Multiplayer

Halaman pertama minta **nama penjelajah** dan warna. Setelah **Gabung ke pulau**, posisi
dikirim ~4x/detik ke satu topik MQTT dan pemain lain muncul di pulau sebagai karakter
berlabel nama mereka. HUD atas menampilkan jumlah penjelajah beserta nama yang sedang online.

- Broker: `wss://broker.hivemq.com:8884/mqtt` — broker uji publik HiveMQ, tanpa akun dan
  tanpa kunci. Karena semua klien berbagi satu topik, pemain tetap saling melihat walau
  Vercel menaruh tiap request di instance function yang berbeda; penyimpanan in-memory tidak
  bisa melakukan itu.
- Kalau broker tidak bisa dihubungi (jaringan kantor, broker uji sedang down), aplikasi
  otomatis jatuh ke polling `/api/presence` yang berbasis memori instance. Di Vercel mode
  cadangan itu bisa jadi tidak saling melihat.
- Topiknya publik: siapa pun yang tahu `pulau-kabut/v1/lobby` bisa melihat posisi dan nama.
  Untuk pemakaian serius, ganti `BROKER`/`TOPIC` di `lib/net.js` ke broker berautentikasi,
  atau pindahkan lobby ke Upstash Redis / Vercel KV.

Dunia dibuat deterministik dari noise yang sama di setiap klien, jadi posisi yang dikirim
ke server selalu masuk akal di klien lain tanpa perlu menyinkronkan world state.

## Deploy

Live di Vercel: **https://pulau-kabut.vercel.app** (project `pulau-kabut`, tim
`fandys-projects-88486d38`, framework Next.js, Node 22.x). Repo GitHub-nya public:
**https://github.com/fandyajpo/pulau-kabut**.

Deploy manual dari mesin yang punya Vercel CLI:

```bash
git clone https://github.com/fandyajpo/pulau-kabut.git
cd pulau-kabut
vercel link --project pulau-kabut --scope fandys-projects-88486d38
vercel deploy --prod --yes --scope fandys-projects-88486d38
```

Deploy dari branch/commit tanpa folder lokal:

```bash
vercel api /v13/deployments --method POST --scope fandys-projects-88486d38 \
  --input <(echo '{"name":"pulau-kabut","target":"production","gitSource":{"type":"github","org":"fandyajpo","repo":"pulau-kabut","ref":"main"}}')
```

Catatan: `git push` belum memicu deploy otomatis. Vercel masih menjawab "To link a
GitHub repository, you need to install the GitHub integration first" — artinya Vercel
GitHub App (https://github.com/apps/vercel) belum mencakup repo ini. Setelah app itu
dipasang untuk akun `fandyajpo` dengan repo `pulau-kabut`, deploy otomatis langsung
aktif. Sebelum itu, deploy dilakukan lewat perintah di atas.

Proyek ini juga punya `Dockerfile`, jadi bisa dijalankan sebagai container kalau perlu.
