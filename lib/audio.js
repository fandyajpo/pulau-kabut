/**
 * Semua suara dibuat dengan Web Audio, tanpa satu pun file audio.
 * Angin, langkah kaki, lompat, mendarat, dan gemerincing kristal cukup dari
 * osilator dan derau yang difilter. AudioContext baru dibuat setelah pengguna
 * menyentuh tombol mulai (syarat browser).
 */
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let windGain = null;
  let windFilter = null;
  let padGain = null;
  let muted = false;

  function makeNoise() {
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AudioCtor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!AudioCtor) return null;

    ctx = new AudioCtor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);

    noiseBuffer = makeNoise();

    // Angin: derau lewat lowpass pelan, gain mengikuti kecepatan pemain.
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer;
    wind.loop = true;

    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 620;
    windFilter.Q.value = 0.6;

    windGain = ctx.createGain();
    windGain.gain.value = 0.05;

    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();

    // Pad ambient: dua sinus rendah yang saling bergeser sedikit.
    padGain = ctx.createGain();
    padGain.gain.value = 0.035;
    padGain.connect(master);
    [110, 164.81, 220].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 2 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.5 / (index + 1);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + index * 0.031;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.35;
      lfo.connect(lfoGain).connect(g.gain);
      osc.connect(g).connect(padGain);
      osc.start();
      lfo.start();
    });

    return ctx;
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function burst({ type = 'bandpass', frequency = 900, q = 1, gain = 0.3, duration = 0.16 }) {
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const env = ctx.createGain();
    const t = now();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(env).connect(master);
    source.start(t);
    source.stop(t + duration + 0.05);
  }

  function tone({ frequency = 440, type = 'sine', gain = 0.16, duration = 0.35, slideTo = null, delay = 0 }) {
    if (!ctx) return;
    const t = now() + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  return {
    init,
    get ready() {
      return Boolean(ctx);
    },
    setMuted(value) {
      muted = Boolean(value);
      if (master && ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.08);
      }
    },
    /** Kecepatan relatif 0..1 dan status meluncur mengatur angin. */
    setAir(speed, gliding) {
      if (!ctx || !windGain || !windFilter) return;
      const target = 0.04 + Math.min(speed / 14, 1) * 0.11 + (gliding ? 0.09 : 0);
      windGain.gain.setTargetAtTime(target, ctx.currentTime, 0.25);
      windFilter.frequency.setTargetAtTime(520 + Math.min(speed / 14, 1) * 900 + (gliding ? 500 : 0), ctx.currentTime, 0.3);
    },
    step() {
      burst({ frequency: 720 + Math.random() * 320, q: 0.9, gain: 0.16, duration: 0.12 });
    },
    jump() {
      tone({ frequency: 240, slideTo: 480, type: 'triangle', gain: 0.09, duration: 0.22 });
    },
    land() {
      burst({ type: 'lowpass', frequency: 320, q: 0.7, gain: 0.28, duration: 0.18 });
    },
    glide() {
      tone({ frequency: 620, slideTo: 320, type: 'sine', gain: 0.05, duration: 0.5 });
    },
    splash() {
      burst({ type: 'highpass', frequency: 1400, q: 0.6, gain: 0.2, duration: 0.3 });
    },
    collect(index = 0) {
      const scale = [0, 2, 4, 7, 9, 12];
      const base = 660 * Math.pow(2, (index % 3) / 12);
      scale.slice(0, 3).forEach((step, i) => {
        tone({
          frequency: base * Math.pow(2, step / 12),
          type: 'sine',
          gain: 0.14 / (i + 1),
          duration: 0.5 + i * 0.1,
          delay: i * 0.06,
        });
      });
    },
    chime() {
      tone({ frequency: 1320, type: 'sine', gain: 0.05, duration: 0.8 });
    },
    dispose() {
      if (ctx) ctx.close();
      ctx = null;
      master = null;
    },
  };
}
