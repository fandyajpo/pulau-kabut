'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame } from '../lib/engine';
import { COLORS, randomColor, randomName } from '../lib/net';
import { getRelayConfig, sanitizeRoom } from '../lib/relay';

const INITIAL_STATS = {
  score: 0,
  total: 0,
  mist: 100,
  players: 1,
  names: [],
  net: 'offline',
  transport: '',
  gliding: false,
  swimming: false,
  fps: 0,
};

const NET_LABEL = {
  online: 'tersambung',
  connecting: 'menyambung…',
  reconnecting: 'menyambung ulang…',
  offline: 'luring',
  refused: 'ditolak',
  failed: 'gagal',
};

const VIA_LABEL = {
  relay: 'relay',
  mqtt: 'mqtt',
  http: 'cadangan',
};

export default function Game() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);

  const [stats, setStats] = useState(INITIAL_STATS);
  const [name, setName] = useState('');
  const [room, setRoom] = useState('lobby');
  const [color, setColor] = useState(COLORS[0]);
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [touch, setTouch] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches);

    const savedName = window.localStorage.getItem('pulau-kabut-name');
    setName(savedName && savedName.trim() ? savedName.trim().slice(0, 14) : randomName());

    const savedColor = window.localStorage.getItem('pulau-kabut-color');
    setColor(COLORS.includes(savedColor) ? savedColor : randomColor());

    setRoom(getRelayConfig('lobby').room);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let game = null;
    try {
      game = createGame({ canvas, onStats: setStats, onReady: () => setReady(true) });
      gameRef.current = game;
    } catch (error) {
      console.error(error);
      setFailure('Perangkat ini belum bisa menjalankan WebGL.');
      return undefined;
    }

    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  const join = useCallback(
    (event) => {
      event.preventDefault();
      if (!ready) return;

      const cleanName = (name.trim() || randomName()).slice(0, 14);
      const cleanRoom = sanitizeRoom(room);

      setName(cleanName);
      setRoom(cleanRoom);

      try {
        window.localStorage.setItem('pulau-kabut-name', cleanName);
        window.localStorage.setItem('pulau-kabut-color', color);
      } catch (error) {
        // localStorage bisa diblokir; tidak masalah
      }

      gameRef.current?.start({ name: cleanName, color, room: cleanRoom });
      setJoined(true);
    },
    [name, room, color, ready],
  );

  const toggleMute = useCallback(() => {
    setMuted((previous) => {
      gameRef.current?.setMuted(!previous);
      return !previous;
    });
  }, []);

  const jump = useCallback((held) => {
    gameRef.current?.setJumpHeld(held);
  }, []);

  const progress = stats.total ? stats.score / stats.total : 0;
  const crew = stats.names.slice(0, 3);
  const more = stats.names.length > crew.length ? ' …' : '';
  const via = VIA_LABEL[stats.transport] || '';

  return (
    <main className="stage">
      <canvas ref={canvasRef} className="scene" aria-label="Pulau Kabut" />

      <header className="hud hud--top">
        <div className="chip">
          <span className="chip__dot" />
          <strong className="chip__value">{stats.score}</strong>
          <span className="chip__label">/ {stats.total} kristal</span>
        </div>
        <button type="button" className="ghost-btn" onClick={toggleMute} aria-pressed={muted}>
          {muted ? 'Suara mati' : 'Suara nyala'}
        </button>
      </header>

      <div className="crew">
        <span className={`crew__dot crew__dot--${stats.net}`} />
        <span className="crew__count">{stats.players} penjelajah</span>
        {joined ? <span className="crew__room">#{room}</span> : null}
        {joined && via ? <span className="crew__via">{via}</span> : null}
        <span className="crew__names">
          {joined ? `kamu ${name}` : NET_LABEL[stats.net]}
          {crew.length ? ` · ${crew.join(' · ')}${more}` : ''}
        </span>
      </div>

      <div className="mist-meter" aria-hidden="true">
        <span className="mist-meter__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      {joined ? (
        <footer className="hud hud--bottom">
          <p className="hint">
            {touch
              ? 'Stik kiri untuk berjalan, geser sisi kanan untuk melihat, tahan tombol lompat untuk meluncur.'
              : 'WASD untuk berjalan, gerakkan mouse untuk melihat, tahan Space untuk meluncur.'}
          </p>
        </footer>
      ) : null}

      {joined && touch ? (
        <button
          type="button"
          className="jump-btn"
          onPointerDown={(event) => {
            event.preventDefault();
            jump(true);
          }}
          onPointerUp={() => jump(false)}
          onPointerLeave={() => jump(false)}
          onPointerCancel={() => jump(false)}
        >
          Lompat
        </button>
      ) : null}

      {joined ? null : (
        <section className={`intro${ready ? ' intro--ready' : ''}`}>
          <p className="intro__eyebrow">Open world · low poly</p>
          <h1 className="intro__title">Pulau Kabut</h1>
          <p className="intro__text">
            Sebuah pulau hilang di tengah kabut. Kumpulkan 26 kristal cahaya dan kabut perlahan
            membuka seluruh lembahnya — bersama penjelajah lain di pulau yang sama.
          </p>

          <form className="join" onSubmit={join}>
            <label className="join__label" htmlFor="explorer-name">
              Nama penjelajah
            </label>
            <input
              id="explorer-name"
              className="join__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Misalnya Bima"
              maxLength={14}
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint="next"
              spellCheck={false}
            />

            <label className="join__label" htmlFor="explorer-room">
              Room
            </label>
            <input
              id="explorer-room"
              className="join__input"
              value={room}
              onChange={(event) => setRoom(sanitizeRoom(event.target.value))}
              placeholder="lobby"
              maxLength={16}
              autoCapitalize="none"
              autoComplete="off"
              enterKeyHint="go"
              spellCheck={false}
            />
            <p className="join__hint">Bagikan room yang sama supaya bisa bertemu teman.</p>

            <div className="join__colors" role="radiogroup" aria-label="Warna penjelajah">
              {COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={option === color}
                  aria-label={`Warna ${option}`}
                  className={`swatch${option === color ? ' is-on' : ''}`}
                  style={{ background: option }}
                  onClick={() => setColor(option)}
                />
              ))}
            </div>

            <button type="submit" className="cta" disabled={!ready}>
              {ready ? 'Gabung ke pulau' : 'Menyiapkan pulau…'}
            </button>
          </form>

          <ul className="intro__keys">
            <li><b>WASD / stik kiri</b> berjalan</li>
            <li><b>Space / tombol lompat</b> lompat, tahan untuk meluncur</li>
            <li><b>Geser / mouse</b> memutar kamera · <b>Shift</b> berlari</li>
          </ul>

          {failure ? <p className="intro__error">{failure}</p> : null}
        </section>
      )}
    </main>
  );
}
