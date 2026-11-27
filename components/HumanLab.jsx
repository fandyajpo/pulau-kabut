'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createLab } from '../../lib/human/lab';

const VIEWS = [
  ['front', 'Depan'],
  ['threeQuarter', '3/4'],
  ['side', 'Samping'],
  ['back', 'Belakang'],
  ['face', 'Wajah'],
  ['hands', 'Tangan'],
  ['feet', 'Kaki'],
];

const CLIPS = [
  ['idle', 'Diam'],
  ['walk', 'Jalan'],
  ['run', 'Lari'],
  ['sit', 'Duduk'],
];

const GESTURES = [
  ['none', 'Rileks'],
  ['openPalm', 'Telapak'],
  ['fist', 'Genggam'],
  ['point', 'Menunjuk'],
  ['thumbsUp', 'Jempol'],
  ['wave', 'Melambai'],
  ['armsCrossed', 'Silang'],
  ['pinch', 'Cubit'],
];

const EXPRESSIONS = [
  ['neutral', 'Netral'],
  ['smile', 'Senyum'],
  ['frown', 'Cemberut'],
  ['surprise', 'Terkejut'],
  ['anger', 'Marah'],
  ['sad', 'Sedih'],
];

const STUDIOS = [
  ['studio', 'Studio'],
  ['dramatic', 'Drama'],
  ['soft', 'Lembut'],
];

export default function HumanLab() {
  const canvasRef = useRef(null);
  const labRef = useRef(null);

  const [stats, setStats] = useState({ fps: 60 });
  const [view, setView] = useState('front');
  const [clip, setClip] = useState('idle');
  const [gesture, setGesture] = useState('none');
  const [expression, setExpression] = useState('neutral');
  const [studio, setStudio] = useState('studio');
  const [failure, setFailure] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let lab = null;
    try {
      lab = createLab({ canvas, onStats: setStats });
      labRef.current = lab;
    } catch (error) {
      console.error(error);
      setFailure('WebGL belum tersedia, jadi patung manusia ini tidak bisa ditampilkan.');
      return undefined;
    }

    return () => {
      lab.dispose();
      labRef.current = null;
    };
  }, []);

  const chooseView = useCallback((name) => {
    labRef.current?.setView(name);
    setView(name);
  }, []);

  const chooseClip = useCallback((name) => {
    labRef.current?.setClip(name);
    setClip(name);
  }, []);

  const chooseGesture = useCallback((name) => {
    labRef.current?.setGesture(name);
    setGesture(name);
  }, []);

  const chooseExpression = useCallback((name) => {
    labRef.current?.setExpression(name);
    setExpression(name);
  }, []);

  const chooseStudio = useCallback((name) => {
    labRef.current?.setStudio(name);
    setStudio(name);
  }, []);

  return (
    <main className="lab">
      <canvas ref={canvasRef} className="lab__canvas" aria-label="Digital human" />

      <header className="lab__top">
        <div>
          <p className="lab__eyebrow">Three.js · anatomi prosedural</p>
          <h1 className="lab__title">Digital Human</h1>
        </div>
        <div className="lab__meta">
          <span>{stats.fps} fps</span>
          <a href="/">Pulau Kabut →</a>
        </div>
      </header>

      <nav className="lab__views" aria-label="Sudut pandang">
        {VIEWS.map(([name, label]) => (
          <button
            key={name}
            type="button"
            className={name === view ? 'is-on' : ''}
            onClick={() => chooseView(name)}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="lab__panel" aria-label="Kontrol karakter">
        <div className="lab__group">
          <span className="lab__label">Gerak</span>
          <div className="lab__row">
            {CLIPS.map(([name, label]) => (
              <button
                key={name}
                type="button"
                className={name === clip ? 'is-on' : ''}
                onClick={() => chooseClip(name)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="lab__group">
          <span className="lab__label">Tangan</span>
          <div className="lab__row">
            {GESTURES.map(([name, label]) => (
              <button
                key={name}
                type="button"
                className={name === gesture ? 'is-on' : ''}
                onClick={() => chooseGesture(name)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="lab__group">
          <span className="lab__label">Wajah</span>
          <div className="lab__row">
            {EXPRESSIONS.map(([name, label]) => (
              <button
                key={name}
                type="button"
                className={name === expression ? 'is-on' : ''}
                onClick={() => chooseExpression(name)}
              >
                {label}
              </button>
            ))}
            <button type="button" onClick={() => labRef.current?.blink()}>
              Kedip
            </button>
          </div>
        </div>

        <div className="lab__group">
          <span className="lab__label">Cahaya</span>
          <div className="lab__row">
            {STUDIOS.map(([name, label]) => (
              <button
                key={name}
                type="button"
                className={name === studio ? 'is-on' : ''}
                onClick={() => chooseStudio(name)}
              >
                {label}
              </button>
            ))}
            <button type="button" onClick={() => labRef.current?.setAutoRotate(true)}>
              Putar
            </button>
          </div>
        </div>
      </section>

      <p className="lab__hint">
        Geser untuk memutar · cubit/scroll untuk memperbesar · perhatikan kuku, jari, dan kelopak mata
      </p>

      {failure ? <p className="lab__error">{failure}</p> : null}
    </main>
  );
}
