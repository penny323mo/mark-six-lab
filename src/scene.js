import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BALL_NUMBERS, ballColor, formatNumber } from './rules.js';
import { BALL_RADIUS, CHAMBER_RADIUS, GATE_AXIS, GATE_EXIT, GATE_RADIUS } from './physics.js';

const pigments = { red: '#cf2a40', blue: '#2069c7', green: '#12875e' };
const gateAxis = new THREE.Vector3(...GATE_AXIS);
const up = new THREE.Vector3(0, 1, 0);
const gateRotation = new THREE.Quaternion().setFromUnitVectors(up, gateAxis);
const outlet = gateAxis.clone().multiplyScalar(GATE_EXIT);
const tubeExit = new THREE.Vector3(2.36, -1.67, 0.77);
const track = new THREE.CubicBezierCurve3(
  outlet,
  outlet.clone().addScaledVector(gateAxis, 0.83),
  new THREE.Vector3(2.76, -0.58, 0.96),
  tubeExit,
);
const travelPosition = new THREE.Vector3();
const travelStartOffset = new THREE.Vector3();

function getReleasedPosition(ball, progress) {
  // The pickup flange funnels the ball onto the centerline of the clear chute.
  track.getPointAt(progress, travelPosition);
  travelStartOffset.set(ball.x, ball.y, ball.z).sub(outlet);
  return travelPosition.addScaledVector(travelStartOffset, Math.max(0, 1 - progress * 6));
}

function ballTexture(number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = pigments[ballColor(number)];
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '800 35px Arial, sans-serif';
  for (const center of [0, 128, 256, 384, 512]) {
    context.fillStyle = '#fbf6e8';
    context.beginPath();
    context.arc(center, 123, 37, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#fff9e8b3';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(center, 123, 42, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = '#102034';
    context.fillText(formatNumber(number), center, 124);
  }

  context.fillStyle = '#ffffff73';
  context.fillRect(0, 61, 512, 2);
  context.fillRect(0, 184, 512, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function place(geometry, material, parent, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function torus(parent, radius, width, material, z = 0, arc = Math.PI * 2, rotation = 0) {
  const mesh = place(new THREE.TorusGeometry(radius, width, 10, 120, arc), material, parent, 0, 0, z);
  mesh.rotation.z = rotation;
  return mesh;
}

function cylinder(parent, top, bottom, height, material, x, y, z) {
  return place(new THREE.CylinderGeometry(top, bottom, height, 64), material, parent, x, y, z);
}

function axisCylinder(parent, top, bottom, length, material, offset, open = false) {
  const mesh = place(new THREE.CylinderGeometry(top, bottom, length, 48, 1, open), material, parent);
  mesh.position.copy(gateAxis).multiplyScalar(offset);
  mesh.quaternion.copy(gateRotation);
  return mesh;
}

function glassMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 viewNormal;
      varying vec3 localPoint;
      void main() {
        localPoint = position;
        viewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 viewNormal;
      varying vec3 localPoint;
      void main() {
        vec3 normal = normalize(viewNormal);
        float edge = pow(1.0 - max(0.0, normal.z), 3.2);
        float upper = smoothstep(-0.15, 1.4, localPoint.y);
        float leftPanel = exp(-pow((localPoint.x + 0.65 + localPoint.y * 0.53) * 4.5, 2.0)) * upper;
        float leftStrip = exp(-pow((localPoint.x + 0.38 + localPoint.y * 0.53) * 19.0, 2.0)) * upper;
        float rightStrip = exp(-pow((localPoint.x - 0.93 - localPoint.y * 0.19) * 12.0, 2.0)) * upper;
        float ceiling = pow(max(0.0, dot(normal, normalize(vec3(-0.24, 0.91, 0.37)))), 42.0);
        vec3 tint = mix(vec3(0.38, 0.64, 0.93), vec3(0.94, 0.98, 1.0), upper);
        gl_FragColor = vec4(tint, 0.01 + edge * 0.28 + leftPanel * 0.18
          + leftStrip * 0.31 + rightStrip * 0.27 + ceiling * 0.44);
      }
    `,
  });
}

function makeStudio(scene) {
  scene.background = new THREE.Color(0x142d54);
  scene.fog = new THREE.FogExp2(0x315785, 0.026);
  const floorY = -2.51;
  const wallRadius = 13;
  const wallAngle = Math.PI * 0.45;
  const arc = Math.PI * 1.1;
  const backdrop = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 worldPoint;
      void main() {
        worldPoint = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPoint, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 worldPoint;
      void main() {
        float floorWash = exp(-pow((worldPoint.y + 0.5) * 0.68, 2.0));
        float stageWash = exp(-pow((worldPoint.x + 1.9) * 0.14, 2.0));
        float panels = smoothstep(0.985, 0.999, abs(sin(worldPoint.x * 2.2)));
        float height = smoothstep(-2.0, 4.9, worldPoint.y);
        vec3 color = mix(vec3(0.19, 0.29, 0.45), vec3(0.075, 0.13, 0.23), height);
        color += vec3(0.17, 0.28, 0.42) * stageWash * floorWash;
        color *= 1.0 - panels * 0.12;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const makeWallBand = (radius, height, y, material) => place(
    new THREE.CylinderGeometry(radius, radius, height, 110, 1, true, wallAngle, arc),
    material, scene, 0, y, 0,
  );
  makeWallBand(wallRadius, 13, 3.7, backdrop);
  const darkBands = new THREE.MeshStandardMaterial({ color: 0x17263d, metalness: 0.35,
    roughness: 0.53, side: THREE.BackSide });
  const wallLight = new THREE.MeshBasicMaterial({ color: 0x9cc8ff, side: THREE.BackSide });
  const wallBlue = new THREE.MeshBasicMaterial({ color: 0x355b91, side: THREE.BackSide });
  makeWallBand(wallRadius - 0.12, 0.46, -1.88, darkBands);
  makeWallBand(wallRadius - 0.16, 0.046, -1.63, wallLight);
  makeWallBand(wallRadius - 0.14, 0.028, -2.09, wallBlue);
  makeWallBand(wallRadius - 0.19, 0.16, 2.88, darkBands);
  makeWallBand(wallRadius - 0.21, 0.031, 2.97, wallBlue);
  makeWallBand(wallRadius - 0.14, 0.034, 4.45, wallLight);

  const tile = new THREE.MeshStandardMaterial({ color: 0x293e5e, metalness: 0.28, roughness: 0.45 });
  const emptyFloor = place(new THREE.PlaneGeometry(70, 70), tile, scene, 0, floorY - 0.2, 0);
  emptyFloor.rotation.x = -Math.PI / 2;
  emptyFloor.receiveShadow = true;

  const riserMaterial = new THREE.MeshStandardMaterial({ color: 0x152139, metalness: 0.54, roughness: 0.38 });
  const riserTop = new THREE.MeshStandardMaterial({ color: 0x57759a, metalness: 0.30, roughness: 0.35 });
  const riser = cylinder(scene, 5.55, 5.65, 0.18, riserMaterial, 0, floorY - 0.113, 0);
  riser.receiveShadow = true;
  const stageSurface = cylinder(scene, 5.51, 5.51, 0.026, riserTop, 0, floorY - 0.014, 0);
  stageSurface.receiveShadow = true;

  const stageLight = new THREE.MeshBasicMaterial({ color: 0xb3daff, toneMapped: false });
  const stageAccent = new THREE.MeshBasicMaterial({ color: 0x76a4d8 });
  for (const [radius, width, color] of [
    [3.30, 0.011, stageAccent], [3.47, 0.018, stageLight], [4.78, 0.010, stageAccent],
    [5.31, 0.027, stageLight], [5.46, 0.012, stageAccent],
  ]) {
    const ring = place(new THREE.RingGeometry(radius - width, radius + width, 144), color, scene, 0, floorY + 0.005, 0);
    ring.rotation.x = -Math.PI / 2;
  }

  for (const side of [-1, 1]) {
    const bar = place(new THREE.BoxGeometry(0.065, 3.25, 0.055), wallLight, scene, side * 6.5, 0.27, -10.83);
    bar.rotation.z = side * -0.16;
    place(new THREE.BoxGeometry(0.027, 2.63, 0.042), wallBlue, scene, side * 6.84, 0.34, -10.72)
      .rotation.z = bar.rotation.z;
  }

  const rig = new THREE.Group();
  scene.add(rig);
  torus(rig, 6.3, 0.065, riserMaterial, 0, Math.PI).rotation.set(Math.PI / 2, 0, Math.PI);
  torus(rig, 6.18, 0.025, wallLight, 0, Math.PI).rotation.set(Math.PI / 2, 0, Math.PI);
  rig.position.y = 4.12;
  rig.position.z = -2.2;

  const white = new THREE.MeshBasicMaterial({ color: 0xe8f7ff, toneMapped: false });
  for (const offset of [-3.8, -1.55, 1.60, 3.78]) {
    const light = cylinder(scene, 0.18, 0.24, 0.30, riserMaterial, offset, 3.66, -5.2);
    light.rotation.z = offset * 0.07;
    const lamp = cylinder(scene, 0.16, 0.18, 0.018, white, offset + offset * 0.012, 3.50, -5.2);
    lamp.rotation.copy(light.rotation);
  }

  const bloom = document.createElement('canvas');
  bloom.width = bloom.height = 128;
  const context = bloom.getContext('2d');
  const pool = context.createRadialGradient(64, 64, 5, 64, 64, 64);
  pool.addColorStop(0, '#b6e2ff60');
  pool.addColorStop(0.48, '#80b8fb42');
  pool.addColorStop(1, '#629cf800');
  context.fillStyle = pool;
  context.fillRect(0, 0, 128, 128);
  const bloomTexture = new THREE.CanvasTexture(bloom);
  const lightPool = place(new THREE.PlaneGeometry(8.5, 8.5), new THREE.MeshBasicMaterial({
    map: bloomTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), scene, -0.25, floorY + 0.014, -0.9);
  lightPool.rotation.x = -Math.PI / 2;
  lightPool.renderOrder = 1;
}

function makeMachine(scene) {
  const shell = new THREE.Group();
  scene.add(shell);
  const dark = new THREE.MeshStandardMaterial({ color: 0x202d3d, metalness: 0.64, roughness: 0.34 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x748a9e, metalness: 0.92, roughness: 0.27 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xd0dce5, metalness: 0.62, roughness: 0.24 });
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xd5e4ec, metalness: 0.25, roughness: 0.32 });
  const bright = new THREE.MeshBasicMaterial({ color: 0xe3f6ff, toneMapped: false });
  const ice = new THREE.MeshBasicMaterial({ color: 0x91ceff, toneMapped: false });
  const dim = new THREE.MeshBasicMaterial({ color: 0x4f8bb8, toneMapped: false });

  const aperture = Math.asin(GATE_RADIUS / CHAMBER_RADIUS);
  const glassShape = new THREE.SphereGeometry(CHAMBER_RADIUS, 72, 48, 0, Math.PI * 2, aperture, Math.PI - aperture);
  const glass = place(glassShape, glassMaterial(), shell);
  glass.quaternion.copy(gateRotation);
  glass.renderOrder = 4;
  const backGlass = place(glassShape, new THREE.MeshBasicMaterial({
    color: 0xb8ddff, transparent: true, opacity: 0.07, side: THREE.BackSide, depthWrite: false,
  }), shell);
  backGlass.quaternion.copy(gateRotation);
  backGlass.renderOrder = 2;
  const reflection = new THREE.MeshBasicMaterial({
    color: 0xdef6ff, transparent: true, opacity: 0.21, depthWrite: false, toneMapped: false,
  });
  const highlight = torus(shell, Math.sqrt(CHAMBER_RADIUS ** 2 - 0.92 ** 2), 0.0065, reflection, 0.92, 0.67, 1.72);
  highlight.renderOrder = 4;
  torus(shell, Math.sqrt(CHAMBER_RADIUS ** 2 - 1.2 ** 2), 0.0038, reflection, 1.2, 0.49, 0.23).renderOrder = 4;

  // Opposing rims and radial couplers give the chamber an open, structural frame.
  torus(shell, 1.755, 0.085, dark, -0.42);
  torus(shell, 1.785, 0.043, steel, -0.43);
  torus(shell, 1.733, 0.012, dim, -0.50);
  torus(shell, 1.764, 0.083, dark, 0.285);
  torus(shell, 1.785, 0.057, silver, 0.35);
  torus(shell, 1.833, 0.019, steel, 0.359);
  torus(shell, 1.725, 0.023, ceramic, 0.409);
  torus(shell, 1.707, 0.009, ice, 0.407);
  torus(shell, 1.811, 0.013, bright, 0.393, Math.PI * 1.18, Math.PI * 0.02);
  torus(shell, 1.811, 0.013, bright, 0.393, Math.PI * 0.37, Math.PI * 1.39);

  const fastener = new THREE.CylinderGeometry(0.041, 0.041, 0.06, 6);
  const tickGeometry = new THREE.BoxGeometry(0.012, 0.036, 0.008);
  for (let index = 0; index < 48; index += 1) {
    const angle = index / 48 * Math.PI * 2;
    const tick = place(tickGeometry, index % 6 === 0 ? bright : dim, shell,
      1.665 * Math.cos(angle), 1.665 * Math.sin(angle), 0.46);
    tick.rotation.z = angle - Math.PI / 2;
    tick.scale.y = index % 6 === 0 ? 1.4 : 0.55;
  }

  for (const degrees of [13, 106, 178, 219, 289, 333]) {
    const angle = degrees * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rib = place(new THREE.BoxGeometry(0.12, 0.19, 0.92), dark, shell, 1.812 * cos, 1.812 * sin, -0.05);
    rib.rotation.z = angle;
    const cap = place(new THREE.BoxGeometry(0.125, 0.142, 0.11), silver, shell, 1.827 * cos, 1.827 * sin, 0.435);
    cap.rotation.z = angle;
    const bolt = place(fastener, steel, shell, cap.position.x, cap.position.y, 0.491);
    bolt.rotation.x = Math.PI / 2;
    place(new THREE.BoxGeometry(0.031, 0.008, 0.008), dark, shell,
      cap.position.x, cap.position.y, 0.522).rotation.z = angle;
  }

  const clear = new THREE.MeshPhysicalMaterial({
    color: 0xb2dbff, roughness: 0.24, metalness: 0.10,
    transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide,
  });
  const neck = axisCylinder(shell, GATE_RADIUS + 0.011, GATE_RADIUS + 0.011, 0.4, clear, 1.98, true);
  neck.renderOrder = 3;
  axisCylinder(shell, 0.37, 0.39, 0.12, dark, 1.77, true);
  axisCylinder(shell, 0.353, 0.354, 0.062, silver, 1.856, true);
  axisCylinder(shell, 0.319, 0.319, 0.045, steel, 1.914, true);
  axisCylinder(shell, 0.316, 0.316, 0.07, silver, 2.095, true);

  const gateLamp = new THREE.MeshBasicMaterial({ color: 0x3c819e, toneMapped: false });
  const outletLamp = axisCylinder(shell, 0.32, 0.32, 0.022, gateLamp, 2.13, true);
  outletLamp.renderOrder = 4;
  const gatePivot = new THREE.Group();
  gatePivot.position.copy(gateAxis).multiplyScalar(2.147);
  gatePivot.quaternion.copy(gateRotation);
  shell.add(gatePivot);
  const shutter = new THREE.Group();
  shutter.position.x = -GATE_RADIUS;
  gatePivot.add(shutter);
  cylinder(shutter, GATE_RADIUS * 0.96, GATE_RADIUS * 0.96, 0.035, dark, GATE_RADIUS, 0, 0);
  cylinder(shutter, 0.118, 0.118, 0.012, steel, GATE_RADIUS, -0.022, 0);

  const chute = place(new THREE.TubeGeometry(track, 72, 0.183, 16, false), clear, shell);
  chute.renderOrder = 3;
  for (const sign of [-1, 1]) {
    const edge = [];
    for (let index = 0; index <= 44; index += 1) {
      const point = track.getPoint(index / 44);
      const tangent = track.getTangent(index / 44);
      const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
      edge.push(point.addScaledVector(normal, sign * 0.176));
    }
    const rail = new THREE.CatmullRomCurve3(edge);
    place(new THREE.TubeGeometry(rail, 55, 0.014, 6, false), silver, shell);
  }

  for (const point of [0.18, 0.53, 0.83]) {
    const position = track.getPointAt(point);
    const tangent = track.getTangentAt(point);
    const band = place(new THREE.TorusGeometry(0.186, 0.023, 8, 32), steel, shell);
    band.position.copy(position);
    band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
  }

  // The receiver and its cable channel are supported by the same floor deck.
  cylinder(shell, 0.257, 0.33, 0.13, ceramic, tubeExit.x, -1.795, tubeExit.z);
  cylinder(shell, 0.316, 0.37, 0.046, ice, tubeExit.x, -1.875, tubeExit.z);
  cylinder(shell, 0.21, 0.33, 0.51, dark, tubeExit.x, -2.15, tubeExit.z);
  cylinder(shell, 0.31, 0.39, 0.12, silver, tubeExit.x, -2.43, tubeExit.z);
  place(new THREE.BoxGeometry(1.42, 0.12, 0.52), dark, shell, 1.58, -2.405, 0.52);
  place(new THREE.BoxGeometry(1.14, 0.018, 0.065), dim, shell, 1.63, -2.333, 0.76);

  cylinder(shell, 1.05, 0.90, 0.18, ceramic, 0, -1.762, 0);
  cylinder(shell, 1.000, 0.93, 0.065, steel, 0, -1.875, 0);
  cylinder(shell, 0.976, 0.941, 0.035, ice, 0, -1.923, 0);
  cylinder(shell, 0.94, 1.19, 0.42, ceramic, 0, -2.141, 0);
  cylinder(shell, 1.23, 1.30, 0.068, steel, 0, -2.357, 0);
  cylinder(shell, 1.296, 1.34, 0.035, dim, 0, -2.412, 0);
  cylinder(shell, 1.34, 1.41, 0.085, dark, 0, -2.468, 0);

  const plate = place(new THREE.BoxGeometry(0.82, 0.21, 0.05), dark, shell, 0, -2.13, 1.068);
  plate.rotation.x = -0.19;
  const indicator = new THREE.MeshBasicMaterial({ color: 0x6093ad, toneMapped: false });
  place(new THREE.BoxGeometry(0.39, 0.025, 0.018), indicator, shell, 0, -2.125, 1.101);
  for (const x of [-0.31, 0.31]) {
    const pin = place(new THREE.CylinderGeometry(0.031, 0.031, 0.02, 6), steel, shell, x, -2.129, 1.106);
    pin.rotation.x = Math.PI / 2;
  }
  shell.traverse(mesh => {
    if (mesh.isMesh && mesh.material.isMeshStandardMaterial && !mesh.material.transparent) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { gateLamp, shutter, indicator };
}

function makeThreeScene(host) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const environment = new RoomEnvironment();
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  const environmentMap = environmentGenerator.fromScene(environment, 0.055);
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = 0.82;
  environment.dispose();
  environmentGenerator.dispose();
  scene.add(new THREE.HemisphereLight(0xe1f1ff, 0x344663, 1.05));

  const key = new THREE.DirectionalLight(0xf3f7ff, 2.35);
  key.position.set(-3.75, 6.5, 4.5);
  key.castShadow = true;
  key.shadow.camera.left = -4.2;
  key.shadow.camera.right = 4.2;
  key.shadow.camera.top = 3.5;
  key.shadow.camera.bottom = -3.9;
  key.shadow.camera.far = 18;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.normalBias = 0.028;
  key.shadow.bias = -0.00045;
  key.shadow.radius = 2;
  const fill = new THREE.DirectionalLight(0x7eb4ff, 2.1);
  fill.position.set(4, 2.2, -3);
  const frontLight = new THREE.DirectionalLight(0xe1ecff, 0.78);
  frontLight.position.set(1, -0.2, 5);
  scene.add(key, fill, frontLight);

  makeStudio(scene);
  const { gateLamp, shutter, indicator } = makeMachine(scene);
  const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 24, 16);
  const ballMeshes = new Map();
  for (const number of BALL_NUMBERS) {
    const material = new THREE.MeshPhysicalMaterial({
      map: ballTexture(number), roughness: 0.34, metalness: 0.035, clearcoat: 0.52, clearcoatRoughness: 0.23,
    });
    const mesh = place(ballGeometry, material, scene);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ballMeshes.set(number, mesh);
  }

  const camera = new THREE.PerspectiveCamera(34.6, 1, 0.1, 60);
  const center = new THREE.Vector3(0.18, -0.34, 0);
  const cameras = {
    front: new THREE.Vector3(1.10, 1.45, 8.72),
    side: new THREE.Vector3(5.64, 2.25, 7.03),
    overhead: new THREE.Vector3(0.55, 7.02, 6.55),
  };
  const cameraAngle = cameras.front.clone();
  const cameraTarget = cameras.front.clone();
  let lastRender = performance.now();

  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    const narrowFov = 2 * Math.atan(3.02 / (cameras.front.length() * camera.aspect)) / THREE.MathUtils.DEG2RAD;
    camera.fov = Math.max(34.6, narrowFov);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  host.replaceChildren(renderer.domElement);
  new ResizeObserver(resize).observe(host);
  resize();

  return {
    mode: '3d',
    setView(view) {
      cameraTarget.copy(cameras[view] ?? cameras.front);
    },
    render(machine) {
      const now = performance.now();
      const elapsed = Math.min(0.5, (now - lastRender) / 1000);
      lastRender = now;
      cameraAngle.lerp(cameraTarget, 1 - Math.exp(-7.5 * elapsed));
      camera.position.copy(cameraAngle).add(center);
      camera.lookAt(center);

      for (const mesh of ballMeshes.values()) mesh.visible = false;
      for (const ball of machine.balls) {
        const mesh = ballMeshes.get(ball.number);
        mesh.visible = true;
        mesh.position.set(ball.x, ball.y, ball.z);
        mesh.rotation.set(ball.ax, ball.ay + ball.number, ball.az);
      }
      if (machine.release) {
        const { ball } = machine.release;
        const mesh = ballMeshes.get(ball.number);
        mesh.visible = true;
        mesh.position.copy(getReleasedPosition(ball, machine.travel));
        mesh.rotation.set(ball.ax + machine.travel * 7, ball.ay, ball.az + machine.travel * 4);
      }

      const open = machine.gateOpen || machine.release !== null;
      shutter.rotation.z = THREE.MathUtils.lerp(shutter.rotation.z, open ? 1.9 : 0, 1 - Math.exp(-20 * elapsed));
      gateLamp.color.setHex(open ? 0xbdf7ff : 0x3c819e);
      indicator.color.setHex(machine.state === 'running' ? 0x9bedff : 0x6093ad);
      renderer.render(scene, camera);
    },
  };
}

function makeCanvasScene(host) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  let view = 'front';
  let angle = 0;
  let elevation = 0;
  host.replaceChildren(canvas);

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.65);
    canvas.width = host.clientWidth * ratio;
    canvas.height = host.clientHeight * ratio;
  }

  new ResizeObserver(resize).observe(host);
  resize();

  return {
    mode: '2d',
    setView(nextView) {
      view = nextView;
    },
    render(machine) {
      const { width, height } = canvas;
      if (!context || !width || !height) return;
      angle += ((view === 'side' ? 0.6 : 0) - angle) * 0.09;
      elevation += ((view === 'overhead' ? 0.78 : 0) - elevation) * 0.09;
      const scale = Math.min(width / 5.7, height / 5);
      const x = width / 2 - 0.2 * scale;
      const y = height / 2 - 0.23 * scale;
      const radius = CHAMBER_RADIUS * scale;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      context.clearRect(0, 0, width, height);
      context.save();
      context.translate(x, y);
      context.scale(scale, scale);

      const glass = context.createRadialGradient(-0.85, -1.05, 0, 0, 0, CHAMBER_RADIUS);
      glass.addColorStop(0, '#667e899c');
      glass.addColorStop(0.55, '#26394256');
      glass.addColorStop(1, '#15282f99');
      context.fillStyle = glass;
      context.beginPath();
      context.arc(0, 0, radius / scale, 0, Math.PI * 2);
      context.fill();
      context.lineWidth = 0.085;
      context.strokeStyle = '#9dc5ea';
      context.stroke();
      context.beginPath();
      context.arc(0, 0, 1.72, Math.PI * 0.98, Math.PI * 1.8);
      context.lineWidth = 0.027;
      context.strokeStyle = '#d3edff';
      context.stroke();

      context.beginPath();
      context.moveTo(-0.85, 1.76);
      context.lineTo(0.85, 1.76);
      context.lineTo(1.13, 2.43);
      context.lineTo(-1.13, 2.43);
      context.closePath();
      const base = context.createLinearGradient(-1.1, 0, 1.1, 0);
      base.addColorStop(0, '#67839d');
      base.addColorStop(0.45, '#d2e2ed');
      base.addColorStop(1, '#586c85');
      context.fillStyle = base;
      context.fill();
      context.fillStyle = '#1b2028';
      context.fillRect(-1.2, 2.38, 2.4, 0.1);

      const project = ({ x: px, y: py, z: pz }) => [
        px * cosine - pz * sine, -py * Math.cos(elevation) + pz * Math.sin(elevation),
      ];
      const route = track.getPoints(35);
      context.beginPath();
      route.forEach((point, index) => {
        const [px, py] = project(point);
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.lineWidth = 0.33;
      context.strokeStyle = '#92cafa46';
      context.stroke();
      context.lineWidth = 0.014;
      context.strokeStyle = machine.gateOpen ? '#defffd' : '#89afd0';
      context.stroke();

      const balls = [...machine.balls].sort((left, right) =>
        ((left.z - right.z) * cosine + (left.x - right.x) * sine),
      );
      if (machine.release) {
        const { ball } = machine.release;
        const position = getReleasedPosition(ball, machine.travel);
        balls.push({ number: ball.number, x: position.x, y: position.y, z: position.z });
      }
      context.font = '800 0.115px Arial, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      for (const ball of balls) {
        const [px, py] = project(ball);
        const glaze = context.createRadialGradient(px - 0.05, py - 0.07, 0, px, py, BALL_RADIUS);
        glaze.addColorStop(0, '#fdebcd');
        glaze.addColorStop(0.42, pigments[ballColor(ball.number)]);
        glaze.addColorStop(1, '#162536');
        context.beginPath();
        context.arc(px, py, BALL_RADIUS, 0, Math.PI * 2);
        context.fillStyle = glaze;
        context.fill();
        context.beginPath();
        context.arc(px, py, BALL_RADIUS * 0.55, 0, Math.PI * 2);
        context.fillStyle = '#f8f1e3';
        context.fill();
        context.fillStyle = '#112235';
        context.fillText(formatNumber(ball.number), px, py + 0.004);
      }
      context.restore();
    },
  };
}

export function createMachineScene(host) {
  try {
    const view = makeThreeScene(host);
    const canvas = host.querySelector('canvas');
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      if (host.contains(canvas)) {
        const fallback = makeCanvasScene(host);
        view.mode = fallback.mode;
        view.setView = fallback.setView;
        view.render = fallback.render;
        host.dataset.renderer = fallback.mode;
      }
    }, { once: true });
    host.dataset.renderer = view.mode;
    return view;
  } catch {
    const fallback = makeCanvasScene(host);
    host.dataset.renderer = fallback.mode;
    return fallback;
  }
}
