'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame } from '../lib/engine';

const INITIAL_STATS = {
  score: 0,
  total: 0,
  mist: 100,
  players: 1,
  gliding: false,
  swimming: false,
  fps: 0,
};

export default function Game() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);

  const [stats, setStats] = useState(INITIAL_STATS);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [touch, setTouch] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let game = null;
    try {
      game = createGame({
        canvas,
        onStats: setStats,
        onReady: () => setReady(true),
      });
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

  const begin = useCallback(() => {
    gameRef.current?.start();
    setStarted(true);
  }, []);

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

  return (
    <main className="stage">
      <canvas ref={canvasRef} className="scene" aria-label="Pulau Kabut" />

      <header className="hud hud--top">
        <div className="chip">
          <span className="chip__dot" />
          <strong className="chip__value">{stats.score}</strong>
          <span className="chip__label">/ {stats.total} kristal</span>
        </div>
        <div className="chip chip--quiet">
          <span className="chip__label">{stats.players} penjelajah</span>
        </div>
        <button type="button" className="ghost-btn" onClick={toggleMute} aria-pressed={muted}>
          {muted ? 'Suara mati' : 'Suara nyala'}
        </button>
      </header>

      <div className="mist-meter" aria-hidden="true">
        <span className="mist-meter__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      {started ? (
        <footer className="hud hud--bottom">
          <p className="hint">
            {touch
              ? 'Stik kiri untuk berjalan, geser sisi kanan untuk melihat, tahan tombol lompat untuk meluncur.'
              : 'WASD untuk berjalan, gerakkan mouse untuk melihat, tahan Space untuk meluncur.'}
          </p>
        </footer>
      ) : null}

      {started && touch ? (
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

      {started ? null : (
        <section className={`intro${ready ? ' intro--ready' : ''}`}>
          <p className="intro__eyebrow">Open world · low poly</p>
          <h1 className="intro__title">Pulau Kabut</h1>
          <p className="intro__text">
            Sebuah pulau hilang di tengah kabut. Kumpulkan 26 kristal cahaya dan kabut perlahan
            membuka seluruh lembahnya. Penjelajah lain bisa muncul di pulau yang sama.
          </p>
          <ul className="intro__keys">
            <li><b>WASD / stik kiri</b> berjalan</li>
            <li><b>Space / tombol lompat</b> lompat, tahan untuk meluncur</li>
            <li><b>Geser / mouse</b> memutar kamera · <b>Shift</b> berlari</li>
          </ul>
          <button type="button" className="cta" onClick={begin} disabled={!ready}>
            {ready ? 'Mulai menjelajah' : 'Menyiapkan pulau…'}
          </button>
          {failure ? <p className="intro__error">{failure}</p> : null}
        </section>
      )}
    </main>
  );
}
