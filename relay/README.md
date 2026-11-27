# Relay Pulau Kabut

Server WebSocket kecil di Cloudflare Workers: satu **Durable Object** per room, jadi
semua pemain di room yang sama bertemu object yang sama dan pesan mereka disiarkan
langsung — tanpa broker publik dan tanpa autentikasi pihak ketiga.

## Deploy

```bash
cd relay
npm install
npx wrangler login       # sekali saja, buka browser
npx wrangler deploy
```

Hasilnya sesuatu seperti:

```
https://pulau-kabut-relay.<akun-kamu>.workers.dev
```

Lalu pasang URL WebSocket-nya ke aplikasi:

| Tempat | Variabel | Nilai |
| --- | --- | --- |
| Vercel (Project → Settings → Environment Variables) | `NEXT_PUBLIC_RELAY_URL` | `wss://pulau-kabut-relay.<akun>.workers.dev/ws` |
| Lokal | `.env.local` | `NEXT_PUBLIC_RELAY_URL=ws://127.0.0.1:8787/ws` |

Sesudah variabel itu diisi, deploy ulang aplikasinya. Tanpa variabel itu, game tetap
jalan memakai broker MQTT publik sebagai cadangan.

## Kunci opsional

```bash
cd relay
npx wrangler secret put RELAY_TOKEN
```

Dengan secret itu terpasang, setiap sambungan wajib membawa `?token=<nilai>`. Klien
mengambilnya dari parameter URL `?token=` — jadi cukup bagikan link bertoken kepada
yang boleh ikut. Tanpa secret, relay menerima siapa pun yang tahu URL-nya.

## Protokol

Klien membuka `wss://…/ws?room=<room>&name=<nama>&color=<#hex>[&token=…]`, lalu
bertukar pesan JSON:

| Arah | Pesan |
| --- | --- |
| klien → server | `{"t":"hello","name":"Bima","color":"#9fe8ff"}` |
| klien → server | `{"t":"s","x":1.2,"y":3.4,"z":5.6,"ry":0.7}` (maks 24 pesan/detik) |
| klien → server | `{"t":"ping"}` |
| server → klien | `{"t":"welcome","id":"p1","room":"lobby"}` |
| server → klien | `{"t":"roster","players":[…]}` |
| server → klien | `{"t":"join","player":{…}}` / `{"t":"leave","id":"p1"}` |
| server → klien | `{"t":"state","id":"p1","x":…,"y":…,"z":…,"ry":…}` |

Batasan: 24 pemain per room, 24 pesan per detik per pemain, socket yang diam 20 detik
ditutup.

## Lokal

```bash
cd relay
npm install
npx wrangler dev     # ws://127.0.0.1:8787/ws
```

Uji logika lobby tanpa jaringan:

```bash
cd relay
npm test
```
