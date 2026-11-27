import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const FINGERS = ['index', 'middle', 'ring', 'pinky'];

/**
 * Gerak manusia: pose dasar, napas, jalan, lari, lompat, mendarat, meluncur,
 * berenang, duduk, gestur tangan, ekspresi wajah, kedip, dan pandangan mata.
 *
 * Semua pose ditulis ke buffer target lalu dihaluskan ke tulang, jadi perpindahan
 * klip dan gestur tidak pernah melompat.
 */
export function createMotion(human) {
  const { bones, eyes, morph } = human;

  const targets = new Map();
  const clipPose = new Map();
  const current = new Map();

  const state = {
    time: 0,
    phase: 0,
    pace: 1,
    clip: 'idle',
    gesture: 'none',
    gestureWeight: 0,
    expression: 'neutral',
    look: new THREE.Vector3(0, 1.72, 1.4),
    lookEnabled: true,
    blinkIn: 2.4,
    blinkPhase: 1,
    land: 0,
    rootOffset: 0,
  };

  const expressionTargets = { smile: 0, frown: 0, surprise: 0, anger: 0, sad: 0 };
  const expressionCurrent = { smile: 0, frown: 0, surprise: 0, anger: 0, sad: 0 };

  const headLocal = new THREE.Matrix4();
  const pointLocal = new THREE.Vector3();
  const eyeOffset = new THREE.Vector3();

  // ------------------------------------------------------------------ buffer
  function slot(map, name) {
    let entry = map.get(name);
    if (!entry) {
      entry = { x: 0, y: 0, z: 0 };
      map.set(name, entry);
    }
    return entry;
  }

  function pose(name, x = 0, y = 0, z = 0) {
    const entry = slot(targets, name);
    entry.x = x;
    entry.y = y;
    entry.z = z;
  }

  function poseAdd(name, x = 0, y = 0, z = 0) {
    const entry = slot(targets, name);
    entry.x += x;
    entry.y += y;
    entry.z += z;
  }

  function copyTargets() {
    clipPose.clear();
    for (const [name, entry] of targets) {
      const saved = slot(clipPose, name);
      saved.x = entry.x;
      saved.y = entry.y;
      saved.z = entry.z;
    }
  }

  function clearTargets() {
    targets.clear();
  }

  function blendGesture(weight) {
    for (const [name, gesture] of targets) {
      const base = clipPose.get(name) || { x: 0, y: 0, z: 0 };
      const entry = slot(clipPose, name);
      entry.x = base.x * (1 - weight) + gesture.x * weight;
      entry.y = base.y * (1 - weight) + gesture.y * weight;
      entry.z = base.z * (1 - weight) + gesture.z * weight;
    }
    for (const [name, entry] of clipPose) {
      if (targets.has(name)) continue;
      entry.x *= 1 - weight;
      entry.y *= 1 - weight;
      entry.z *= 1 - weight;
    }
    targets.clear();
    for (const [name, entry] of clipPose) {
      const target = slot(targets, name);
      target.x = entry.x;
      target.y = entry.y;
      target.z = entry.z;
    }
  }

  function applyPose(dt, speed) {
    const blend = 1 - Math.exp(-speed * dt);
    for (const [name, bone] of bones) {
      const target = targets.get(name);
      const start = current.get(name);
      const entry = start || { x: 0, y: 0, z: 0 };

      entry.x += ((target ? target.x : 0) - entry.x) * blend;
      entry.y += ((target ? target.y : 0) - entry.y) * blend;
      entry.z += ((target ? target.z : 0) - entry.z) * blend;

      bone.rotation.set(entry.x, entry.y, entry.z);
      if (!start) current.set(name, entry);
    }
  }

  // ------------------------------------------------------------------ hands
  function curlFingers(suffix, amount, spread = 0) {
    FINGERS.forEach((name, index) => {
      const bias = [0.92, 1, 0.96, 1.06][index];
      for (let joint = 1; joint <= 3; joint += 1) {
        poseAdd(
          `${name}${joint}${suffix}`,
          amount * bias * (joint === 1 ? 0.85 : 1),
          0,
          spread * (index - 1.5) * 0.05,
        );
      }
    });
  }

  function curlThumb(suffix, amount) {
    poseAdd(`thumb1${suffix}`, amount * 0.7, 0, 0);
    poseAdd(`thumb2${suffix}`, amount * 0.9, 0, 0);
  }

  function openHand(suffix) {
    curlFingers(suffix, -0.1, 1.2);
    curlThumb(suffix, -0.18);
  }

  function relaxedHand(suffix) {
    curlFingers(suffix, 0.16, 0.35);
    curlThumb(suffix, 0.1);
  }

  function fist(suffix) {
    curlFingers(suffix, 1.5, -0.2);
    curlThumb(suffix, 0.55);
  }

  function straightIndex(suffix) {
    for (let joint = 1; joint <= 3; joint += 1) {
      pose(`index${joint}${suffix}`, -0.12 * joint, 0, 0);
    }
  }

  function sideOffset(side) {
    return side * 0.012;
  }

  // ------------------------------------------------------------------- poses
  function idlePose() {
    const breathe = Math.sin(state.time * 1.5) * 0.5 + 0.5;
    const sway = Math.sin(state.time * 0.45);
    const drift = Math.sin(state.time * 0.29 + 1.1);

    state.rootOffset = sway * 0.003;

    pose('hips', 0.01, sway * 0.035, sway * 0.015 + drift * 0.01);
    pose('spine', 0.02 + breathe * 0.008, -sway * 0.01, -sway * 0.02);
    pose('chest', 0.008 + breathe * 0.012, -sway * 0.03, drift * 0.01);
    pose('chestTop', -0.014 - breathe * 0.012, 0, 0);
    pose('neck', -0.022 - breathe * 0.006, sway * 0.06, 0);
    pose('head', 0.012, -sway * 0.09, sway * 0.02);

    [-1, 1].forEach((side) => {
      const suffix = side > 0 ? 'L' : 'R';
      const shift = sway * side;

      pose(`clavicle${suffix}`, -breathe * 0.01, 0, side * breathe * 0.012);
      pose(`upperArm${suffix}`, 0.03 + breathe * 0.012 + shift * 0.02, 0, side * (0.15 + breathe * 0.014));
      pose(`forearm${suffix}`, 0.16 + breathe * 0.02, side * 0.06, 0);
      pose(`hand${suffix}`, 0, side * 0.08, 0);
      pose(`upperLeg${suffix}`, 0.02 + shift * 0.03, 0, side * 0.012);
      pose(`lowerLeg${suffix}`, -0.05, 0, 0);
      pose(`foot${suffix}`, 0.03, 0, 0);
      relaxedHand(suffix);
    });
  }

  function walkPose(run) {
    const phase = state.phase;
    const swing = Math.sin(phase);
    const lift = Math.cos(phase);
    const stride = run ? 1.05 : 0.62;

    const left = swing * stride;
    const right = -swing * stride;

    const leftSwing = Math.max(0, -lift);
    const rightSwing = Math.max(0, lift);

    state.rootOffset = Math.abs(Math.sin(phase)) * (run ? 0.035 : 0.016) - (run ? 0.012 : 0);

    pose('hips', run ? 0.04 : 0.01, -swing * (run ? 0.18 : 0.12), Math.sin(phase * 2) * (run ? 0.03 : 0.02) + swing * 0.02);
    pose('spine', (run ? 0.22 : 0.05) + Math.abs(swing) * 0.02, swing * (run ? 0.12 : 0.06), -swing * 0.02);
    pose('chest', (run ? 0.16 : 0.03) + Math.abs(swing) * 0.01, swing * (run ? 0.2 : 0.11), 0);
    pose('chestTop', run ? -0.08 : -0.03, swing * 0.05, 0);
    pose('neck', run ? -0.12 : -0.03, -swing * 0.06, 0);
    pose('head', run ? -0.06 : -0.01, -swing * 0.1, 0);

    pose('upperLegL', left, 0, sideOffset(1));
    pose('lowerLegL', -clamp(0.14 + leftSwing * (run ? 1.6 : 1.05), 0, run ? 1.8 : 1.3), 0, 0);
    pose('footL', clamp(0.12 - left * 0.25 + leftSwing * 0.35 - Math.max(0, swing) * 0.2, -0.55, 0.6), 0, 0);
    pose('toeL', Math.max(0, swing) * 0.3, 0, 0);

    pose('upperLegR', right, 0, sideOffset(-1));
    pose('lowerLegR', -clamp(0.14 + rightSwing * (run ? 1.6 : 1.05), 0, run ? 1.8 : 1.3), 0, 0);
    pose('footR', clamp(0.12 - right * 0.25 + rightSwing * 0.35 - Math.max(0, -swing) * 0.2, -0.55, 0.6), 0, 0);
    pose('toeR', Math.max(0, -swing) * 0.3, 0, 0);

    const armSwing = run ? 1.0 : 0.45;
    const armBend = run ? 1.35 : 0.3;

    pose('clavicleL', -swing * (run ? 0.08 : 0.03), 0, run ? 0.05 : 0.02);
    pose('upperArmL', -left * armSwing, 0, 0.15 + (run ? 0.06 : 0));
    pose('forearmL', armBend + Math.max(0, -left) * (run ? 0.45 : 0.3), 0, 0);
    pose('handL', 0, 0, 0.08);

    pose('clavicleR', swing * (run ? 0.08 : 0.03), 0, run ? -0.05 : -0.02);
    pose('upperArmR', -right * armSwing, 0, -0.15 - (run ? 0.06 : 0));
    pose('forearmR', armBend + Math.max(0, -right) * (run ? 0.45 : 0.3), 0, 0);
    pose('handR', 0, 0, -0.08);

    relaxedHand('L');
    curlFingers('L', run ? 0.5 : 0.2, 0.25);
    relaxedHand('R');
    curlFingers('R', run ? 0.5 : 0.2, 0.25);
  }

  function fallPose() {
    const flutter = Math.sin(state.time * 7) * 0.1;
    state.rootOffset = 0;

    pose('hips', 0.02, 0, 0);
    pose('spine', -0.06, 0, 0);
    pose('chest', -0.05, 0, 0);
    pose('neck', 0.08, 0, 0);
    pose('head', 0.1, 0, 0);

    [-1, 1].forEach((side) => {
      const suffix = side > 0 ? 'L' : 'R';
      pose(`upperArm${suffix}`, 0.2 + flutter * side, 0, side * (1.0 + flutter));
      pose(`forearm${suffix}`, 0.4 + flutter, 0, 0);
      pose(`upperLeg${suffix}`, 0.45 - side * 0.12, 0, side * 0.07);
      pose(`lowerLeg${suffix}`, -0.7 - flutter * 0.2, 0, 0);
      pose(`foot${suffix}`, 0.25, 0, 0);
      openHand(suffix);
    });
  }

  function glidePose() {
    const flutter = Math.sin(state.time * 5.5) * 0.05;
    state.rootOffset = 0;

    pose('hips', -0.08, 0, 0);
    pose('spine', 0.5 + flutter, 0, 0);
    pose('chest', 0.16, 0, 0);
    pose('chestTop', 0.04, 0, 0);
    pose('neck', -0.38, 0, 0);
    pose('head', -0.3, 0, 0.04);

    [-1, 1].forEach((side) => {
      const suffix = side > 0 ? 'L' : 'R';
      pose(`clavicle${suffix}`, 0, 0, side * 0.1);
      pose(`upperArm${suffix}`, 0.15, 0, side * (1.42 + flutter));
      pose(`forearm${suffix}`, 0.18, 0, side * 0.16);
      pose(`hand${suffix}`, 0, 0, side * 0.2);
      pose(`upperLeg${suffix}`, -0.22, 0, side * 0.02);
      pose(`lowerLeg${suffix}`, -0.18, 0, 0);
      pose(`foot${suffix}`, 0.55, 0, 0);
      openHand(suffix);
    });
  }

  function swimPose() {
    const phase = state.time * TAU * 0.75;
    const sweep = Math.sin(phase);
    const kick = Math.sin(phase * 2);
    state.rootOffset = -0.08;

    pose('hips', -0.12, sweep * 0.12, 0);
    pose('spine', 0.22, -sweep * 0.16, 0);
    pose('chest', 0.1, sweep * 0.1, 0);
    pose('neck', -0.35, 0, 0);
    pose('head', -0.25, 0, 0);

    [-1, 1].forEach((side) => {
      const suffix = side > 0 ? 'L' : 'R';
      pose(`upperArm${suffix}`, 0.1 + sweep * side * 0.6, 0, side * 1.15);
      pose(`forearm${suffix}`, 0.65 - sweep * side * 0.4, 0, 0);
      pose(`hand${suffix}`, 0, 0, side * 0.15);
      pose(`upperLeg${suffix}`, 0.25 + kick * side * 0.45, 0, side * 0.08);
      pose(`lowerLeg${suffix}`, -0.6 + kick * side * 0.5, 0, 0);
      pose(`foot${suffix}`, 0.35, 0, 0);
      openHand(suffix);
    });
  }

  function sitPose() {
    const breathe = Math.sin(state.time * 1.4) * 0.5 + 0.5;
    state.rootOffset = -0.44;

    pose('hips', -0.12, 0, 0);
    pose('spine', 0.1 + breathe * 0.008, 0, 0);
    pose('chest', 0.06 + breathe * 0.012, 0, 0);
    pose('chestTop', -0.02, 0, 0);
    pose('neck', -0.04, 0, 0);
    pose('head', 0.03, 0, 0);

    [-1, 1].forEach((side) => {
      const suffix = side > 0 ? 'L' : 'R';
      pose(`upperLeg${suffix}`, 1.45, side * 0.08, side * 0.06);
      pose(`lowerLeg${suffix}`, -1.5, 0, 0);
      pose(`foot${suffix}`, 0.12, 0, 0);
      pose(`upperArm${suffix}`, 0.25, 0, side * 0.16);
      pose(`forearm${suffix}`, 0.85, 0, 0);
      relaxedHand(suffix);
    });
  }

  // ----------------------------------------------------------------- gestures
  function gesturePose(name) {
    switch (name) {
      case 'wave': {
        const wave = Math.sin(state.time * 7.5);
        pose('chest', 0.02, -0.12, 0.02);
        pose('neck', 0, -0.16, 0.02);
        pose('head', 0, -0.2, 0.06);
        pose('clavicleR', -0.1, 0, -0.22);
        pose('upperArmR', 0.3, 0, -1.28);
        pose('forearmR', 0.12, 0, -1.4 + wave * 0.12);
        pose('handR', 0, 0, wave * 0.4);
        openHand('R');
        return true;
      }
      case 'point': {
        pose('chest', 0.02, -0.2, 0);
        pose('neck', 0, -0.22, 0);
        pose('head', 0, -0.25, 0);
        pose('clavicleR', 0.18, 0, -0.12);
        pose('upperArmR', 1.32, 0, -0.32);
        pose('forearmR', 0.1, 0, -0.06);
        pose('handR', 0, -0.2, 0);
        curlFingers('R', 1.5, -0.2);
        straightIndex('R');
        curlThumb('R', 0.4);
        return true;
      }
      case 'thumbsUp': {
        pose('chest', 0.02, 0, 0.1);
        pose('neck', 0, -0.1, 0);
        pose('head', 0, -0.12, 0.06);
        pose('clavicleR', -0.05, 0, -0.1);
        pose('upperArmR', 0.9, 0, -0.42);
        pose('forearmR', 1.35, 0.25, 0);
        pose('handR', 0, 0.1, 0);
        fist('R');
        pose('thumb1R', -0.15, 0, 0);
        pose('thumb2R', -0.3, 0, 0);
        return true;
      }
      case 'armsCrossed': {
        pose('chest', 0.05, 0, 0);
        pose('spine', 0.03, 0, 0);
        pose('neck', 0.02, 0, 0);
        pose('head', 0, 0, 0.02);
        [-1, 1].forEach((side) => {
          const suffix = side > 0 ? 'L' : 'R';
          pose(`clavicle${suffix}`, 0.08, 0, side * 0.05);
          pose(`upperArm${suffix}`, 0.5, 0, side * 0.5);
          pose(`forearm${suffix}`, 1.95, side * 0.55, 0);
          pose(`hand${suffix}`, 0, side * 0.3, side * 0.1);
          relaxedHand(suffix);
        });
        return true;
      }
      case 'fist': {
        pose('upperArmR', 0.12, 0, -0.2);
        pose('forearmR', 0.9, 0, 0);
        fist('R');
        return true;
      }
      case 'openPalm': {
        pose('upperArmR', 0.25, 0, -0.3);
        pose('forearmR', 0.55, 0, 0);
        pose('handR', 0, 0, 0);
        openHand('R');
        return true;
      }
      case 'pinch': {
        pose('upperArmR', 0.45, 0, -0.22);
        pose('forearmR', 1.1, 0.2, 0);
        pose('handR', 0, 0.1, 0);
        curlFingers('R', 1.45, -0.2);
        pose('index1R', -0.5, 0, 0);
        pose('index2R', -0.55, 0, 0);
        pose('index3R', -0.4, 0, 0);
        pose('thumb1R', 0.4, 0, 0);
        pose('thumb2R', 0.5, 0, 0);
        return true;
      }
      default:
        return false;
    }
  }

  // -------------------------------------------------------------- expressions
  function updateExpression(dt) {
    Object.keys(expressionTargets).forEach((key) => {
      expressionTargets[key] = key === state.expression ? 1 : 0;
    });

    const blend = 1 - Math.exp(-8 * dt);
    const list = human.expressions;
    Object.keys(expressionCurrent).forEach((key, index) => {
      expressionCurrent[key] += (expressionTargets[key] - expressionCurrent[key]) * blend;
      if (morph) morph[index] = expressionCurrent[key];
    });
    void list;
  }

  function updateBlink(dt) {
    state.blinkIn -= dt;
    if (state.blinkIn <= 0) {
      state.blinkIn = 2.2 + Math.random() * 3.6;
      state.blinkPhase = 0;
    }

    if (state.blinkPhase < 1) {
      state.blinkPhase = Math.min(1, state.blinkPhase + dt / 0.16);
    }

    const closed = state.blinkPhase < 1 ? Math.sin(state.blinkPhase * Math.PI) : 0;

    human.eyes.forEach((eye) => {
      eye.upperLid.rotation.x = -0.62 + closed * 1.05;
      eye.lowerLid.rotation.x = 0.34 - closed * 0.3;
    });
  }

  function updateGaze() {
    human.eyes.forEach((eye) => {
      if (!state.lookEnabled) {
        eye.group.rotation.set(0, 0, 0);
        return;
      }

      const headBone = bones.get('head');
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

  // ------------------------------------------------------------------- update
  function update(dt) {
    state.time += dt;

    const cadence = state.clip === 'run' ? 2.45 : 1.8;
    state.phase += dt * TAU * cadence * state.pace;

    if (state.gesture !== 'none') {
      state.gestureWeight = Math.min(1, state.gestureWeight + dt / 0.18);
    } else {
      state.gestureWeight = Math.max(0, state.gestureWeight - dt / 0.18);
    }

    clearTargets();

    if (state.clip === 'walk') walkPose(false);
    else if (state.clip === 'run') walkPose(true);
    else if (state.clip === 'sit') sitPose();
    else if (state.clip === 'glide') glidePose();
    else if (state.clip === 'swim') swimPose();
    else if (state.clip === 'fall') fallPose();
    else idlePose();

    if (state.land > 0) {
      state.land = Math.max(0, state.land - dt / 0.28);
      const absorb = Math.sin(state.land * Math.PI) * 0.8;

      poseAdd('spine', absorb * 0.24, 0, 0);
      poseAdd('chest', absorb * 0.12, 0, 0);
      poseAdd('upperLegL', absorb * 0.55, 0, 0);
      poseAdd('upperLegR', absorb * 0.55, 0, 0);
      poseAdd('lowerLegL', -absorb * 0.9, 0, 0);
      poseAdd('lowerLegR', -absorb * 0.9, 0, 0);
      poseAdd('footL', absorb * 0.3, 0, 0);
      poseAdd('footR', absorb * 0.3, 0, 0);
      poseAdd('upperArmL', absorb * 0.25, 0, 0);
      poseAdd('upperArmR', absorb * 0.25, 0, 0);
    }

    if (state.gesture !== 'none' && state.gestureWeight > 0.01 && state.clip !== 'sit') {
      copyTargets();
      clearTargets();
      if (gesturePose(state.gesture)) {
        blendGesture(state.gestureWeight);
      } else {
        clearTargets();
        for (const [name, entry] of clipPose) {
          const target = slot(targets, name);
          target.x = entry.x;
          target.y = entry.y;
          target.z = entry.z;
        }
      }
    }

    const speed = state.clip === 'walk' || state.clip === 'run' ? 9 : 12;
    applyPose(dt, speed);

    updateExpression(dt);
    updateBlink(dt);
    updateGaze();

    void eyes;
  }

  return {
    state,
    update,
    setClip(clip) {
      state.clip = clip;
    },
    setGesture(gesture) {
      state.gesture = gesture || 'none';
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
    /** Langkah kaki mengikuti kecepatan gerak sebenarnya. */
    setPace(value) {
      state.pace = clamp(Number(value) || 1, 0.35, 1.8);
    },
    blinkNow() {
      state.blinkPhase = 0;
      state.blinkIn = 2.2;
    },
    /** Dipanggil saat kaki menyentuh tanah: badan menekuk lalu bangkit. */
    land() {
      state.land = 1;
    },
    /** Dipanggil saat mulai melompat. */
    jump() {
      state.land = 0;
    },
  };
}
