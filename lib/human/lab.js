import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createHuman } from './body';
import { createMotion } from './motion';

const VIEWS = {
  front: { position: [0, 1.12, 2.45], target: [0, 1.02, 0] },
  threeQuarter: { position: [1.55, 1.2, 1.75], target: [0, 1.02, 0] },
  side: { position: [2.4, 1.12, 0.25], target: [0, 1.02, 0] },
  back: { position: [0, 1.18, -2.45], target: [0, 1.05, 0] },
  face: { position: [0.06, 1.71, 0.66], target: [0, 1.695, 0.06] },
  hands: { position: [0.55, 0.92, 0.55], target: [0.25, 0.8, 0.04] },
  feet: { position: [0.18, 0.3, 0.78], target: [0.1, 0.06, 0.08] },
};

const SKY = `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SKY_FRAGMENT = `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 groundColor;
  varying vec3 vWorld;
  void main() {
    float h = normalize(vWorld).y;
    vec3 color = mix(horizonColor, topColor, smoothstep(0.0, 0.55, h));
    color = mix(groundColor, color, smoothstep(-0.45, 0.05, h));
    gl_FragColor = vec4(color, 1.0);
  }
`;

function buildEnvironment(renderer) {
  const scene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: SKY,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      topColor: { value: new THREE.Color('#8fa6bb') },
      horizonColor: { value: new THREE.Color('#e6dcd2') },
      groundColor: { value: new THREE.Color('#3a3a3c') },
    },
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), material));

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  material.dispose();
  return target.texture;
}

function buildSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: SKY,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      topColor: { value: new THREE.Color('#5d6f7d') },
      horizonColor: { value: new THREE.Color('#d9cec3') },
      groundColor: { value: new THREE.Color('#2a2b2d') },
    },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 20), material);
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return mesh;
}

export function createLab({ canvas, onStats }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a1c1f');

  const environment = buildEnvironment(renderer);
  scene.environment = environment;
  scene.environmentIntensity = 0.55;

  const sky = buildSky();
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
  camera.position.set(0, 1.12, 2.45);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.02, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.25;
  controls.maxDistance = 5.5;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.minPolarAngle = 0.15;
  controls.update();

  // Lantai studio: lingkaran gelap dengan tepi lembut.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4.2, 64),
    new THREE.MeshStandardMaterial({ color: '#2c2e31', roughness: 0.94, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  // Pencahayaan studio: key, fill, rim, dan ambient.
  const key = new THREE.DirectionalLight('#ffe8d2', 3.1);
  key.position.set(1.7, 2.6, 1.9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.4;
  key.shadow.camera.far = 8;
  key.shadow.camera.left = -1.6;
  key.shadow.camera.right = 1.6;
  key.shadow.camera.top = 2.4;
  key.shadow.camera.bottom = -0.4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 2;
  scene.add(key);

  const fill = new THREE.DirectionalLight('#bcd2e8', 0.85);
  fill.position.set(-2.2, 1.5, 1.3);
  scene.add(fill);

  const rim = new THREE.DirectionalLight('#d7e6ff', 2.2);
  rim.position.set(-1.4, 2.1, -2.3);
  scene.add(rim);

  const ambient = new THREE.HemisphereLight('#cfd8e2', '#3a322e', 0.55);
  scene.add(ambient);

  const human = createHuman();
  scene.add(human.root);

  // Bangku sederhana untuk pose duduk, supaya kaki tidak menggantung.
  const stoolMaterial = new THREE.MeshStandardMaterial({ color: '#3d3f44', roughness: 0.82, metalness: 0 });
  const stool = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.035, 32), stoolMaterial);
  seat.position.y = 0.5;
  seat.castShadow = true;
  seat.receiveShadow = true;
  stool.add(seat);
  [
    [-0.1, -0.1],
    [0.1, -0.1],
    [-0.1, 0.1],
    [0.1, 0.1],
  ].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.48, 10), stoolMaterial);
    leg.position.set(x, 0.24, z);
    leg.castShadow = true;
    stool.add(leg);
  });
  stool.visible = false;
  scene.add(stool);

  const motion = createMotion(human);

  const desired = {
    position: new THREE.Vector3().copy(camera.position),
    target: new THREE.Vector3().copy(controls.target),
  };

  let running = true;
  let frameHandle = 0;
  let last = performance.now();
  let elapsed = 0;
  let fps = 60;
  let slowFrames = 0;
  let statsTimer = 0;
  let autoRotate = false;

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    if (!running) return;
    frameHandle = requestAnimationFrame(frame);

    const rawDelta = (now - last) / 1000;
    last = now;
    const delta = Math.min(0.05, Math.max(0.0005, rawDelta));

    elapsed += delta;
    fps += (1 / Math.max(rawDelta, 0.001) - fps) * 0.08;

    if (autoRotate) {
      const radius = desired.position.distanceTo(desired.target);
      const angle = elapsed * 0.25;
      desired.position.set(
        desired.target.x + Math.sin(angle) * radius,
        desired.position.y,
        desired.target.z + Math.cos(angle) * radius,
      );
    }

    camera.position.lerp(desired.position, 1 - Math.exp(-6 * delta));
    controls.target.lerp(desired.target, 1 - Math.exp(-6 * delta));

    motion.update(delta);
    human.root.position.y = motion.state.rootOffset;
    shadeLights(delta);
    controls.update();
    renderer.render(scene, camera);

    statsTimer += delta;
    if (statsTimer > 0.4) {
      statsTimer = 0;
      if (onStats) onStats({ fps: Math.round(fps) });

      if (fps < 42) slowFrames += 1;
      else slowFrames = Math.max(0, slowFrames - 1);

      if (slowFrames > 8 && renderer.getPixelRatio() > 1) {
        renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.25));
        slowFrames = 0;
        resize();
      }
    }
  }

  function shadeLights(delta) {
    sky.position.copy(camera.position);
    sky.position.y += 0.6;
    void delta;
  }

  function setView(name) {
    const view = VIEWS[name];
    if (!view) return;
    desired.position.set(view.position[0], view.position[1], view.position[2]);
    desired.target.set(view.target[0], view.target[1], view.target[2]);
    autoRotate = false;
  }

  const stats = { fps: 60 };

  resize();
  frameHandle = requestAnimationFrame(frame);

  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
  }
  window.addEventListener('resize', resize);

  return {
    human,
    motion,
    stats,
    setView,
    setClip(clip) {
      motion.setClip(clip);
      stool.visible = clip === 'sit';
      if (clip === 'sit') setView('threeQuarter');
    },
    setGesture(gesture) {
      motion.setGesture(gesture);
    },
    setExpression(expression) {
      motion.setExpression(expression);
    },
    setLookTarget(x, y, z) {
      motion.setLook(new THREE.Vector3(x, y, z));
    },
    toggleLook(value) {
      motion.lookEnabled(value);
    },
    blink() {
      motion.blinkNow();
    },
    setAutoRotate(value) {
      autoRotate = Boolean(value);
    },
    setExposure(value) {
      renderer.toneMappingExposure = value;
    },
    setStudio(studio) {
      if (studio === 'dramatic') {
        key.intensity = 4.2;
        fill.intensity = 0.3;
        rim.intensity = 3.4;
        ambient.intensity = 0.25;
        scene.environmentIntensity = 0.32;
      } else if (studio === 'soft') {
        key.intensity = 1.6;
        fill.intensity = 1.6;
        rim.intensity = 0.9;
        ambient.intensity = 0.9;
        scene.environmentIntensity = 0.85;
      } else {
        key.intensity = 3.1;
        fill.intensity = 0.85;
        rim.intensity = 2.2;
        ambient.intensity = 0.55;
        scene.environmentIntensity = 0.55;
      }
    },
    dispose() {
      running = false;
      cancelAnimationFrame(frameHandle);
      window.removeEventListener('resize', resize);
      if (resizeObserver) resizeObserver.disconnect();
      controls.dispose();
      human.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      stool.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
      stoolMaterial.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}

export { VIEWS };
