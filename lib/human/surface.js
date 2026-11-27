import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;

/** Samakan urutan putar: [-1, -0.5, 0.5, 1] -> dua sisi. */
function superellipse(cos, sin, power) {
  const e = 2 / power;
  return [
    Math.sign(cos) * Math.pow(Math.abs(cos), e),
    Math.sign(sin) * Math.pow(Math.abs(sin), e),
  ];
}

/**
 * Loft horizontal: deretan ring (irisan melintang di bidang XZ) lalu disambung.
 * Ring: { center:[x,y,z], rx, rzFront, rzBack, power, roll }
 */
export function loft(rings, { segments = 24, caps = true } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rows = rings.map((ring) => {
    const points = [];
    const { center } = ring;
    const rzFront = ring.rzFront ?? ring.rz;
    const rzBack = ring.rzBack ?? ring.rz;
    const power = ring.power ?? 2;

    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * TAU;
      const [ex, ez] = superellipse(Math.cos(angle), Math.sin(angle), power);
      const rz = ez >= 0 ? rzFront : rzBack;

      let x = (ring.rx ?? 0.05) * ex;
      let z = rz * ez;

      if (ring.roll) {
        const c = Math.cos(ring.roll);
        const s = Math.sin(ring.roll);
        const nx = x * c - z * s;
        const nz = x * s + z * c;
        x = nx;
        z = nz;
      }

      points.push(new THREE.Vector3(center[0] + x, center[1], center[2] + z));
    }
    return points;
  });

  for (let r = 0; r < rows.length; r += 1) {
    for (let i = 0; i < segments; i += 1) {
      const p = rows[r][i];
      positions.push(p.x, p.y, p.z);
      uvs.push(i / segments, r / Math.max(1, rows.length - 1));
    }
  }

  for (let r = 0; r < rows.length - 1; r += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = r * segments + i;
      const b = r * segments + ((i + 1) % segments);
      const c = (r + 1) * segments + i;
      const d = (r + 1) * segments + ((i + 1) % segments);
      indices.push(a, c, b, b, c, d);
    }
  }

  if (caps) {
    const centerVec = new THREE.Vector3();
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const e0 = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const normal = new THREE.Vector3();

    [0, rows.length - 1].forEach((rowIndex, which) => {
      const centerIndex = positions.length / 3;
      centerVec.set(rings[rowIndex].center[0], rings[rowIndex].center[1], rings[rowIndex].center[2]);
      positions.push(centerVec.x, centerVec.y, centerVec.z);
      uvs.push(0.5, which === 0 ? 0 : 1);

      const base = rowIndex * segments;
      const outwardY = which === 0 ? -1 : 1;

      for (let i = 0; i < segments; i += 1) {
        const i0 = base + i;
        const i1 = base + ((i + 1) % segments);
        p0.fromArray(positions, i0 * 3);
        p1.fromArray(positions, i1 * 3);
        e0.subVectors(p0, centerVec);
        e1.subVectors(p1, centerVec);
        normal.crossVectors(e0, e1);

        if (normal.y * outwardY >= 0) indices.push(centerIndex, i0, i1);
        else indices.push(centerIndex, i1, i0);
      }
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Sweep sepanjang kurva (jari, otot, alis): ring tegak lurus terhadap arah kurva.
 * path: Vector3[], radii: number[] (atau {rx, rz}).
 */
export function sweep(path, radii, { radial = 10, caps = true } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const frames = [];
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();

  for (let i = 0; i < path.length; i += 1) {
    if (i === 0) tangent.subVectors(path[1], path[0]);
    else if (i === path.length - 1) tangent.subVectors(path[i], path[i - 1]);
    else tangent.subVectors(path[i + 1], path[i - 1]);
    tangent.normalize();

    if (i === 0) {
      normal.set(0, 0, 1);
      if (Math.abs(tangent.dot(normal)) > 0.9) normal.set(1, 0, 0);
    } else {
      normal.copy(frames[i - 1].normal);
    }
    normal.addScaledVector(tangent, -normal.dot(tangent));
    if (normal.lengthSq() < 1e-8) normal.set(1, 0, 0);
    normal.normalize();
    binormal.crossVectors(tangent, normal).normalize();

    frames.push({ tangent: tangent.clone(), normal: normal.clone(), binormal: binormal.clone() });
  }

  for (let i = 0; i < path.length; i += 1) {
    const frame = frames[i];
    const radius = radii[i];
    const rx = typeof radius === 'number' ? radius : radius.rx;
    const rz = typeof radius === 'number' ? radius : radius.rz;

    for (let j = 0; j < radial; j += 1) {
      const angle = (j / radial) * TAU;
      const x = path[i].x + frame.normal.x * Math.cos(angle) * rx + frame.binormal.x * Math.sin(angle) * rz;
      const y = path[i].y + frame.normal.y * Math.cos(angle) * rx + frame.binormal.y * Math.sin(angle) * rz;
      const z = path[i].z + frame.normal.z * Math.cos(angle) * rx + frame.binormal.z * Math.sin(angle) * rz;
      positions.push(x, y, z);
      uvs.push(j / radial, i / Math.max(1, path.length - 1));
    }
  }

  for (let i = 0; i < path.length - 1; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      indices.push(a, c, b, b, c, d);
    }
  }

  if (caps) {
    const centerVec = new THREE.Vector3();
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const e0 = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const normal = new THREE.Vector3();

    [0, path.length - 1].forEach((rowIndex, which) => {
      const centerIndex = positions.length / 3;
      centerVec.copy(path[rowIndex]);
      positions.push(centerVec.x, centerVec.y, centerVec.z);
      uvs.push(0.5, which === 0 ? 0 : 1);

      const base = rowIndex * radial;
      const outward = frames[rowIndex].tangent.clone().multiplyScalar(which === 0 ? -1 : 1);

      for (let j = 0; j < radial; j += 1) {
        const i0 = base + j;
        const i1 = base + ((j + 1) % radial);
        p0.fromArray(positions, i0 * 3);
        p1.fromArray(positions, i1 * 3);
        e0.subVectors(p0, centerVec);
        e1.subVectors(p1, centerVec);
        normal.crossVectors(e0, e1);

        if (normal.dot(outward) >= 0) indices.push(centerIndex, i0, i1);
        else indices.push(centerIndex, i1, i0);
      }
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Bola yang diperas (tengkorak, mata, bola otot). */
export function blob({
  center = [0, 0, 0],
  rx = 0.1,
  ry = 0.1,
  rz = 0.1,
  widthSegments = 20,
  heightSegments = 16,
  stretch = 0,
} = {}) {
  const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const taper = 1 - Math.max(0, -y) * stretch;
    position.setXYZ(i, x * rx * taper + center[0], y * ry + center[1], z * rz * taper + center[2]);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Pastikan normal menghadap keluar dari titik tengah bagian. */
export function orientOutward(geometry, center) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  if (!index) return geometry;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const middle = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const array = index.array;

  for (let i = 0; i < array.length; i += 3) {
    a.fromBufferAttribute(position, array[i]);
    b.fromBufferAttribute(position, array[i + 1]);
    c.fromBufferAttribute(position, array[i + 2]);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac);
    middle.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    outward.subVectors(middle, center);

    if (normal.dot(outward) < 0) {
      const swap = array[i + 1];
      array[i + 1] = array[i + 2];
      array[i + 2] = swap;
    }
  }

  index.needsUpdate = true;
  return geometry;
}

/**
 * Bobot kulit: setiap vertex diberi 4 tulang terdekat berbobot jarak.
 * Smooth karena bobot turun halus terhadap jarak ke segmen tulang.
 */
export function paintWeights(geometry, segments) {
  const position = geometry.attributes.position;
  const count = position.count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const vertex = new THREE.Vector3();
  const best = [];

  for (let i = 0; i < count; i += 1) {
    vertex.fromBufferAttribute(position, i);
    best.length = 0;

    for (let s = 0; s < segments.length; s += 1) {
      const segment = segments[s];
      const d = distanceToSegment(vertex, segment.a, segment.b);
      const weight = 1 / (Math.pow(d + 0.004, 4) + 1e-7);
      best.push({ index: s, weight });
    }

    best.sort((x, y) => y.weight - x.weight);

    let total = 0;
    for (let k = 0; k < 4; k += 1) {
      const entry = best[k] || best[best.length - 1];
      total += entry.weight;
    }

    for (let k = 0; k < 4; k += 1) {
      const entry = best[k] || best[best.length - 1];
      skinIndex[i * 4 + k] = entry.index;
      skinWeight[i * 4 + k] = total > 0 ? entry.weight / total : k === 0 ? 1 : 0;
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  return geometry;
}

function distanceToSegment(point, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const apz = point.z - a.z;
  const lengthSq = abx * abx + aby * aby + abz * abz;

  let t = lengthSq > 1e-9 ? (apx * abx + apy * aby + apz * abz) / lengthSq : 0;
  t = Math.max(0, Math.min(1, t));

  const dx = apx - abx * t;
  const dy = apy - aby * t;
  const dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Gabung beberapa bagian menjadi satu geometry (semua harus punya atribut sama). */
export function merge(parts) {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Gagal menggabungkan geometry');
  return merged;
}

/** Geser permukaan sepanjang normal (untuk pakaian yang mengikuti tubuh). */
export function inflate(geometry, amount) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  for (let i = 0; i < position.count; i += 1) {
    position.setXYZ(
      i,
      position.getX(i) + normal.getX(i) * amount,
      position.getY(i) + normal.getY(i) * amount,
      position.getZ(i) + normal.getZ(i) * amount,
    );
  }
  position.needsUpdate = true;
  return geometry;
}

export { TAU };
