const NAMES = [
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

const COLORS = ['#9fe8ff', '#ffd79a', '#b7a4ff', '#a6f0c3', '#ffa8c4', '#ffe9a8'];

const TICK_MS = 420;

/**
 * Kehadiran pemain lain: kirim posisi sendiri, terima posisi orang lain.
 * Kalau jaringan mati (atau API tidak tersedia), permainan tetap jalan sendiri.
 */
export function createPresence({ onPlayers } = {}) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];

  let timer = null;
  let readState = null;
  let inFlight = false;

  async function tick() {
    if (!readState || inFlight) return;
    inFlight = true;
    try {
      const state = readState();
      const response = await fetch('/api/presence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, name, color, ...state }),
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data?.players) && onPlayers) onPlayers(data.players);
      }
    } catch (error) {
      // Offline atau server sedang dingin: pulau ini tetap bisa dijelajahi.
    } finally {
      inFlight = false;
    }
  }

  function start(getState) {
    if (timer !== null) return;
    readState = getState;
    tick();
    timer = setInterval(tick, TICK_MS);
  }

  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    readState = null;
  }

  return { id, name, color, start, stop };
}
