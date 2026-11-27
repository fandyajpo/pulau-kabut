import * as THREE from 'three';
import {
  loft,
  sweep,
  blob,
  merge,
  paintWeights,
  orientOutward,
} from './surface';
import {
  createSkinMaterial,
  createClothMaterial,
  createHairMaterial,
  createNailMaterial,
  getSharedSkinTextures,
  getSharedEyeMaterials,
  getSharedWeave,
} from './materials';

const TAU = Math.PI * 2;

const SPINE = [
  ['hips', null, [0, 0.98, 0], [0, 1.08, 0.005]],
  ['spine', 'hips', [0, 1.08, 0.005], [0, 1.22, 0.01]],
  ['chest', 'spine', [0, 1.22, 0.01], [0, 1.36, 0.005]],
  ['chestTop', 'chest', [0, 1.36, 0.005], [0, 1.46, 0.01]],
  ['neck', 'chestTop', [0, 1.46, 0.01], [0, 1.55, 0.012]],
  ['head', 'neck', [0, 1.55, 0.012], [0, 1.8, 0.0]],
];

const LIMBS = [
  ['clavicle', 'chestTop', [0.03, 1.43, 0.02], [0.175, 1.44, 0.02]],
  ['upperArm', 'clavicle', [0.175, 1.44, 0.02], [0.227, 1.145, 0.01]],
  ['forearm', 'upperArm', [0.227, 1.145, 0.01], [0.245, 0.9, 0.005]],
  ['hand', 'forearm', [0.245, 0.9, 0.005], [0.248, 0.797, 0.012]],
  ['upperLeg', 'hips', [0.09, 0.95, 0], [0.1, 0.52, 0.005]],
  ['lowerLeg', 'upperLeg', [0.1, 0.52, 0.005], [0.1, 0.1, -0.012]],
  ['foot', 'lowerLeg', [0.1, 0.1, -0.012], [0.1, 0.035, 0.1]],
  ['toe', 'foot', [0.1, 0.035, 0.1], [0.1, 0.028, 0.185]],
];

const FINGERS = [
  { name: 'index', x: -0.03, z: 0.012, lengths: [0.032, 0.026, 0.019], curl: [0.14, 0.3, 0.34] },
  { name: 'middle', x: -0.006, z: 0.014, lengths: [0.035, 0.029, 0.02], curl: [0.12, 0.28, 0.32] },
  { name: 'ring', x: 0.016, z: 0.012, lengths: [0.033, 0.027, 0.019], curl: [0.13, 0.3, 0.34] },
  { name: 'pinky', x: 0.035, z: 0.006, lengths: [0.027, 0.022, 0.016], curl: [0.16, 0.32, 0.36] },
];

const TOES = [
  { x: -0.031, length: 0.055, radius: 0.0115 },
  { x: -0.011, length: 0.05, radius: 0.0105 },
  { x: 0.007, length: 0.046, radius: 0.0098 },
  { x: 0.022, length: 0.04, radius: 0.0088 },
  { x: 0.035, length: 0.032, radius: 0.0078 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function ring(y, rx, rzFront, rzBack, power = 2, x = 0, z = 0) {
  return { center: [x, y, z], rx, rzFront, rzBack, power };
}

function fingerJoints(base, lengths, curls) {
  const points = [base.clone()];
  let angle = 0;
  const current = base.clone();
  for (let i = 0; i < lengths.length; i += 1) {
    angle += curls[i];
    current.y -= Math.cos(angle) * lengths[i];
    current.z += Math.sin(angle) * lengths[i];
    points.push(current.clone());
  }
  return points;
}

function buildTorso() {
  const rings = [
    ring(0.855, 0.152, 0.099, 0.103, 2.7),
    ring(0.9, 0.164, 0.104, 0.11, 2.6),
    ring(0.96, 0.166, 0.106, 0.112, 2.5),
    ring(1.02, 0.156, 0.1, 0.106, 2.4),
    ring(1.08, 0.142, 0.094, 0.1, 2.3),
    ring(1.14, 0.144, 0.095, 0.1, 2.3),
    ring(1.2, 0.154, 0.101, 0.102, 2.3),
    ring(1.27, 0.166, 0.108, 0.104, 2.3),
    ring(1.34, 0.174, 0.112, 0.104, 2.3),
    ring(1.4, 0.183, 0.107, 0.1, 2.4),
    ring(1.45, 0.189, 0.097, 0.094, 2.5),
    ring(1.487, 0.12, 0.078, 0.082, 2.4),
    ring(1.515, 0.068, 0.06, 0.07, 2.1),
    ring(1.555, 0.058, 0.054, 0.064, 2),
  ];
  const geometry = loft(rings, { segments: 40 });
  orientOutward(geometry, new THREE.Vector3(0, 1.2, 0.01));
  return geometry;
}

function buildArm(side) {
  const rows = [
    [1.47, 0.15, 0.058, 0.056],
    [1.43, 0.172, 0.072, 0.068],
    [1.37, 0.187, 0.066, 0.062],
    [1.3, 0.198, 0.06, 0.056],
    [1.22, 0.207, 0.052, 0.05],
    [1.15, 0.216, 0.042, 0.041],
    [1.08, 0.224, 0.049, 0.045],
    [1.0, 0.235, 0.042, 0.038],
    [0.925, 0.244, 0.031, 0.027],
    [0.9, 0.245, 0.028, 0.024],
  ];
  const rings = rows.map(([y, x, rzFront, rzBack]) => ring(y, rzFront, rzFront, rzBack, 2, x * side, 0.004));
  const geometry = loft(rings, { segments: 24 });
  orientOutward(geometry, new THREE.Vector3(0.21 * side, 1.2, 0.004));
  return geometry;
}

function buildPalm(side) {
  const rings = [
    ring(0.902, 0.031, 0.021, 0.019, 2.1, 0.245 * side, 0.004),
    ring(0.875, 0.044, 0.022, 0.021, 2.3, 0.246 * side, 0.006),
    ring(0.84, 0.048, 0.023, 0.022, 2.4, 0.247 * side, 0.008),
    ring(0.808, 0.046, 0.021, 0.021, 2.4, 0.248 * side, 0.01),
    ring(0.79, 0.04, 0.018, 0.018, 2.2, 0.248 * side, 0.01),
  ];
  const geometry = loft(rings, { segments: 20 });
  orientOutward(geometry, new THREE.Vector3(0.247 * side, 0.85, 0.008));
  return geometry;
}

function buildFingers(side) {
  const parts = [];
  const tips = [];

  FINGERS.forEach((finger) => {
    const base = new THREE.Vector3(
      (0.248 + finger.x) * side,
      0.8,
      0.012 + finger.z,
    );
    const points = fingerJoints(base, finger.lengths, finger.curl);
    const radii = [0.0086, 0.0078, 0.0069, 0.0058];
    parts.push(sweep(points, radii, { radial: 10 }));
    tips.push({ name: finger.name, points, radius: 0.0062, side });
  });

  const thumbBase = new THREE.Vector3(0.222 * side, 0.862, 0.026);
  const thumbPoints = [
    thumbBase.clone(),
    new THREE.Vector3(0.212 * side, 0.848, 0.052),
    new THREE.Vector3(0.203 * side, 0.842, 0.07),
  ];
  parts.push(sweep(thumbPoints, [0.0105, 0.0086, 0.0068], { radial: 10 }));
  tips.push({ name: 'thumb', points: thumbPoints, radius: 0.0068, side });

  return { geometry: merge(parts), tips };
}

function buildLeg(side) {
  const rows = [
    [0.98, 0.086, 0.104, 0.1],
    [0.93, 0.09, 0.107, 0.102],
    [0.86, 0.093, 0.1, 0.098],
    [0.76, 0.096, 0.094, 0.092],
    [0.66, 0.098, 0.084, 0.084],
    [0.56, 0.099, 0.07, 0.068],
    [0.5, 0.1, 0.06, 0.058],
    [0.44, 0.1, 0.062, 0.062],
    [0.36, 0.1, 0.068, 0.062],
    [0.28, 0.1, 0.056, 0.048],
    [0.2, 0.1, 0.042, 0.036],
    [0.13, 0.1, 0.036, 0.03],
    [0.1, 0.1, 0.034, 0.028],
  ];
  const rings = rows.map(([y, x, rzFront, rzBack]) => ring(y, rzFront, rzFront, rzBack, 2.2, x * side, -0.004));
  const geometry = loft(rings, { segments: 24 });
  orientOutward(geometry, new THREE.Vector3(0.1 * side, 0.6, -0.004));
  return geometry;
}

function buildFoot(side) {
  const path = [
    new THREE.Vector3(0.1 * side, 0.072, -0.062),
    new THREE.Vector3(0.1 * side, 0.05, 0.0),
    new THREE.Vector3(0.1 * side, 0.036, 0.06),
    new THREE.Vector3(0.1 * side, 0.032, 0.1),
  ];
  const radii = [
    { rx: 0.036, rz: 0.03 },
    { rx: 0.045, rz: 0.028 },
    { rx: 0.048, rz: 0.024 },
    { rx: 0.049, rz: 0.022 },
  ];
  const parts = [sweep(path, radii, { radial: 18 })];

  const ballZ = 0.1;
  TOES.forEach((toe) => {
    const base = new THREE.Vector3((0.1 + toe.x) * side, 0.03, ballZ);
    const toesPath = [
      base,
      new THREE.Vector3((0.1 + toe.x) * side, 0.028, ballZ + toe.length * 0.55),
      new THREE.Vector3((0.1 + toe.x) * side, 0.026, ballZ + toe.length),
    ];
    parts.push(sweep(toesPath, [toe.radius, toe.radius * 0.95, toe.radius * 0.8], { radial: 10 }));
  });

  return merge(parts);
}

function buildHead() {
  const rings = [
    ring(1.545, 0.058, 0.055, 0.064, 2),
    ring(1.575, 0.073, 0.069, 0.08, 2.2, 0, 0.002),
    ring(1.6, 0.081, 0.076, 0.088, 2.3, 0, 0.004),
    ring(1.625, 0.085, 0.081, 0.092, 2.3, 0, 0.004),
    ring(1.655, 0.088, 0.085, 0.095, 2.3, 0, 0.003),
    ring(1.685, 0.089, 0.087, 0.097, 2.2, 0, 0.002),
    ring(1.712, 0.0885, 0.087, 0.097, 2.2, 0, 0.0),
    ring(1.742, 0.086, 0.085, 0.094, 2.2, 0, -0.001),
    ring(1.768, 0.079, 0.079, 0.086, 2.1, 0, -0.003),
    ring(1.79, 0.062, 0.064, 0.07, 2, 0, -0.004),
    ring(1.802, 0.03, 0.032, 0.036, 2, 0, -0.004),
  ];
  const skull = loft(rings, { segments: 38 });
  orientOutward(skull, new THREE.Vector3(0, 1.69, 0.0));

  const parts = [skull];

  // Nose: pangkal, batang, ujung, dan cuping hidung.
  const nosePath = [
    new THREE.Vector3(0, 1.712, 0.082),
    new THREE.Vector3(0, 1.694, 0.093),
    new THREE.Vector3(0, 1.674, 0.101),
    new THREE.Vector3(0, 1.662, 0.092),
  ];
  parts.push(sweep(nosePath, [0.009, 0.0115, 0.016, 0.017], { radial: 12 }));
  parts.push(blob({ center: [-0.016, 1.66, 0.088], rx: 0.009, ry: 0.008, rz: 0.009 }));
  parts.push(blob({ center: [0.016, 1.66, 0.088], rx: 0.009, ry: 0.008, rz: 0.009 }));

  // Bibir atas dan bawah.
  parts.push(
    blob({ center: [0, 1.6405, 0.0885], rx: 0.024, ry: 0.0062, rz: 0.0105 }),
    blob({ center: [0, 1.628, 0.0875], rx: 0.0225, ry: 0.0075, rz: 0.0105 }),
  );

  // Telinga: daun telinga pipih dengan lekuk helix.
  [-1, 1].forEach((side) => {
    const ear = blob({
      center: [0.089 * side, 1.688, -0.006],
      rx: 0.008,
      ry: 0.029,
      rz: 0.019,
      stretch: 0.15,
    });
    parts.push(ear);

    const helix = new THREE.TorusGeometry(0.021, 0.0032, 6, 14, Math.PI * 1.35);
    helix.rotateY(Math.PI / 2);
    helix.rotateZ(0.4);
    helix.translate(0.091 * side, 1.69, -0.006);
    parts.push(helix);
  });

  // Rahang dan tulang pipi supaya transisi wajah terasa.
  [-1, 1].forEach((side) => {
    parts.push(
      blob({
        center: [0.055 * side, 1.662, 0.062],
        rx: 0.022,
        ry: 0.018,
        rz: 0.022,
      }),
    );
    parts.push(
      blob({
        center: [0.045 * side, 1.6, 0.062],
        rx: 0.025,
        ry: 0.022,
        rz: 0.02,
      }),
    );
  });

  const geometry = merge(parts);
  return geometry;
}

function addExpressions(geometry) {
  const position = geometry.attributes.position;
  const count = position.count;

  const smile = new Float32Array(count * 3);
  const frown = new Float32Array(count * 3);
  const surprise = new Float32Array(count * 3);
  const anger = new Float32Array(count * 3);
  const sad = new Float32Array(count * 3);

  const mouth = new THREE.Vector3(0, 1.634, 0.09);
  const point = new THREE.Vector3();

  for (let i = 0; i < count; i += 1) {
    point.fromBufferAttribute(position, i);

    const toMouth = point.distanceTo(mouth);
    const mouthMask = 1 - smoothstep(0.018, 0.055, toMouth);
    const corner = smoothstep(0.012, 0.03, Math.abs(point.x)) * mouthMask;
    const lateral = Math.sign(point.x) || 1;

    const browMask =
      (1 - smoothstep(0.006, 0.022, Math.abs(point.y - 1.735))) *
      (1 - smoothstep(0.02, 0.06, Math.abs(point.z - 0.07))) *
      smoothstep(0.01, 0.04, Math.abs(point.x));

    const innerBrow =
      browMask * (1 - smoothstep(0.012, 0.045, Math.abs(point.x)));

    const jawMask =
      smoothstep(1.655, 1.6, point.y) *
      smoothstep(-0.02, 0.02, point.z);

    const cheekMask =
      (1 - smoothstep(0.02, 0.05, point.distanceTo(new THREE.Vector3(0.05, 1.665, 0.07)))) +
      (1 - smoothstep(0.02, 0.05, point.distanceTo(new THREE.Vector3(-0.05, 1.665, 0.07))));

    const offset = i * 3;

    // Senyum: sudut bibir naik dan melebar, pipi terangkat.
    smile[offset] = lateral * corner * 0.0035;
    smile[offset + 1] = corner * 0.0062 + cheekMask * 0.0024;
    smile[offset + 2] = mouthMask * 0.0012;

    // Cemberut: sudut bibir turun, alis dalam turun.
    frown[offset] = -lateral * corner * 0.0015;
    frown[offset + 1] = -corner * 0.0055 - innerBrow * 0.004;
    frown[offset + 2] = -mouthMask * 0.001;

    // Terkejut: rahang turun, alis naik, mulut membuka.
    surprise[offset] = 0;
    surprise[offset + 1] = -jawMask * 0.014 + browMask * 0.008;
    surprise[offset + 2] = -jawMask * 0.004 + browMask * 0.0012;

    // Marah: alis turun dan menyatu, bibir menekan.
    anger[offset] = -innerBrow * 0.003;
    anger[offset + 1] = -browMask * 0.0085 - corner * 0.002;
    anger[offset + 2] = -mouthMask * 0.0022;

    // Sedih: alis dalam naik, sudut bibir turun.
    sad[offset] = lateral * corner * 0.001;
    sad[offset + 1] = innerBrow * 0.0055 - corner * 0.0038;
    sad[offset + 2] = -mouthMask * 0.0008;
  }

  geometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute(smile, 3),
    new THREE.Float32BufferAttribute(frown, 3),
    new THREE.Float32BufferAttribute(surprise, 3),
    new THREE.Float32BufferAttribute(anger, 3),
    new THREE.Float32BufferAttribute(sad, 3),
  ];
  geometry.morphTargetsRelative = true;
  return geometry;
}

function eyeCap(radius, sphereRadius, segments = 26) {
  const geometry = new THREE.CircleGeometry(radius, segments);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = Math.sqrt(Math.max(0, sphereRadius * sphereRadius - x * x - y * y));
    position.setXYZ(i, x, y, z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function buildEye(side, materials) {
  const group = new THREE.Group();
  const center = new THREE.Vector3(0.032 * side, 1.706, 0.069);

  const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.0126, 24, 18), materials.sclera);
  group.add(sclera);

  const iris = new THREE.Mesh(eyeCap(0.0064, 0.01266), materials.iris);
  group.add(iris);

  const pupil = new THREE.Mesh(eyeCap(0.0028, 0.01274, 18), materials.pupil);
  group.add(pupil);

  const cornea = new THREE.Mesh(new THREE.SphereGeometry(0.0129, 20, 14), materials.cornea);
  group.add(cornea);

  const highlight = new THREE.Mesh(
    new THREE.CircleGeometry(0.0015, 12),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }),
  );
  highlight.position.set(0.0034 * side, 0.0038, 0.0116);
  highlight.lookAt(new THREE.Vector3(0.0034 * side, 0.0038, 0.05));
  group.add(highlight);

  group.position.copy(center);

  const lidMaterial = materials.sclera.clone();
  lidMaterial.color = new THREE.Color('#dfc0ab');

  const upperLid = new THREE.Mesh(
    new THREE.SphereGeometry(0.0134, 20, 12, 0, TAU, 0, Math.PI * 0.42),
    lidMaterial,
  );
  upperLid.position.copy(center);
  upperLid.rotation.x = -0.55;

  const lowerLid = new THREE.Mesh(
    new THREE.SphereGeometry(0.0134, 20, 12, 0, TAU, Math.PI * 0.62, Math.PI * 0.38),
    lidMaterial.clone(),
  );
  lowerLid.position.copy(center);
  lowerLid.rotation.x = 0.25;

  return { group, upperLid, lowerLid, center };
}

function buildBrowsAndLashes(material) {
  const browGeometry = new THREE.PlaneGeometry(0.0009, 0.0075);
  const lashesGeometry = new THREE.PlaneGeometry(0.0007, 0.0055);

  const brows = [-1, 1].map((side) => {
    const mesh = new THREE.InstancedMesh(browGeometry, material, 110);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const position = new THREE.Vector3();

    for (let i = 0; i < 110; i += 1) {
      const t = i / 109;
      const x = (0.012 + t * 0.062) * side;
      const y = 1.7355 + Math.sin(t * Math.PI) * 0.0038 - t * 0.0016;
      const z = 0.0795 - t * 0.012;
      position.set(x, y, z);
      quaternion.setFromEuler(new THREE.Euler(0, side * 0.25, side * (0.15 - t * 0.5)));
      const length = 0.8 + Math.sin(t * Math.PI) * 0.6;
      scale.set(1, length, 1);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  });

  const lashes = [-1, 1].map((side) => {
    const mesh = new THREE.InstancedMesh(lashesGeometry, material, 34);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const position = new THREE.Vector3();

    for (let i = 0; i < 34; i += 1) {
      const t = i / 33;
      const angle = t * Math.PI * 1.1;
      const radius = 0.0125;
      const x = (0.032 + Math.cos(angle) * radius) * side;
      const y = 1.706 + Math.sin(angle) * radius * 0.85;
      const z = 0.0755;
      position.set(x, y, z);
      quaternion.setFromEuler(new THREE.Euler(0.5, 0, side * (0.2 + t * 0.9)));
      scale.set(1, 1.2, 1);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  });

  return { brows, lashes };
}

function buildCloth(weave) {
  const shirtRings = [
    ring(0.93, 0.158, 0.108, 0.112, 2.6),
    ring(1.0, 0.16, 0.106, 0.112, 2.5),
    ring(1.08, 0.148, 0.1, 0.106, 2.4),
    ring(1.16, 0.15, 0.101, 0.106, 2.4),
    ring(1.24, 0.166, 0.108, 0.108, 2.4),
    ring(1.32, 0.176, 0.114, 0.11, 2.4),
    ring(1.39, 0.187, 0.11, 0.104, 2.5),
    ring(1.44, 0.194, 0.1, 0.098, 2.6),
  ];
  const shirt = loft(shirtRings, { segments: 30, caps: false });
  orientOutward(shirt, new THREE.Vector3(0, 1.2, 0.01));

  const sleeveRings = [
    ring(1.46, 0.062, 0.064, 0.062, 2.1, 0.15),
    ring(1.42, 0.078, 0.078, 0.074, 2.1, 0.172),
    ring(1.34, 0.074, 0.072, 0.068, 2.1, 0.19),
    ring(1.22, 0.064, 0.062, 0.058, 2.1, 0.207),
  ];

  const shortsRings = [
    ring(0.98, 0.17, 0.11, 0.116, 2.6),
    ring(0.92, 0.172, 0.111, 0.117, 2.6),
    ring(0.84, 0.166, 0.108, 0.113, 2.5),
    ring(0.76, 0.158, 0.104, 0.108, 2.4),
    ring(0.7, 0.152, 0.1, 0.104, 2.4),
  ];
  const shorts = loft(shortsRings, { segments: 26, caps: false });
  orientOutward(shorts, new THREE.Vector3(0, 0.85, 0));

  return { shirt, sleeveRings, shorts, material: createClothMaterial({ weave }) };
}

function buildNails(targets) {
  const parts = [];
  targets.forEach((target) => {
    const tip = target.points[target.points.length - 1];
    const before = target.points[target.points.length - 2];
    const direction = new THREE.Vector3().subVectors(tip, before).normalize();

    const nail = new THREE.SphereGeometry(target.radius * 0.72, 8, 6);
    nail.scale(1, 0.5, 1.35);
    nail.translate(
      tip.x + direction.x * 0.0015,
      tip.y + direction.y * 0.0012,
      tip.z + direction.z * 0.0022,
    );
    parts.push(nail);
  });
  return merge(parts);
}

export function createHuman({
  skinColor = '#e8c3a5',
  shirtColor = '#3c4a56',
  hairColor = '#231914',
} = {}) {
  const bones = new Map();
  const boneList = [];
  const spec = [];

  SPINE.forEach((entry) => spec.push(entry));
  LIMBS.forEach(([name, parent, head, tail]) => {
    spec.push([`${name}L`, parent === 'hips' || parent === 'chestTop' ? parent : `${parent}L`, [head[0], head[1], head[2]], [tail[0], tail[1], tail[2]]]);
    spec.push([`${name}R`, parent === 'hips' || parent === 'chestTop' ? parent : `${parent}R`, [-head[0], head[1], head[2]], [-tail[0], tail[1], tail[2]]]);
  });

  FINGERS.forEach((finger) => {
    [-1, 1].forEach((side) => {
      const suffix = side > 0 ? 'L' : 'R';
      const base = new THREE.Vector3((0.248 + finger.x) * side, 0.8, 0.012 + finger.z);
      const points = fingerJoints(base, finger.lengths, finger.curl);
      for (let i = 0; i < points.length - 1; i += 1) {
        spec.push([
          `${finger.name}${i + 1}${suffix}`,
          i === 0 ? `hand${suffix}` : `${finger.name}${i}${suffix}`,
          [points[i].x, points[i].y, points[i].z],
          [points[i + 1].x, points[i + 1].y, points[i + 1].z],
        ]);
      }
    });
  });

  [-1, 1].forEach((side) => {
    const suffix = side > 0 ? 'L' : 'R';
    const points = [
      new THREE.Vector3(0.222 * side, 0.862, 0.026),
      new THREE.Vector3(0.212 * side, 0.848, 0.052),
      new THREE.Vector3(0.203 * side, 0.842, 0.07),
    ];
    for (let i = 0; i < 2; i += 1) {
      spec.push([
        `thumb${i + 1}${suffix}`,
        i === 0 ? `hand${suffix}` : `thumb1${suffix}`,
        [points[i].x, points[i].y, points[i].z],
        [points[i + 1].x, points[i + 1].y, points[i + 1].z],
      ]);
    }
  });

  // Bone dibuat sesuai urutan hierarki: parent harus sudah ada.
  const ordered = [...spec].sort((a, b) => {
    const depth = (entry) => {
      let d = 0;
      let current = entry;
      const seen = new Set();
      while (current && current[1] && current[1] !== 'hips' && !seen.has(current[1])) {
        seen.add(current[1]);
        current = spec.find((item) => item[0] === current[1]);
        d += 1;
      }
      return d;
    };
    return depth(a) - depth(b);
  });

  ordered.forEach(([name, parent, head, tail]) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bones.set(name, bone);
    boneList.push({ name, parent, head, tail, bone });
  });

  // Susun hierarki dan posisi lokal (posisi dunia dikurangi posisi induk).
  const root = new THREE.Group();
  root.name = 'human';

  boneList.forEach((entry) => {
    const parentEntry = entry.parent ? boneList.find((item) => item.name === entry.parent) : null;
    entry.bone.position.set(
      entry.head[0] - (parentEntry ? parentEntry.head[0] : 0),
      entry.head[1] - (parentEntry ? parentEntry.head[1] : 0),
      entry.head[2] - (parentEntry ? parentEntry.head[2] : 0),
    );
    if (parentEntry) parentEntry.bone.add(entry.bone);
    else root.add(entry.bone);
  });

  root.updateMatrixWorld(true);

  const segments = boneList.map((entry) => ({
    a: new THREE.Vector3(entry.head[0], entry.head[1], entry.head[2]),
    b: new THREE.Vector3(entry.tail[0], entry.tail[1], entry.tail[2]),
  }));

  const textures = getSharedSkinTextures();
  const skinMaterial = createSkinMaterial({ textures, color: skinColor });
  const weave = getSharedWeave();

  // Badan: torso + lengan + tangan + jari + kaki.
  const bodyParts = [buildTorso()];
  [-1, 1].forEach((side) => {
    bodyParts.push(buildArm(side));
    bodyParts.push(buildPalm(side));
    bodyParts.push(buildFingers(side).geometry);
    bodyParts.push(buildLeg(side));
    bodyParts.push(buildFoot(side));
  });
  const bodyGeometry = merge(bodyParts);
  paintWeights(bodyGeometry, segments);

  const body = new THREE.SkinnedMesh(bodyGeometry, skinMaterial);
  body.name = 'body';
  body.castShadow = true;
  body.receiveShadow = true;

  // Kepala dengan morph target ekspresi.
  const headGeometry = addExpressions(buildHead());
  paintWeights(headGeometry, segments);
  const headMesh = new THREE.SkinnedMesh(headGeometry, skinMaterial);
  headMesh.name = 'head';
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;

  const skeleton = new THREE.Skeleton(boneList.map((entry) => entry.bone));

  root.add(body, headMesh);
  root.updateMatrixWorld(true);
  body.bind(skeleton);
  headMesh.bind(skeleton);

  // Kuku.
  const nailTargets = [];
  [-1, 1].forEach((side) => {
    const { tips } = buildFingers(side);
    tips.forEach((tip) => nailTargets.push(tip));
  });

  const nailGeometry = buildNails(nailTargets);
  paintWeights(nailGeometry, segments);
  const nails = new THREE.SkinnedMesh(nailGeometry, createNailMaterial());
  nails.name = 'nails';
  nails.castShadow = false;
  root.add(nails);
  nails.bind(skeleton);

  // Pakaian.
  const cloth = buildCloth(weave);
  cloth.material.color.set(shirtColor);
  const shirtParts = [cloth.shirt];

  [-1, 1].forEach((side) => {
    const rings = cloth.sleeveRings.map((rows) => ({
      ...rows,
      center: [rows.center[0] * side, rows.center[1], rows.center[2]],
    }));
    const sleeve = loft(rings, { segments: 16, caps: false });
    orientOutward(sleeve, new THREE.Vector3(0.19 * side, 1.3, 0));
    shirtParts.push(sleeve);
  });

  const shirtGeometry = merge(shirtParts);
  paintWeights(shirtGeometry, segments);
  const shirt = new THREE.SkinnedMesh(shirtGeometry, cloth.material);
  shirt.name = 'shirt';
  shirt.castShadow = true;

  paintWeights(cloth.shorts, segments);
  const shorts = new THREE.SkinnedMesh(cloth.shorts, cloth.material.clone());
  shorts.name = 'shorts';
  shorts.castShadow = true;

  root.add(shirt, shorts);
  root.updateMatrixWorld(true);
  shirt.bind(skeleton);
  shorts.bind(skeleton);

  // Mata, kelopak, alis, bulu mata — menempel pada tulang kepala.
  const eyeMaterials = getSharedEyeMaterials();
  const eyes = [-1, 1].map((side) => buildEye(side, eyeMaterials));
  const hairMaterial = createHairMaterial({ color: hairColor });
  const { brows, lashes } = buildBrowsAndLashes(hairMaterial);

  const headBone = bones.get('head');
  const headOrigin = new THREE.Vector3(0, 1.55, 0.012);

  const headParts = [];
  eyes.forEach((eye) => {
    headParts.push(eye.group, eye.upperLid, eye.lowerLid);
  });
  brows.forEach((brow) => headParts.push(brow));
  lashes.forEach((lash) => headParts.push(lash));

  headParts.forEach((part) => {
    part.position.sub(headOrigin);
    headBone.add(part);
  });

  const api = {
    root,
    bones,
    body,
    head: headMesh,
    shirt,
    shorts,
    nails,
    eyes,
    brows,
    lashes,
    skeleton,
    expressions: ['smile', 'frown', 'surprise', 'anger', 'sad'],
    morph: headMesh.morphTargetInfluences,
    dispose() {
      [body, headMesh, nails, shirt, shorts].forEach((mesh) => mesh.geometry.dispose());
      [skinMaterial, cloth.material].forEach((material) => material.dispose());
      hairMaterial.dispose();
    },
  };

  return api;
}
