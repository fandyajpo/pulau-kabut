import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const FINGER_NAMES = ['index', 'middle', 'ring', 'pinky'];

/**
 * Gerak manusia: pose dasar, napas, jalan, lari, duduk, gestur tangan,
 * ekspresi wajah, kedip, dan pandangan mata.
 */
export function createMotion(human) {
  const { bones, eyes, morph } = human;

  const state = {
    time: 0,
    clip: 'idle',
    gesture: 'none',
    expression: 'neutral',
    look: new THREE.Vector3(0, 1.72, 1.4),
    lookEnabled: true,
    blinkIn: 2.4,
    blinkPhase: 1,
    rootOffset: 0,
  };

  const targets = { smile: 0, frown: 0, surprise: 0, anger: 0, sad: 0 };
  const current = { smile: 0, frown: 0, surprise: 0, anger: 0, sad: 0 };

  const headLocal = new THREE.Matrix4();
  const pointLocal = new THREE.Vector3();
  const eyeOffset = new THREE.Vector3();

  function bone(name) {
    return bones.get(name);
  }

  function set(name, x = 0, y = 0, z = 0) {
    const entry = bones.get(name);
    if (entry) entry.rotation.set(x, y, z);
  }

  function add(name, x = 0, y = 0, z = 0) {
    const entry = bones.get(name);
    if (entry) {
      entry.rotation.x += x;
      entry.rotation.y += y;
      entry.rotation.z += z;
    }
  }

  function reset() {
    bones.forEach((entry) => entry.rotation.set(0, 0, 0));
    human.root.position.y = 0;
  }

  function setFingerCurl(suffix, amount, spread = 0) {
    FINGER_NAMES.forEach((name, index) => {
      const bias = [0.9, 1, 0.95, 1.05][index];
      for (let joint = 1; joint <= 3; joint += 1) {
        add(`${name}${joint}${suffix}`, amount * bias * (joint === 1 ? 0.8 : 1), 0, spread * (index - 1.5) * 0.06);
      }
    });
  }

  function setThumb(suffix, amount) {
    add(`thumb1${suffix}`, amount * 0.7, 0, 0);
    add(`thumb2${suffix}`, amount * 0.9, 0, 0);
  }

  function openHand(suffix) {
    setFingerCurl(suffix, 0.08, 1);
    setThumb(suffix, 0.1);
  }

  function fist(suffix) {
    setFingerCurl(suffix, 1.55, -0.2);
    setThumb(suffix, 0.5);
  }

  function point(suffix) {
    setFingerCurl(suffix, 1.5, -0.2);
    for (let joint = 1; joint <= 3; joint += 1) {
      set(`index${joint}${suffix}`, -0.16 * joint, 0, 0);
    }
    setThumb(suffix, 0.35);
  }

  function thumbsUp(suffix) {
    fist(suffix);
    set(`thumb1${suffix}`, -0.2, 0, 0);
    set(`thumb2${suffix}`, -0.32, 0, 0);
  }

  function idlePose() {
    const breathe = Math.sin(state.time * 1.6) * 0.5 + 0.5;
    const sway = Math.sin(state.time * 0.55);
    const swaySlow = Math.sin(state.time * 0.31 + 1.2);

    set('hips', 0, sway * 0.03, sway * 0.012);
    set('spine', 0.018 + breathe * 0.006, 0, 0);
    set('chest', 0.01 + breathe * 0.008, swaySlow * 0.02, 0);
    set('chestTop', -0.012 - breathe * 0.01, 0, 0);
    set('neck', -0.02 - breathe * 0.006, swaySlow * 0.05, 0);
    set('head', 0.01, -swaySlow * 0.08, sway * 0.02);

    [-1, 1].forEach((side) => {
      const suffix = side > 0 ? 'L' : 'R';
      set(`upperArm${suffix}`, 0.02 + breathe * 0.01, 0, side * (0.14 + breathe * 0.012));
      set(`forearm${suffix}`, 0.14 + breathe * 0.02, 0, 0);
      set(`hand${suffix}`, 0, side * 0.06, 0);
      set(`upperLeg${suffix}`, 0.02, 0, side * 0.012);
      set(`lowerLeg${suffix}`, -0.05, 0, 0);
      set(`foot${suffix}`, 0.03, 0, 0);
      openHand(suffix);
    });

    human.root.position.y = sway * 0.004;
  }

  function walkPose(run) {
    const pace = run ? 3.1 : 1.85;
    const phase = state.time * TAU * pace;
    const swing = Math.sin(phase);
    const lift = Math.cos(phase);
    const amplitude = run ? 1.0 : 0.58;

    const left = swing * amplitude;
    const right = -swing * amplitude;

    set('hips', 0, -swing * (run ? 0.16 : 0.1), Math.sin(phase * 2) * 0.02);
    set('spine', run ? 0.16 : 0.05, swing * 0.05, 0);
    set('chest', run ? 0.12 : 0.03, swing * (run ? 0.18 : 0.1), 0);
    set('chestTop', run ? -0.05 : -0.02, swing * 0.04, 0);
    set('neck', -0.03, -swing * 0.05, 0);
    set('head', -0.02 + Math.abs(swing) * 0.02, -swing * 0.03, 0);

    set('upperLegL', left, 0, 0.01);
    set('lowerLegL', -clamp(0.18 + Math.max(0, -lift) * (run ? 1.5 : 1.0), 0, run ? 1.7 : 1.2), 0, 0);
    set('footL', clamp((run ? 0.2 : 0.18) - left * 0.4 + Math.max(0, lift) * 0.3, -0.5, 0.6), 0, 0);
    set('toeL', Math.max(0, -lift) * 0.45, 0, 0);

    set('upperLegR', right, 0, -0.01);
    set('lowerLegR', -clamp(0.18 + Math.max(0, lift) * (run ? 1.5 : 1.0), 0, run ? 1.7 : 1.2), 0, 0);
    set('footR', clamp((run ? 0.2 : 0.18) - right * 0.4 + Math.max(0, -lift) * 0.3, -0.5, 0.6), 0, 0);
    set('toeR', Math.max(0, lift) * 0.45, 0, 0);

    const armAmplitude = run ? 0.95 : 0.42;
    set('upperArmL', -left * armAmplitude, 0, 0.16 + (run ? 0.05 : 0));
    set('forearmL', (run ? 1.35 : 0.35) + Math.max(0, -left) * 0.4, 0, 0);
    set('upperArmR', -right * armAmplitude, 0, -0.16 - (run ? 0.05 : 0));
    set('forearmR', (run ? 1.35 : 0.35) + Math.max(0, -right) * 0.4, 0, 0);

    openHand('L');
    setFingerCurl('L', run ? 0.55 : 0.28, 0.2);
    openHand('R');
    setFingerCurl('R', run ? 0.55 : 0.28, 0.2);

    human.root.position.y = Math.abs(Math.sin(phase)) * (run ? 0.045 : 0.022) - (run ? 0.01 : 0);
  }

  function sitPose() {
    const breathe = Math.sin(state.time * 1.4) * 0.5 + 0.5;

    human.root.position.y = -0.44;

    set('hips', -0.12, 0, 0);
    set('spine', 0.1 + breathe * 0.006, 0, 0);
    set('chest', 0.06 + breathe * 0.01, 0, 0);
    set('chestTop', -0.02, 0, 0);
    set('neck', -0.04, 0, 0);
    set('head', 0.02, 0, 0);

    [-1, 1].forEach((side) => {
      const suffix = side > 0 ? 'L' : 'R';
      set(`upperLeg${suffix}`, 1.45, side * 0.08, side * 0.06);
      set(`lowerLeg${suffix}`, -1.5, 0, 0);
      set(`foot${suffix}`, 0.12, 0, 0);
      set(`upperArm${suffix}`, 0.25, 0, side * 0.16);
      set(`forearm${suffix}`, 0.85, 0, 0);
      openHand(suffix);
    });
  }

  function wavePose() {
    idlePose();
    set('upperArmR', 0.35, 0, -1.25);
    set('forearmR', 0.1, 0, -1.35);
    set('handR', 0, 0, Math.sin(state.time * 7) * 0.35);
    set('chest', 0, -0.1, 0);
    set('head', 0, -0.15, 0.05);
    openHand('R');
  }

  function pointPose() {
    idlePose();
    set('upperArmR', 1.25, 0, -0.35);
    set('forearmR', 0.15, 0, -0.1);
    set('handR', 0, -0.15, 0);
    set('chest', 0, -0.18, 0);
    set('head', 0, -0.22, 0);
    point('R');
  }

  function thumbsUpPose() {
    idlePose();
    set('upperArmR', 0.85, 0, -0.45);
    set('forearmR', 1.35, 0.2, 0);
    set('handR', 0, 0, 0);
    thumbsUp('R');
  }

  function crossedPose() {
    idlePose();
    [-1, 1].forEach((side) => {
      const suffix = side > 0 ? 'L' : 'R';
      set(`upperArm${suffix}`, 0.55, 0, side * 0.55);
      set(`forearm${suffix}`, 1.9, side * 0.5, 0);
      set(`hand${suffix}`, 0, side * 0.25, 0);
      openHand(suffix);
    });
    set('chest', 0.04, 0, 0);
  }

  function applyGesture() {
    switch (state.gesture) {
      case 'wave':
        wavePose();
        break;
      case 'point':
        pointPose();
        break;
      case 'thumbsUp':
        thumbsUpPose();
        break;
      case 'armsCrossed':
        crossedPose();
        break;
      case 'fist':
        idlePose();
        fist('R');
        break;
      case 'openPalm':
        idlePose();
        openHand('R');
        break;
      case 'pinch':
        idlePose();
        setFingerCurl('R', 1.45, -0.2);
        for (let joint = 1; joint <= 3; joint += 1) {
          add(`index${joint}R`, -1.2 * (joint === 1 ? 0.5 : 0.7), 0, 0);
          add(`thumb${Math.min(joint, 2)}R`, -0.9, 0, 0);
        }
        break;
      default:
        break;
    }
  }

  function updateExpression(dt) {
    Object.keys(targets).forEach((key) => {
      targets[key] = key === state.expression ? 1 : 0;
    });

    const speed = 1 - Math.exp(-9 * dt);
    const list = human.expressions;
    Object.keys(current).forEach((key, index) => {
      current[key] += (targets[key] - current[key]) * speed;
      if (morph) morph[index] = current[key];
    });
    void list;
  }

  function updateBlink(dt) {
    state.blinkIn -= dt;
    if (state.blinkIn <= 0) {
      state.blinkIn = 2.2 + Math.random() * 3.4;
      state.blinkPhase = 0;
    }

    if (state.blinkPhase < 1) {
      state.blinkPhase = Math.min(1, state.blinkPhase + dt / 0.16);
    }

    const t = state.blinkPhase;
    const closed = t < 1 ? Math.sin(t * Math.PI) : 0;

    human.eyes.forEach((eye) => {
      eye.upperLid.rotation.x = -0.55 + closed * 1.0;
      eye.lowerLid.rotation.x = 0.25 - closed * 0.22;
    });
  }

  function updateGaze() {
    human.eyes.forEach((eye) => {
      if (!state.lookEnabled) {
        eye.group.rotation.set(0, 0, 0);
        return;
      }

      const headBone = bone('head');
      headBone.updateMatrixWorld();
      headLocal.copy(headBone.matrixWorld).invert();
      pointLocal.copy(state.look).applyMatrix4(headLocal);
      eyeOffset.copy(eye.group.position);

      const dx = pointLocal.x - eyeOffset.x;
      const dy = pointLocal.y - eyeOffset.y;
      const dz = pointLocal.z - eyeOffset.z;

      const yaw = clamp(Math.atan2(dx, dz), -0.55, 0.55);
      const pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.4, 0.4);

      eye.group.rotation.set(-pitch * 0.85, yaw, 0);
    });
  }

  function update(dt) {
    state.time += dt;
    reset();

    if (state.clip === 'walk') walkPose(false);
    else if (state.clip === 'run') walkPose(true);
    else if (state.clip === 'sit') sitPose();
    else idlePose();

    if (state.clip !== 'sit') applyGesture();

    updateExpression(dt);
    updateBlink(dt);
    updateGaze();
  }

  return {
    state,
    update,
    setClip(clip) {
      state.clip = clip;
    },
    setGesture(gesture) {
      state.gesture = gesture;
    },
    setExpression(expression) {
      state.expression = expression;
    },
    setLook(vector) {
      state.look.copy(vector);
    },
    lookEnabled(value) {
      state.lookEnabled = Boolean(value);
    },
    blinkNow() {
      state.blinkPhase = 0;
      state.blinkIn = 2.2;
    },
  };
}
