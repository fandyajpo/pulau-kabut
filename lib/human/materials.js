import * as THREE from 'three';

const TAU = Math.PI * 2;

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function valueNoise(seed) {
  const rand = random(seed);
  const grid = new Float32Array(64 * 64);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rand();

  const at = (x, y) => grid[((y & 63) * 64) + (x & 63)];

  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

/** Ketinggian kulit: pori halus, kerutan, sedikit bercak pigmen. */
function skinHeight(size = 512) {
  const height = new Float32Array(size * size);
  const base = valueNoise(11);
  const pores = valueNoise(29);
  const folds = valueNoise(53);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * 18;
      const v = (y / size) * 18;

      let h = base(u, v) * 0.5;
      h += pores((x / size) * 96, (y / size) * 96) * 0.28;
      h += Math.sin((x / size) * TAU * 26 + folds(u, v) * 8) * 0.06;
      h += Math.sin((y / size) * TAU * 34 + folds(u + 3, v) * 9) * 0.05;
      h += folds(u * 3, v * 3) * 0.22;
      height[y * size + x] = h;
    }
  }
  return height;
}

function heightToNormal(height, size, strength) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;

  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const length = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      data[i] = ((dx / length) * 0.5 + 0.5) * 255;
      data[i + 1] = ((dy / length) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function heightToRoughness(height, size) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let i = 0; i < size * size; i += 1) {
    const value = Math.min(1, Math.max(0, 0.58 + height[i] * 0.22));
    const shade = value * 255;
    data[i * 4] = shade;
    data[i * 4 + 1] = shade;
    data[i * 4 + 2] = shade;
    data[i * 4 + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function skinColorCanvas(size = 512) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const rand = random(97);
  const blotch = valueNoise(131);

  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = blotch((x / size) * 12, (y / size) * 12);
      const i = (y * size + x) * 4;
      data[i] = 232 + (n - 0.5) * 26;
      data[i + 1] = 198 + (n - 0.5) * 22;
      data[i + 2] = 178 + (n - 0.5) * 20;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // bintik pigmen dan freckle halus
  for (let i = 0; i < 420; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.6 + rand() * 2.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = `rgba(150, 96, 74, ${0.12 + rand() * 0.18})`;
    ctx.fill();
  }

  return canvas;
}

function weaveCanvas(size = 256) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < size; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.09)';
  for (let i = 3; i < size; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  return canvas;
}

function irisCanvas(size = 256) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const rand = random(7);

  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#241a12');
  gradient.addColorStop(0.35, '#5a4326');
  gradient.addColorStop(0.72, '#8a6a3c');
  gradient.addColorStop(1, '#22160c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 260; i += 1) {
    const angle = rand() * TAU;
    const inner = size * 0.12 + rand() * size * 0.06;
    const outer = size * (0.36 + rand() * 0.16);
    const cx = size / 2;
    const cy = size / 2;

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(226, 196, 140, 0.22)' : 'rgba(20, 12, 6, 0.25)';
    ctx.lineWidth = 0.8 + rand() * 1.8;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.12, 0, TAU);
  ctx.fillStyle = '#0a0705';
  ctx.fill();

  return canvas;
}

function toTexture(canvas, { srgb = false, repeat = 1 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createSkinTextures({ size = 512 } = {}) {
  const height = skinHeight(size);
  const normalCanvas = heightToNormal(height, size, 2.4);
  const roughCanvas = heightToRoughness(height, size);
  const colorCanvas = skinColorCanvas(size);

  const map = toTexture(colorCanvas, { srgb: true, repeat: 3 });
  const normalMap = toTexture(normalCanvas, { repeat: 3 });
  const roughnessMap = toTexture(roughCanvas, { repeat: 3 });

  return { map, normalMap, roughnessMap };
}

/** Kulit: sedikit glossy di hidung/dahi, dengan tambahan sebaran cahaya hangat (SSS). */
export function createSkinMaterial({ textures, color = '#e8c3a5', roughness = 0.62 }) {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: textures.map,
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: textures.roughnessMap,
    roughness,
    metalness: 0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.62,
    sheen: 0.35,
    sheenColor: new THREE.Color('#ff9f86'),
    sheenRoughness: 0.75,
  });

  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>',
      `#include <lights_fragment_begin>
      {
        vec3 sssDirection = normalize(vec3(0.45, 0.65, 0.62));
        float sssWrap = clamp(dot(normalize(normal), sssDirection) * 0.5 + 0.5, 0.0, 1.0);
        float sssAmount = pow(sssWrap, 2.4) * 0.32;
        reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.0, 0.36, 0.26) * sssAmount;
      }`,
    );
  };
  material.customProgramCacheKey = () => 'human-skin';

  return material;
}

export function createClothMaterial({ color = '#3c4a56', weave }) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    normalMap: weave ? toTexture(weave, { repeat: 6 }) : null,
    normalScale: new THREE.Vector2(0.22, 0.22),
    roughness: 0.88,
    metalness: 0,
    sheen: 0.55,
    sheenColor: new THREE.Color('#cfd8e0'),
    sheenRoughness: 0.9,
    side: THREE.DoubleSide,
  });
}

export function createWeaveCanvas() {
  return weaveCanvas(256);
}

export function createEyeMaterials() {
  const iris = toTexture(irisCanvas(256), { srgb: true });

  const sclera = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f3ece6'),
    roughness: 0.28,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    sheen: 0.2,
    sheenColor: new THREE.Color('#ffd8c8'),
  });

  const irisMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#8a6a44'),
    map: iris,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    metalness: 0,
  });

  const cornea = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.02,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.01,
    transparent: true,
    opacity: 0.16,
    envMapIntensity: 1.6,
  });

  const pupil = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#050505'),
    roughness: 0.4,
  });

  return { sclera, iris: irisMaterial, cornea, pupil };
}

export function createHairMaterial({ color = '#231914' } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.52,
    metalness: 0,
    sheen: 0.7,
    sheenColor: new THREE.Color('#6d5546'),
    side: THREE.DoubleSide,
  });
}

export function createLipMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#b76f66'),
    roughness: 0.42,
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
    sheen: 0.3,
    sheenColor: new THREE.Color('#ff9d90'),
  });
}

export function createMouthMaterial() {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3f1f1d'),
    roughness: 0.7,
  });
}

export function createNailMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#e8cfc4'),
    roughness: 0.3,
    clearcoat: 0.9,
    clearcoatRoughness: 0.2,
    metalness: 0,
  });
}

export function disposeTextures(textures) {
  for (const texture of Object.values(textures)) {
    if (texture && texture.dispose) texture.dispose();
  }
}

// Tekstur dan material mata dipakai bersama oleh semua karakter di satu scene,
// supaya pulau tidak membuat ulang peta pori untuk setiap pemain.
let sharedSkinTextures = null;
let sharedEyeMaterials = null;
let sharedWeave = null;

export function getSharedSkinTextures() {
  if (!sharedSkinTextures) sharedSkinTextures = createSkinTextures({ size: 512 });
  return sharedSkinTextures;
}

export function getSharedEyeMaterials() {
  if (!sharedEyeMaterials) sharedEyeMaterials = createEyeMaterials();
  return sharedEyeMaterials;
}

export function getSharedWeave() {
  if (!sharedWeave) sharedWeave = createWeaveCanvas();
  return sharedWeave;
}
