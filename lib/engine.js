import * as THREE from 'three';
import {
  WORLD_HALF,
  WATER_LEVEL,
  heightAt,
  slopeAt,
  buildSky,
  buildTerrain,
  buildWater,
  buildForest,
  buildGrass,
  buildRocks,
  buildCrystals,
} from './world';
import { createAudio } from './audio';
import { createPresence } from './net';
import { createHuman } from './human/body';
import { createMotion } from './human/motion';

const GRAVITY = 26;
const WALK_SPEED = 7.6;
const RUN_SPEED = 13.2;
const SWIM_SPEED = 4.2;
const JUMP_SPEED = 8.8;
const GLIDE_FALL = -2.8;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function dampAngle(current, target, lambda, dt) {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

function findSpawn(trees = []) {
  for (let i = 0; i < 800; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * WORLD_HALF * 0.32;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = heightAt(x, z);
    if (height > 5 && height < 17 && slopeAt(x, z) < 0.35) {
      let clear = true;
      for (const tree of trees) {
        if ((tree[0] - x) ** 2 + (tree[1] - z) ** 2 < 9) {
          clear = false;
          break;
        }
      }
      if (clear) return new THREE.Vector3(x, height + 0.4, z);
    }
  }
  const height = heightAt(0, 0);
  return new THREE.Vector3(0, Math.max(height, 5) + 0.4, 0);
}

function buildAvatar(color = '#f6f1e4') {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    flatShading: true,
  });
  const cloakMaterial = new THREE.MeshStandardMaterial({
    color: '#2f6a86',
    roughness: 0.9,
    flatShading: true,
  });
  const visorMaterial = new THREE.MeshStandardMaterial({
    color: '#1d2b31',
    roughness: 0.5,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.28, 8), bodyMaterial);
  body.position.y = 0.78;
  body.castShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.37, 12, 10), bodyMaterial);
  head.position.y = 1.62;
  head.castShadow = true;

  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.74, 1.15, 8, 1, true), cloakMaterial);
  cloak.position.y = 1.02;
  cloak.castShadow = true;

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.12), visorMaterial);
  visor.position.set(0, 1.66, 0.32);

  group.add(body, head, cloak, visor);
  return group;
}

/**
 * Karakter pemain: manusia berangka 50 tulang. Kalau pembuatannya gagal
 * (misalnya canvas tidak tersedia), pakai avatar sederhana agar game tetap jalan.
 */
function createCharacter({
  shirtColor = '#2f6a86',
  skinColor = '#e3b495',
  hairColor = '#241a14',
  rigged = true,
} = {}) {
  if (rigged) {
    try {
      const human = createHuman({ skinColor, shirtColor, hairColor });
      return { human, motion: createMotion(human), root: human.root, rigged: true };
    } catch (error) {
      console.warn('Rangka manusia gagal dibuat, memakai avatar sederhana.', error);
    }
  }
  return { human: null, motion: null, root: buildAvatar(shirtColor), rigged: false };
}

function lookFromName(name, shirtColor) {
  const text = String(name || 'Penjelajah');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100003;
  }

  return {
    shirtColor,
    skinColor: SKIN_TONES[hash % SKIN_TONES.length],
    hairColor: HAIR_TONES[Math.floor(hash / 7) % HAIR_TONES.length],
  };
}

const SKIN_TONES = ['#e8b48f', '#dda079', '#c98b62', '#b07a52', '#8a5a3d', '#f0c9a8'];
const HAIR_TONES = ['#231914', '#3b2418', '#5a3a22', '#1b1b1b', '#6b4a2a', '#2f2a26'];

function disposeCharacter(character) {
  if (!character) return;
  if (character.human) character.human.dispose();
  character.root.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material && !Array.isArray(child.material)) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
    }
  });
}

const UP = new THREE.Vector3(0, 1, 0);
const groundRight = new THREE.Vector3();
const groundForward = new THREE.Vector3();
const groundUp = new THREE.Vector3();
const tiltQuaternion = new THREE.Quaternion();
const yawQuaternion = new THREE.Quaternion();
const poseQuaternion = new THREE.Quaternion();

const THIGH_LENGTH = 0.435;
const SHIN_LENGTH = 0.42;
const HIP_HEIGHT = 0.95;
const ANKLE_HEIGHT = 0.1;
const HALF_STANCE = 0.09;

/**
 * Menempelkan karakter ke tanah: ketinggian diambil dari bawah kedua kaki,
 * badan dimiringkan mengikuti kemiringan permukaan, lalu lutut ditekuk (IK
 * sederhana) supaya telapak kaki tetap di tanah, bukan menembus atau melayang.
 */
function applyGroundPose(character, position, facing, weight, dt) {
  groundRight.set(Math.cos(facing), 0, -Math.sin(facing));
  groundForward.set(Math.sin(facing), 0, Math.cos(facing));

  const groundL = heightAt(
    position.x + groundRight.x * HALF_STANCE,
    position.z + groundRight.z * HALF_STANCE,
  );
  const groundR = heightAt(
    position.x - groundRight.x * HALF_STANCE,
    position.z - groundRight.z * HALF_STANCE,
  );
  const groundF = heightAt(
    position.x + groundForward.x * 0.14,
    position.z + groundForward.z * 0.14,
  );
  const groundB = heightAt(
    position.x - groundForward.x * 0.14,
    position.z - groundForward.z * 0.14,
  );

  const slopeX = (groundL - groundR) / (HALF_STANCE * 2);
  const slopeZ = (groundF - groundB) / 0.28;

  groundUp.set(-slopeX * 0.55, 1, -slopeZ * 0.55).normalize();
  tiltQuaternion.setFromUnitVectors(UP, groundUp);
  yawQuaternion.setFromAxisAngle(UP, facing);
  poseQuaternion.copy(tiltQuaternion).multiply(yawQuaternion);

  character.root.quaternion.slerp(poseQuaternion, 1 - Math.exp(-11 * Math.max(dt, 0.0005)));

  const baseY = Math.min(groundL, groundR) + 0.006;
  const offsetY = character.motion ? character.motion.state.rootOffset : 0;
  character.root.position.set(position.x, baseY + offsetY, position.z);

  if (!character.human || !character.human.bones) return;

  const clip = character.motion ? character.motion.state.clip : 'idle';
  if (clip === 'glide' || clip === 'swim' || clip === 'fall') return;

  const bones = character.human.bones;
  const hipY = baseY + HIP_HEIGHT;

  ['L', 'R'].forEach((suffix) => {
    const isLeft = suffix === 'L';
    const ground = isLeft ? groundL : groundR;
    const ankleY = ground + ANKLE_HEIGHT;
    const reach = clamp(hipY - ankleY, 0.5, THIGH_LENGTH + SHIN_LENGTH - 0.004);

    const cosKnee =
      (THIGH_LENGTH * THIGH_LENGTH + SHIN_LENGTH * SHIN_LENGTH - reach * reach) /
      (2 * THIGH_LENGTH * SHIN_LENGTH);
    const kneeInterior = Math.acos(clamp(cosKnee, -1, 1));
    const bend = Math.PI - kneeInterior;

    const cosThigh =
      (THIGH_LENGTH * THIGH_LENGTH + reach * reach - SHIN_LENGTH * SHIN_LENGTH) /
      (2 * THIGH_LENGTH * reach);
    const thigh = Math.acos(clamp(cosThigh, -1, 1));

    const upper = bones.get(`upperLeg${suffix}`);
    const lower = bones.get(`lowerLeg${suffix}`);
    const foot = bones.get(`foot${suffix}`);
    if (!upper || !lower || !foot) return;

    const blend = clamp(weight, 0, 1);
    upper.rotation.x = upper.rotation.x * (1 - blend) + thigh * blend;
    lower.rotation.x = lower.rotation.x * (1 - blend) - bend * blend;
    foot.rotation.x = foot.rotation.x * (1 - blend) + (bend - thigh + 0.04) * blend;
  });
}

function makeLabel(text, color = '#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(4, 14, 19, 0.55)';
  ctx.fillRect(28, 10, 200, 44);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 33);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3, 0.75, 1);
  sprite.position.y = 2.05;
  return sprite;
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Balon chat di atas kepala: kanvas kecil dengan teks yang dipotong rapi. */
function buildBubbleSprite(value) {
  const maxLineWidth = 340;
  const paddingX = 26;
  const paddingY = 16;
  const font = '600 28px system-ui, -apple-system, "Segoe UI", sans-serif';
  const lineHeight = 36;

  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;

  const words = String(value).slice(0, 90).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  let truncated = false;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure.measureText(candidate).width > maxLineWidth) {
      lines.push(current);
      current = word;
      if (lines.length === 3) {
        truncated = true;
        break;
      }
    } else {
      current = candidate;
    }
  }

  if (!truncated && current && lines.length < 3) lines.push(current);
  if (!lines.length) lines.push('…');
  if (truncated) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -2)}…`;

  const textWidth = Math.max(...lines.map((line) => measure.measureText(line).width));
  const boxWidth = Math.ceil(textWidth) + paddingX * 2;
  const boxHeight = lines.length * lineHeight + paddingY * 2 + 14;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(boxWidth * scale);
  canvas.height = Math.ceil(boxHeight * scale);

  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(6, 20, 26, 0.88)';
  ctx.strokeStyle = 'rgba(159, 232, 255, 0.6)';
  ctx.lineWidth = 2;
  roundRectPath(ctx, 1, 1, boxWidth - 2, boxHeight - 14, 14);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(boxWidth / 2 - 10, boxHeight - 14);
  ctx.lineTo(boxWidth / 2, boxHeight - 1);
  ctx.lineTo(boxWidth / 2 + 10, boxHeight - 14);
  ctx.closePath();
  ctx.fillStyle = 'rgba(6, 20, 26, 0.88)';
  ctx.fill();

  ctx.font = font;
  ctx.fillStyle = '#eef8fb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, index) => {
    ctx.fillText(line, boxWidth / 2, paddingY + lineHeight / 2 + index * lineHeight + 4);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  const unit = 1 / 118;
  sprite.scale.set(boxWidth * unit, boxHeight * unit, 1);
  return sprite;
}

export function createGame({ canvas, onStats, onReady }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfe2ec');

  const fog = new THREE.FogExp2(0xc7dce8, 0.0132);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(58, 1, 0.15, 1600);

  const sky = buildSky();
  scene.add(sky.mesh);
  scene.add(buildTerrain());
  const water = buildWater();
  scene.add(water);
  const forest = buildForest();
  scene.add(forest);
  scene.add(buildGrass());
  const rocks = buildRocks();
  scene.add(rocks);

  const crystals = buildCrystals();
  scene.add(crystals.group);

  const hemisphere = new THREE.HemisphereLight(0xd8ecf7, 0x4b5c47, 0.85);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xffe9c9, 1.75);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 340;
  sun.shadow.camera.left = -58;
  sun.shadow.camera.right = 58;
  sun.shadow.camera.top = 58;
  sun.shadow.camera.bottom = -58;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.12;
  scene.add(sun);
  scene.add(sun.target);

  const audio = createAudio();

  // QA: paksa satu pose lewat ?debug=walk|run|fall|glide|swim|sit untuk
  // memeriksa animasi tanpa menekan tombol. Tanpa parameter ini tidak berpengaruh.
  const debugParams = new URLSearchParams(window.location.search);
  const debugClip = debugParams.get('debug') || '';

  const spawn = findSpawn(forest.userData.trees || []);
  const player = {
    position: spawn.clone(),
    velocity: new THREE.Vector3(),
    facing: Math.PI,
    onGround: false,
    gliding: false,
    swimming: false,
    stepTimer: 0,
    walkPhase: 0,
    inWater: false,
  };

  const character = createCharacter({
    shirtColor: '#2f6a86',
    skinColor: '#e3b495',
    hairColor: '#241a14',
  });
  character.root.position.copy(player.position);
  scene.add(character.root);

  const cam = { yaw: player.facing + Math.PI, pitch: 0.5, distance: 7.5 };

  const input = { x: 0, y: 0, jumpHeld: false, jumpPressed: false, sprint: false };
  const keys = new Set();

  let started = false;
  let running = true;
  let muted = false;
  let score = 0;
  let ghostCount = 0;
  let elapsed = 0;
  let statsTimer = 0;
  let lastAirUpdate = 0;
  let fpsSmoothed = 60;
  let frameHandle = 0;
  let lastFrame = performance.now();
  let stickElement = null;
  let knobElement = null;

  const camTarget = new THREE.Vector3();
  const camDesired = new THREE.Vector3();
  const wish = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const moveDirection = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();
  const cameraRay = new THREE.Raycaster();
  let lastCameraProbe = 0;
  let coyote = 0;
  let jumpBuffer = 0;

  const stick = { id: null, originX: 0, originY: 0, x: 0, y: 0 };
  const look = { id: null, x: 0, y: 0 };

  // ---------------------------------------------------------------- presence
  let presence = null;
  let netStatus = 'offline';
  let netTransport = '';
  const ghosts = new Map();
  const bubbles = new Map();

  function disposeSprite(sprite) {
    if (!sprite) return;
    if (sprite.parent) sprite.parent.remove(sprite);
    if (sprite.material) {
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
    }
  }

  /** Balon chat di atas kepala pemain ini sendiri atau pemain lain. */
  function showBubble(key, value) {
    const clean = String(value == null ? '' : value).slice(0, 90).trim();
    if (!clean) return;

    const isSelf = key === 'self';
    const holder = isSelf ? scene : ghosts.get(key)?.root;
    if (!holder) return;

    const previous = bubbles.get(key);
    if (previous) disposeSprite(previous.sprite);

    const sprite = buildBubbleSprite(clean);
    sprite.position.y = isSelf ? 2.35 : 2.9;
    holder.add(sprite);
    bubbles.set(key, { sprite, expires: elapsed + 7 });
  }

  function updateBubbles() {
    for (const [key, entry] of bubbles) {
      if (elapsed > entry.expires) {
        disposeSprite(entry.sprite);
        bubbles.delete(key);
        continue;
      }

      const remaining = entry.expires - elapsed;
      if (entry.sprite.material) {
        entry.sprite.material.opacity = clamp(remaining / 0.6, 0, 1);
      }

      if (key === 'self') {
        entry.sprite.position.set(
          player.position.x,
          player.position.y + 2.35,
          player.position.z,
        );
      }
    }
  }

  function syncGhosts(players) {
    const seen = new Set();

    for (const entry of players) {
      if (!entry || !entry.id) continue;
      seen.add(entry.id);

      let ghost = ghosts.get(entry.id);
      if (!ghost) {
        const rigged = ghosts.size < 6;
        const look = lookFromName(entry.name || 'Penjelajah', entry.color || '#9fe8ff');
        const ghostCharacter = createCharacter({ ...look, rigged });
        const label = makeLabel(entry.name || 'Penjelajah', entry.color || '#dff6ff');
        ghostCharacter.root.add(label);
        ghostCharacter.root.position.set(entry.x, entry.y, entry.z);
        scene.add(ghostCharacter.root);

        ghost = {
          root: ghostCharacter.root,
          character: ghostCharacter,
          name: entry.name || 'Penjelajah',
          target: new THREE.Vector3(entry.x, entry.y, entry.z),
          facing: entry.ry || 0,
          facingSmoothed: entry.ry || 0,
          speed: 0,
          animTime: 0,
        };
        ghosts.set(entry.id, ghost);
      }

      ghost.target.set(entry.x, entry.y, entry.z);
      ghost.facing = entry.ry || 0;
    }

    for (const [id, ghost] of ghosts) {
      if (seen.has(id)) continue;
      const bubble = bubbles.get(id);
      if (bubble) {
        disposeSprite(bubble.sprite);
        bubbles.delete(id);
      }
      scene.remove(ghost.root);
      disposeCharacter(ghost.character);
      ghosts.delete(id);
    }

    ghostCount = ghosts.size;
  }

  // ------------------------------------------------------------------- input
  function onKeyDown(event) {
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    keys.add(event.code);
    if (event.code === 'Space' && !event.repeat) {
      input.jumpHeld = true;
      input.jumpPressed = true;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') input.sprint = true;
  }

  function onKeyUp(event) {
    keys.delete(event.code);
    if (event.code === 'Space') input.jumpHeld = false;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') input.sprint = false;
  }

  function placeKnob(dx, dy) {
    if (knobElement) knobElement.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function startStick(event) {
    stick.id = event.pointerId;
    stick.originX = event.clientX;
    stick.originY = event.clientY;
    stick.x = 0;
    stick.y = 0;

    if (stickElement) {
      stickElement.style.left = `${event.clientX}px`;
      stickElement.style.top = `${event.clientY}px`;
      stickElement.classList.add('is-on');
    }
    placeKnob(0, 0);
  }

  function updateStick(event) {
    const radius = 58;
    let dx = event.clientX - stick.originX;
    let dy = event.clientY - stick.originY;
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = (dx / length) * radius;
      dy = (dy / length) * radius;
    }
    placeKnob(dx, dy);

    const nx = dx / radius;
    const ny = dy / radius;
    const dead = 0.12;
    input.x = Math.abs(nx) < dead ? 0 : nx;
    input.y = Math.abs(ny) < dead ? 0 : -ny;
  }

  function endStick() {
    stick.id = null;
    input.x = 0;
    input.y = 0;
    if (stickElement) stickElement.classList.remove('is-on');
    placeKnob(0, 0);
  }

  function onPointerDown(event) {
    if (!started) return;

    if (event.pointerType === 'mouse') {
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        canvas.requestPointerLock();
        return;
      }
      if (look.id === null) {
        look.id = event.pointerId;
        look.x = event.clientX;
        look.y = event.clientY;
      }
      return;
    }

    if (event.clientX < window.innerWidth * 0.46 && stick.id === null) {
      startStick(event);
    } else if (look.id === null) {
      look.id = event.pointerId;
      look.x = event.clientX;
      look.y = event.clientY;
    }
  }

  function onPointerMove(event) {
    if (document.pointerLockElement === canvas) {
      cam.yaw -= event.movementX * 0.0026;
      cam.pitch = clamp(cam.pitch + event.movementY * 0.0022, 0.02, 1.2);
      return;
    }

    if (stick.id === event.pointerId) {
      updateStick(event);
      return;
    }

    if (look.id === event.pointerId) {
      cam.yaw -= (event.clientX - look.x) * 0.006;
      cam.pitch = clamp(cam.pitch + (event.clientY - look.y) * 0.004, 0.02, 1.2);
      look.x = event.clientX;
      look.y = event.clientY;
    }
  }

  function onPointerUp(event) {
    if (stick.id === event.pointerId) endStick();
    if (look.id === event.pointerId) look.id = null;
  }

  function onWheel(event) {
    cam.distance = clamp(cam.distance + event.deltaY * 0.01, 4.5, 18);
  }

  function onBlur() {
    keys.clear();
    input.x = 0;
    input.y = 0;
    input.jumpHeld = false;
    input.sprint = false;
    endStick();
  }

  // -------------------------------------------------------------------- size
  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  // -------------------------------------------------------------- simulation
  function updatePlayer(dt) {
    let ix = input.x;
    let iy = input.y;

    if (debugClip === 'walk' || debugClip === 'run') {
      iy = 1;
      input.sprint = debugClip === 'run';
    }

    let kx = 0;
    let ky = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) ky += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) ky -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;

    if (kx !== 0 || ky !== 0) {
      const length = Math.hypot(kx, ky);
      ix = kx / length;
      iy = ky / length;
    }

    forward.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    right.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));

    wish.set(0, 0, 0).addScaledVector(forward, iy).addScaledVector(right, ix);

    const intent = Math.min(1, wish.length());
    if (intent > 0.001) wish.normalize();

    const ground = heightAt(player.position.x, player.position.z);
    player.inWater = ground < WATER_LEVEL - 0.2 && player.position.y < WATER_LEVEL + 1.1;

    const speed = player.inWater
      ? SWIM_SPEED
      : input.sprint && !player.gliding
        ? RUN_SPEED
        : WALK_SPEED;

    const targetX = wish.x * speed * intent;
    const targetZ = wish.z * speed * intent;
    const grip = player.onGround ? 13 : player.inWater ? 4 : player.gliding ? 3.2 : 6;

    player.velocity.x = damp(player.velocity.x, targetX, grip, dt);
    player.velocity.z = damp(player.velocity.z, targetZ, grip, dt);

    // Coyote time (masih boleh lompat sesaat setelah lepas tanah) dan jump buffer
    // (tekanan tombol sebelum mendarat tetap dipakai).
    coyote = player.onGround ? 0.12 : Math.max(0, coyote - dt);

    if (input.jumpPressed) {
      jumpBuffer = 0.14;
      input.jumpPressed = false;
    } else {
      jumpBuffer = Math.max(0, jumpBuffer - dt);
    }

    if (jumpBuffer > 0 && !player.inWater && coyote > 0) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
      coyote = 0;
      jumpBuffer = 0;
      audio.jump();
      if (character.motion) character.motion.jump();
    } else if (jumpBuffer > 0 && player.inWater) {
      player.velocity.y = 4.4;
      jumpBuffer = 0;
      audio.splash();
    }

    // Lepas tombol lebih awal: lompat jadi lebih pendek (variable jump height).
    if (!input.jumpHeld && player.velocity.y > 0) {
      player.velocity.y -= GRAVITY * 1.7 * dt;
    }

    player.velocity.y -= GRAVITY * dt;

    const wantsGlide = input.jumpHeld && !player.onGround && !player.inWater && player.velocity.y < -0.4;
    if (wantsGlide) {
      if (!player.gliding) audio.glide();
      player.gliding = true;
      player.velocity.y += GRAVITY * 0.86 * dt;
      player.velocity.y = Math.max(player.velocity.y, GLIDE_FALL);
    } else {
      player.gliding = false;
    }

    player.position.addScaledVector(player.velocity, dt);

    const floor = heightAt(player.position.x, player.position.z);
    const wasOnGround = player.onGround;

    if (player.position.y <= floor) {
      if (player.velocity.y < -7) audio.land();
      if (!wasOnGround && character.motion) character.motion.land();
      player.position.y = floor;
      player.velocity.y = 0;
      player.onGround = true;
      player.gliding = false;
    } else {
      player.onGround = false;
    }

    if (floor < WATER_LEVEL - 0.4 && player.position.y < WATER_LEVEL + 0.55) {
      player.position.y = WATER_LEVEL + 0.55;
      player.velocity.y = Math.max(player.velocity.y, 0);
      player.onGround = false;
      player.gliding = false;
    }

    const radius = Math.hypot(player.position.x, player.position.z);
    const limit = WORLD_HALF * 0.93;
    if (radius > limit) {
      const scale = limit / radius;
      player.position.x *= scale;
      player.position.z *= scale;
    }

    const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);

    if (intent > 0.05 && horizontalSpeed > 0.6) {
      const targetFacing = Math.atan2(player.velocity.x, player.velocity.z);
      player.facing = dampAngle(player.facing, targetFacing, 12, dt);
    }

    if (character.motion) {
      let clip = 'idle';
      if (debugClip && !player.inWater) clip = debugClip;
      else if (player.gliding) clip = 'glide';
      else if (player.inWater) clip = 'swim';
      else if (!player.onGround) clip = 'fall';
      else if (horizontalSpeed > 9.5) clip = 'run';
      else if (horizontalSpeed > 0.7) clip = 'walk';

      character.motion.setClip(clip);
      character.motion.setPace(horizontalSpeed > 0.7 ? horizontalSpeed / (clip === 'run' ? 13.2 : 7.6) : 1);
      character.motion.update(dt);
    }

    if (character.human && player.onGround) {
      applyGroundPose(character, player.position, player.facing, 1, dt);
    } else {
      const offsetY = character.motion ? character.motion.state.rootOffset : 0;
      character.root.position.set(
        player.position.x,
        player.position.y + offsetY,
        player.position.z,
      );
      character.root.rotation.set(0, player.facing, 0);
    }

    if (player.onGround && horizontalSpeed > 0.8) {
      player.walkPhase += horizontalSpeed * dt * 1.9;
      player.stepTimer += horizontalSpeed * dt;
      if (player.stepTimer > 2.1) {
        player.stepTimer = 0;
        audio.step();
      }
    } else {
      player.stepTimer = Math.min(player.stepTimer, 2);
    }

    if (elapsed - lastAirUpdate > 0.22) {
      lastAirUpdate = elapsed;
      audio.setAir(horizontalSpeed, player.gliding);
    }

    checkCrystals();
  }

  function updateCamera(dt, instant = false) {
    if (!started) {
      cam.yaw += dt * 0.16;
      camTarget.set(spawn.x, spawn.y + 1.6, spawn.z);
      const distance = 13;
      const pitch = 0.52;
      camDesired.set(
        camTarget.x + Math.sin(cam.yaw) * Math.cos(pitch) * distance,
        camTarget.y + Math.sin(pitch) * distance,
        camTarget.z + Math.cos(cam.yaw) * Math.cos(pitch) * distance,
      );
      const floorAtOrbit = heightAt(camDesired.x, camDesired.z);
      if (camDesired.y < floorAtOrbit + 1.2) camDesired.y = floorAtOrbit + 1.2;
      camera.position.copy(camDesired);
      camera.lookAt(camTarget);
      return;
    }

    camTarget.set(player.position.x, player.position.y + 1.55, player.position.z);

    const cosPitch = Math.cos(cam.pitch);
    camDesired.set(
      camTarget.x + Math.sin(cam.yaw) * cosPitch * cam.distance,
      camTarget.y + Math.sin(cam.pitch) * cam.distance + 0.6,
      camTarget.z + Math.cos(cam.yaw) * cosPitch * cam.distance,
    );

    const floorAtCamera = heightAt(camDesired.x, camDesired.z);
    const minY = Math.max(floorAtCamera + 1.1, WATER_LEVEL + 1.2);
    if (camDesired.y < minY) camDesired.y = minY;

    // Jangan biarkan kamera menembus pohon atau batu: kalau terhalang, tarik mendekat.
    if (elapsed - lastCameraProbe > 0.05) {
      lastCameraProbe = elapsed;
      cameraDirection.subVectors(camDesired, camTarget);
      const probeDistance = cameraDirection.length();

      if (probeDistance > 0.6) {
        cameraDirection.divideScalar(probeDistance);
        cameraRay.set(camTarget, cameraDirection);
        cameraRay.far = probeDistance;

        const blockers = cameraRay.intersectObjects([forest, rocks], true);
        if (blockers.length > 0) {
          const safeDistance = Math.max(1.4, blockers[0].distance - 0.3);
          camDesired.copy(camTarget).addScaledVector(cameraDirection, safeDistance);

          // Kalau terpaksa sangat dekat, angkat kamera supaya melihat dari atas
          // tajuk, bukan menembus batang.
          if (safeDistance < 2.6) camDesired.y += 1.8;
        }
      }
    }

    if (instant) {
      camera.position.copy(camDesired);
    } else {
      camera.position.lerp(camDesired, 1 - Math.pow(0.0016, dt));
    }

    camera.lookAt(camTarget);
  }

  function checkCrystals() {
    for (let i = 0; i < crystals.list.length; i += 1) {
      const crystal = crystals.list[i];
      if (crystal.taken) continue;
      const dx = crystal.mesh.position.x - player.position.x;
      const dy = crystal.mesh.position.y - (player.position.y + 1.2);
      const dz = crystal.mesh.position.z - player.position.z;
      if (dx * dx + dy * dy + dz * dz < 7.2) {
        crystal.taken = true;
        crystal.mesh.visible = false;
        crystal.halo.visible = false;
        score += 1;
        audio.collect(score);
        updateMist();
      }
    }
  }

  function updateMist() {
    const total = Math.max(1, crystals.list.length);
    const progress = score / total;
    fog.density = 0.0132 - progress * 0.0096;
    const topColor = sky.material.uniforms.topColor.value;
    topColor.lerp(new THREE.Color('#9dc7e0'), progress * 0.35);
    crystals.list.forEach((crystal) => {
      if (crystal.taken) return;
      crystal.mesh.material.emissiveIntensity = 1.7 - progress * 0.55;
    });
  }

  function updateCrystals(dt) {
    for (let i = 0; i < crystals.list.length; i += 1) {
      const crystal = crystals.list[i];
      if (crystal.taken) continue;
      crystal.mesh.rotation.y += dt * 1.1;
      crystal.mesh.rotation.x += dt * 0.4;
      crystal.mesh.position.y = crystal.base.y + 2.3 + Math.sin(elapsed * 1.6 + crystal.bob) * 0.28;
      crystal.halo.position.copy(crystal.mesh.position);
      const pulse = 4.9 + Math.sin(elapsed * 2.2 + crystal.bob) * 0.5;
      crystal.halo.scale.set(pulse, pulse, 1);
    }
  }

  function updateGhosts(dt) {
    for (const ghost of ghosts.values()) {
      const previousX = ghost.root.position.x;
      const previousZ = ghost.root.position.z;

      ghost.root.position.lerp(ghost.target, 1 - Math.pow(0.0008, dt));
      ghost.facingSmoothed = dampAngle(ghost.facingSmoothed, ghost.facing, 8, dt);

      const moved = Math.hypot(ghost.root.position.x - previousX, ghost.root.position.z - previousZ);
      const speed = dt > 0 ? moved / dt : 0;
      ghost.speed += (speed - ghost.speed) * 0.2;

      if (ghost.character.motion) {
        ghost.animTime += dt;
        if (ghost.animTime > 0.06) {
          const clip = ghost.speed > 9 ? 'run' : ghost.speed > 0.5 ? 'walk' : 'idle';
          ghost.character.motion.setClip(clip);
          ghost.character.motion.setPace(
            ghost.speed > 0.5 ? ghost.speed / (clip === 'run' ? 13.2 : 7.6) : 1,
          );
          ghost.character.motion.update(ghost.animTime);
          ghost.animTime = 0;
        }
      }

      if (ghost.character.human) {
        applyGroundPose(ghost.character, ghost.root.position, ghost.facingSmoothed, 0.7, dt);
      } else {
        ghost.root.rotation.y = ghost.facingSmoothed;
      }
    }
  }

  function updateSky(dt) {
    const tint = 0.5 + 0.5 * Math.sin(elapsed * 0.06);
    sky.material.uniforms.bottomColor.value.lerpColors(
      new THREE.Color('#dfeaf0'),
      new THREE.Color('#f2c9a2'),
      tint * 0.55,
    );
    sun.color.setHSL(0.09 + tint * 0.02, 0.55, 0.72);
    sun.intensity = 1.55 + tint * 0.35;
    hemisphere.intensity = 0.72 + tint * 0.2;
    fog.color.copy(sky.material.uniforms.bottomColor.value).multiplyScalar(0.95);

    water.position.y = WATER_LEVEL + Math.sin(elapsed * 0.7) * 0.06;
  }

  function emitStats(dt) {
    statsTimer += dt;
    if (statsTimer < 0.18) return;
    statsTimer = 0;
    if (!onStats) return;

    const total = crystals.list.length;
    const progress = total ? score / total : 0;
    onStats({
      score,
      total,
      mist: Math.round((1 - progress) * 100),
      players: ghostCount + 1,
      names: [...ghosts.values()].map((ghost) => ghost.name),
      net: netStatus,
      transport: netTransport,
      gliding: player.gliding,
      swimming: player.inWater,
      fps: Math.round(fpsSmoothed),
    });
  }

  function frame(now) {
    if (!running) return;
    frameHandle = requestAnimationFrame(frame);

    const rawDt = (now - lastFrame) / 1000;
    lastFrame = now;
    const dt = clamp(rawDt, 0.0005, 0.05);

    elapsed += dt;
    fpsSmoothed = damp(fpsSmoothed, 1 / Math.max(rawDt, 0.001), 3, dt);

    if (started) updatePlayer(dt);
    updateCrystals(dt);
    updateGhosts(dt);
    updateBubbles();
    updateSky(dt);
    updateCamera(dt);

    sun.position.set(player.position.x + 92, player.position.y + 128, player.position.z + 48);
    sun.target.position.copy(player.position);
    sun.target.updateMatrixWorld();

    emitStats(dt);
    renderer.render(scene, camera);
  }

  // ---------------------------------------------------------------- lifecycle
  function buildStick() {
    stickElement = document.createElement('div');
    stickElement.className = 'stick';
    knobElement = document.createElement('div');
    knobElement.className = 'stick__knob';
    stickElement.appendChild(knobElement);
    const host = canvas.parentElement || document.body;
    host.appendChild(stickElement);
  }

  buildStick();
  resize();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', resize);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('wheel', onWheel, { passive: true });

  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
  }

  lastFrame = performance.now();
  frameHandle = requestAnimationFrame(frame);

  if (onReady) setTimeout(onReady, 60);

  return {
    start(options = {}) {
      if (started) return;
      started = true;
      audio.init();
      audio.setMuted(muted);

      if (character.human) {
        const look = lookFromName(options.name || 'Penjelajah', options.color || '#2f6a86');
        character.human.shirt.material.color.set(look.shirtColor);
        character.human.hair.material.color.set(look.hairColor);
        character.human.body.material.color.set(look.skinColor);
      }
      cam.yaw = player.facing + Math.PI;
      updateCamera(0.016, true);

      presence = createPresence({
        name: options.name || 'Penjelajah',
        color: options.color || '#9fe8ff',
        room: options.room || 'lobby',
        onPlayers: (players) => syncGhosts(players),
        onChat: (entry) => {
          if (entry && entry.id) showBubble(entry.id, entry.text);
        },
        onStatus: (status, transport) => {
          netStatus = status;
          netTransport = transport || '';
        },
      });

      presence.start(() => ({
        x: Number(player.position.x.toFixed(2)),
        y: Number(player.position.y.toFixed(2)),
        z: Number(player.position.z.toFixed(2)),
        ry: Number(player.facing.toFixed(3)),
      }));
    },
    setMuted(value) {
      muted = Boolean(value);
      audio.setMuted(muted);
    },
    setJumpHeld(value) {
      input.jumpHeld = Boolean(value);
      if (value) input.jumpPressed = true;
    },
    /** Chat singkat: tampil di balon atas kepala dan disiarkan sekali saja. */
    chat(value) {
      const clean = String(value == null ? '' : value).slice(0, 90).trim();
      if (!clean || !started) return;
      showBubble('self', clean);
      if (presence) presence.chat(clean);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(frameHandle);
      if (presence) presence.stop();
      audio.dispose();

      for (const entry of bubbles.values()) disposeSprite(entry.sprite);
      bubbles.clear();

      for (const ghost of ghosts.values()) disposeCharacter(ghost.character);
      ghosts.clear();

      disposeCharacter(character);

      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('wheel', onWheel);
      if (resizeObserver) resizeObserver.disconnect();
      if (stickElement && stickElement.parentNode) stickElement.parentNode.removeChild(stickElement);

      if (document.pointerLockElement === canvas && document.exitPointerLock) {
        document.exitPointerLock();
      }

      scene.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            if (material.map) material.map.dispose();
            material.dispose();
          });
        }
      });

      renderer.dispose();
    },
  };
}
