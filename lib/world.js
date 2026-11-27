import * as THREE from 'three';

export const WORLD_SIZE = 420;
export const WORLD_HALF = WORLD_SIZE / 2;
export const WATER_LEVEL = 0.4;

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const u = fade(xf);
  const v = fade(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x, y, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += noise2(x * freq, y * freq) * amp;
    norm += amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Tinggi tanah di titik mana pun: satu pulau, jatuh ke laut di pinggirnya. */
export function heightAt(x, z) {
  const dist = Math.hypot(x, z) / WORLD_HALF;
  const mask = 1 - smoothstep(0.46, 1.0, dist);
  const ridge = fbm(x * 0.0085 + 11.3, z * 0.0085 - 4.7, 4);
  const hills = fbm(x * 0.021 + 3.1, z * 0.021 + 9.4, 3);
  const grit = noise2(x * 0.13, z * 0.13) - 0.5;

  let height = (ridge * 30 - 8) * mask;
  height += (hills - 0.5) * 9 * mask;
  height += grit * 1.6 * mask;
  height -= (1 - mask) * 15;
  return height;
}

export function slopeAt(x, z) {
  const e = 1.5;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildTerrain() {
  const segments = 190;
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);

  const sand = new THREE.Color('#d9c9a1');
  const grass = new THREE.Color('#5f9459');
  const deep = new THREE.Color('#396b45');
  const rock = new THREE.Color('#7d827c');
  const snow = new THREE.Color('#eaf1f3');
  const color = new THREE.Color();

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const height = heightAt(x, z);
    position.setY(i, height);

    const tint = noise2(x * 0.07 + 40, z * 0.07 - 12);

    if (height < 1.5 + tint * 0.9) {
      color.copy(sand);
    } else if (height < 12) {
      color.copy(grass).lerp(deep, smoothstep(3, 13, height));
    } else if (height < 19) {
      color.copy(deep).lerp(rock, smoothstep(12, 20, height));
    } else {
      color.copy(rock).lerp(snow, smoothstep(19, 25, height));
    }

    color.offsetHSL((tint - 0.5) * 0.025, (tint - 0.5) * 0.05, (tint - 0.5) * 0.075);

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

export function buildWater() {
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE * 2.4, WORLD_SIZE * 2.4, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: '#2f7791',
    transparent: true,
    opacity: 0.86,
    roughness: 0.12,
    metalness: 0.45,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = WATER_LEVEL;
  mesh.name = 'water';
  return mesh;
}

export function buildForest(seed = 9137) {
  const random = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'forest';

  const count = 340;

  const trunkGeometry = new THREE.CylinderGeometry(0.26, 0.44, 3.4, 6);
  trunkGeometry.translate(0, 1.7, 0);
  const leafGeometry = new THREE.ConeGeometry(2.15, 5.4, 7);
  leafGeometry.translate(0, 5.5, 0);

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#6d4b34', roughness: 1 });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: '#3f7d4e',
    roughness: 0.9,
    flatShading: true,
  });

  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, count);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const trees = [];

  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < 12000) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * WORLD_HALF * 0.88;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = heightAt(x, z);

    if (height < 2.4 || height > 16.5) continue;
    if (slopeAt(x, z) > 0.48) continue;

    const size = 0.7 + random() * 0.75;
    position.set(x, height - 0.25, z);
    quaternion.setFromAxisAngle(axis, random() * Math.PI * 2);
    scale.set(size, size * (0.9 + random() * 0.3), size);
    matrix.compose(position, quaternion, scale);

    trunks.setMatrixAt(placed, matrix);
    leaves.setMatrixAt(placed, matrix);
    color.setHSL(0.31 + random() * 0.07, 0.32 + random() * 0.18, 0.27 + random() * 0.14);
    leaves.setColorAt(placed, color);

    trees.push([x, z]);
    placed += 1;
  }

  trunks.count = placed;
  leaves.count = placed;
  trunks.castShadow = true;
  leaves.castShadow = true;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;

  group.add(trunks, leaves);
  group.userData.trees = trees;
  return group;
}

export function buildRocks(seed = 5511) {
  const random = mulberry32(seed);
  const count = 150;

  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({
    color: '#8b9090',
    roughness: 0.95,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const color = new THREE.Color();

  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < 6000) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * WORLD_HALF * 0.9;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = heightAt(x, z);

    if (height < -0.5 || height > 26) continue;

    const size = 0.6 + random() * 1.8;
    position.set(x, height + size * 0.28, z);
    euler.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    quaternion.setFromEuler(euler);
    scale.set(size, size * (0.55 + random() * 0.5), size);
    matrix.compose(position, quaternion, scale);

    mesh.setMatrixAt(placed, matrix);
    color.setHSL(0.11 + random() * 0.06, 0.06 + random() * 0.08, 0.42 + random() * 0.2);
    mesh.setColorAt(placed, color);

    placed += 1;
  }

  mesh.count = placed;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return mesh;
}

function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(210,250,255,0.95)');
  gradient.addColorStop(0.35, 'rgba(120,220,255,0.4)');
  gradient.addColorStop(1, 'rgba(80,190,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildCrystals(seed = 4242) {
  const random = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'crystals';

  const geometry = new THREE.OctahedronGeometry(0.85, 0);
  const material = new THREE.MeshStandardMaterial({
    color: '#cdf7ff',
    emissive: new THREE.Color('#3fc9ff'),
    emissiveIntensity: 1.7,
    roughness: 0.2,
    metalness: 0.15,
    flatShading: true,
  });

  const haloTexture = glowTexture();
  const haloMaterial = new THREE.SpriteMaterial({
    map: haloTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.85,
  });

  const list = [];
  const anchor = new THREE.Vector3();
  let placed = 0;
  let attempts = 0;

  while (placed < 26 && attempts < 8000) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * WORLD_HALF * 0.82;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = heightAt(x, z);

    if (height < 3 || height > 24) continue;
    if (list.some((entry) => Math.hypot(entry.base.x - x, entry.base.z - z) < 16)) continue;

    anchor.set(x, height, z);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, height + 2.3, z);
    mesh.castShadow = false;

    const halo = new THREE.Sprite(haloMaterial.clone());
    halo.scale.set(5.4, 5.4, 1);
    halo.position.copy(mesh.position);

    group.add(mesh, halo);

    list.push({
      mesh,
      halo,
      base: anchor.clone(),
      bob: random() * Math.PI * 2,
      taken: false,
    });

    placed += 1;
  }

  return { group, list };
}

export function buildSky() {
  const geometry = new THREE.SphereGeometry(900, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color('#7fa8cc') },
      bottomColor: { value: new THREE.Color('#e6eef2') },
      offset: { value: 90 },
      exponent: { value: 0.75 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float mixValue = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, mixValue), 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.name = 'sky';

  return { mesh, material };
}
