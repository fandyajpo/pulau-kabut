# Pulau Kabut

Open world low-poly di atas pulau berkabut. Isi nama penjelajah, gabung ke pulau yang sama
dengan pemain lain, lalu berjalan, lompat, dan meluncur di antara lembah untuk mengumpulkan
26 kristal cahaya — setiap kristal yang diambil mengikis kabut dan membuka pemandangan pulau.

- **Next.js 14** (App Router) + **Three.js**, tanpa aset: semua bentuk dan suara dibuat
  saat runtime.
- **Multiplayer** lewat relay WebSocket sendiri (Cloudflare Worker + Durable Object per
  room): pemain mengisi nama dan room di halaman pertama, lalu posisi mereka bertukar
  sehingga pemain lain terlihat di pulau yang sama.

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
components/Game.jsx         layar gabung (nama + room + warna) dan HUD React
lib/engine.js               renderer, fisika pemain, kamera, loop
lib/world.js                pulau prosedural, pohon, batu, kristal, langit
lib/audio.js                suara Web Audio (angin, langkah, lompat, kristal)
lib/relay.js                klien relay WebSocket (jalur utama)
lib/net.js                  pilih jalur: relay → MQTT → /api/presence
lib/mqtt.js                 klien MQTT 3.1.1 minimal di atas WebSocket (cadangan)
app/api/presence/route.js   endpoint cadangan kehadiran
app/human/page.jsx          studio manusia (bukan bagian game)
components/HumanLab.jsx     UI inspeksi: kamera, gerak, gestur, ekspresi, cahaya
lib/human/surface.js        loft/sweep, bobot kulit, pembalik normal
lib/human/body.js           rangka 50 tulang + badan, tangan, kaki, wajah, pakaian
lib/human/materials.js      kulit/kain/mata prosedural + perkiraan SSS
lib/human/motion.js         napas, jalan, lari, duduk, gestur, ekspresi, kedip
lib/human/lab.js            renderer studio, cahaya, kamera, loop
relay/                      relay Cloudflare Worker + Durable Object per room
```

## Multiplayer

Halaman pertama minta **nama penjelajah**, **room**, dan warna. Setelah **Gabung ke pulau**,
posisi dikirim ke relay dan pemain lain muncul di pulau sebagai karakter berlabel nama
mereka. HUD atas menampilkan jumlah penjelajah, room, jalur koneksi, dan nama yang online.

Tiga jalur dicoba berurutan sampai satu berhasil:

1. **Relay WebSocket sendiri** (`relay/`) — Cloudflare Worker + satu Durable Object per
   room, jadi semua pemain di room yang sama bertemu object yang sama dan pesannya disiarkan
   langsung. Ini jalur yang dipakai kalau `NEXT_PUBLIC_RELAY_URL` diisi.
2. **Broker MQTT publik** `wss://broker.hivemq.com:8884/mqtt` — cadangan tanpa akun kalau
   relay belum dipasang atau tidak bisa dihubungi.
3. **Polling `/api/presence`** — cadangan terakhir, berbasis memori instance; di Vercel bisa
   jadi tidak saling melihat.

Memasang relay (sekali saja):

```bash
cd relay
npm install
npx wrangler login
npx wrangler deploy
```

Lalu isi `NEXT_PUBLIC_RELAY_URL` di Vercel (Project → Settings → Environment Variables)
dengan `wss://pulau-kabut-relay.<akun>.workers.dev/ws`, dan deploy ulang aplikasinya.
Untuk lokal cukup `NEXT_PUBLIC_RELAY_URL=ws://127.0.0.1:8787/ws` di `.env.local` sambil
menjalankan `npx wrangler dev` di folder `relay`.

- Tanpa relay, game tetap jalan lewat MQTT, tapi topiknya publik: siapa pun yang tahu
  `pulau-kabut/v1/<room>` bisa melihat posisi dan nama.
- Relay bisa dikunci: `npx wrangler secret put RELAY_TOKEN`, lalu bagikan link dengan
  `?token=<nilai>`. Detail protokol dan batasannya ada di [relay/README.md](relay/README.md).
- Room dipilih di halaman gabung (atau `?room=kopi` di URL), jadi teman cukup diberi link
  yang sama. Batas relay: 24 pemain per room.

### Chat di atas kepala

Tap kolom **Katakan sesuatu…** di bawah layar, tulis pesan, lalu Enter/Kirim. Balonnya
muncul di atas kepala karaktermu dan di atas kepala pemain lain di room itu selama ~7 detik.

- Tidak ada database: relay hanya menyiarkan pesan ke pemain lain sekali, lalu melupakannya.
  Tidak ada riwayat saat bergabung, tidak ada yang disimpan di server.
- Batas: 90 huruf, satu baris, 8 pesan per 5 detik per pemain.
- Jalur relay dan MQTT sama-sama menyiarkan chat; jalur cadangan `/api/presence` tidak.
- Saat mengetik di kolom chat, WASD/Space tidak menggerakkan pemain.

Dunia dibuat deterministik dari noise yang sama di setiap klien, jadi posisi yang dikirim
ke server selalu masuk akal di klien lain tanpa perlu menyinkronkan world state.

## Studio manusia (`/human`)

Halaman terpisah dari game: studi anatomi prosedural, bukan avatar low-poly.

- **Rangka 50 tulang**: panggul → tulang belakang → dada → leher → kepala;
  selangka → lengan atas → lengan bawah → tangan → 5 jari × 3 falang (ibu jari 2);
  panggul → paha → betis → tumit → jari kaki. Bobot kulit dihitung dari jarak tiap
  vertex ke segmen tulang (4 tulang terdekat), jadi permukaan tidak pecah saat ditekuk.
- **Bentuk badan** dari loft irisan melintang, bukan bola/silinder terpisah: panggul,
  pinggang, rusuk, bahu, rahang, tulang pipi, hidung, bibir, telinga, telapak, dan kaki.
- **Wajah**: 5 morph target (senyum, cemberut, terkejut, marah, sedih), kedip lewat
  kelopak, mata dengan iris melengkung + kornea + pantulan, alis dan bulu mata instanced.
- **Gerak**: diam bernapas, jalan dengan heel strike–toe off dan rotasi panggul/bahu
  berlawanan, lari, duduk di bangku, serta gestur tangan (telapak, genggam, menunjuk,
  jempol, melambai, silang, cubit) dengan lengkung jari terpisah.
- **Material**: kulit prosedural (pori, kerutan, roughness/normal map, clearcoat, sebaran
  cahaya hangat sebagai perkiraan SSS) dan kain tenun; pakaian berupa mesh terpisah yang
  mengikuti badan.
- **Render**: WebGLRenderer + ACES, PMREM environment studio, key/fill/rim dengan bayangan
  lembut, OrbitControls, preset kamera depan/3-4/samping/belakang/wajah/tangan/kaki,
  preset cahaya, putar otomatis, dan kualitas adaptif.

Jujur soal batasnya: ini **bukan fotorealistis**. Pori, rambut per helai, SSS sungguhan,
lipatan kain dinamis, dan likeness wajah butuh aset hasil sculpt/scan plus blendshape yang
di-author — bukan geometri prosedural. Yang ini studi anatomi interaktif yang bisa diputar
dan digerakkan, bukan pengganti digital human kelas studio.

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
