import * as THREE from 'three';
import { studioCamera } from './camera.js';
import { MARK_SIX, letteringSurface } from './lettering.js';
import { BALL_NUMBERS, MAIN_COUNT, ballColor } from './rules.js';
import { ARM_RADIUS, BALL_RADIUS, CHAMBER_RADIUS, FEED_CHANNELS, FEED_MOUTH_Y, FEED_RADIUS, FEED_SHELF_Y,
  FEED_TOP_Y, GUIDE_BASE, GUIDE_RADIUS, POCKET_Y, TRACK_END, TRACK_RADIUS,
  armPoints, railPosition } from './physics.js';

const pigments = { red: '#cc1023', blue: '#0572b2', green: '#208126' };
const diskRatio = 0.58;

function ballTexture(number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = pigments[ballColor(number)];
  context.fillRect(0, 0, 256, 256);
  const center = canvas.width / 2;
  const diskRadius = center * diskRatio;
  context.beginPath();
  context.arc(center, center, diskRadius, 0, Math.PI * 2);
  context.fillStyle = '#fffbee';
  context.fill();
  context.textAlign = 'center';
  const label = String(number);
  context.font = '900 112px Arial, sans-serif';
  const metrics = context.measureText(label);
  context.fillStyle = '#080b0e';
  context.fillText(label, center, center + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
  if (number === 6 || number === 9) context.fillRect(center - 19, center + 51, 38, 5);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Project the ink onto each face along its normal so a head-on disk stays circular on the sphere.
function numberedBallGeometry() {
  const geometry = new THREE.BoxGeometry(2, 2, 2, 16, 16, 16);
  const { position, normal, uv } = geometry.attributes;
  const direction = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    direction.fromBufferAttribute(position, i);
    const scale = 1 / direction.length();
    direction.multiplyScalar(scale);
    uv.setXY(i, 0.5 + (uv.getX(i) - 0.5) * scale, 0.5 + (uv.getY(i) - 0.5) * scale);
    normal.setXYZ(i, direction.x, direction.y, direction.z);
    position.setXYZ(i, direction.x * BALL_RADIUS, direction.y * BALL_RADIUS, direction.z * BALL_RADIUS);
  }
  geometry.computeBoundingSphere();
  return geometry;
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

function glassMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.016, transmission: 1, thickness: 0.018, ior: 1.49,
    depthWrite: false,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.feedCenters = { value: FEED_CHANNELS.map(p => new THREE.Vector2(p.x, p.z)) };
    shader.vertexShader = 'varying vec3 bowlPoint;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n bowlPoint = position;',
    );
    shader.fragmentShader = 'varying vec3 bowlPoint;\nuniform vec2 feedCenters[' + FEED_CHANNELS.length
      + '];\n' + shader.fragmentShader.replace('#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n if (bowlPoint.y > 0.0) { for (int i = 0; i < '
        + FEED_CHANNELS.length + '; i++) { if (distance(bowlPoint.xz, feedCenters[i]) < '
        + (FEED_RADIUS + 0.004) + ') discard; } }');
  };
  return material;
}

function studioEnvironment(renderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x535260);
  const cards = [
    { position: [-3.8, 5.3, 4.2], size: [4.3, 2.5], color: 0xfff3df, power: 5.0 },
    { position: [4.2, 2.5, 2.0], size: [1.3, 4.3], color: 0xe0ecff, power: 3.0 },
    { position: [-2.4, 2.8, -3.8], size: [3.4, 1.1], color: 0xe7eeff, power: 3.4 },
    { position: [-2.7, 1.0, 3.2], size: [0.18, 2.5], color: 0xfff5e9, power: 5.6 },
    { position: [1.4, 3.1, 2.8], size: [0.9, 0.17], color: 0xf7fbff, power: 5.3 },
  ];
  for (const {position, size, color, power} of cards) {
    const softbox = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide, toneMapped: false,
    }));
    softbox.position.set(...position);
    softbox.lookAt(0, 0, 0);
    studio.add(softbox);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const map = generator.fromScene(studio, 0.02);
  generator.dispose();
  for (const softbox of studio.children) {
    softbox.material.dispose();
    softbox.geometry.dispose();
  }
  return map.texture;
}

function tubeBetween(parent, from, to, radius, material, open = false) {
  const start = new THREE.Vector3(from.x, from.y, from.z);
  const direction = new THREE.Vector3(to.x, to.y, to.z).sub(start);
  const mesh = place(new THREE.CylinderGeometry(radius, radius, direction.length(), 24, 1, open), material, parent);
  mesh.position.copy(start).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function printPanel(text, size, ink, spacing = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 184;
  const ctx = canvas.getContext('2d');
  ctx.font = '500 ' + size + 'px Arial, Helvetica, "Noto Sans CJK TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
  const bounds = ctx.measureText(text);
  const x = canvas.width / 2 + (bounds.actualBoundingBoxLeft - bounds.actualBoundingBoxRight) / 2;
  const baseline = (canvas.height + bounds.actualBoundingBoxAscent - bounds.actualBoundingBoxDescent) / 2;
  ctx.fillText(text, x, baseline);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
}

function makeStudio(scene) {
  scene.background = new THREE.Color(0xb9b7c4);
  const floorY = -3.12;
  const wallRadius = 9.7;
  const wallStart = Math.PI * 0.43;
  const sweep = Math.PI * 1.14;
  function wall(radius, height, y, material) {
    return place(new THREE.CylinderGeometry(radius, radius, height, 120, 1, true, wallStart, sweep),
      material, scene, 0, y, 0);
  }
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 1024;
  wallCanvas.height = 512;
  const ctx = wallCanvas.getContext('2d');
  const wash = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [stop, color] of [[0, '#747179'], [0.28, '#bbafac'], [0.63, '#c1b6b8'],
    [0.83, '#a8a3b6'], [0.95, '#8587bb'], [1, '#7c7dda']]) wash.addColorStop(stop, color);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 1024, 512);
  for (const x of [98, 356, 660, 926]) {
    const pool = ctx.createRadialGradient(x, 507, 0, x, 507, 150);
    pool.addColorStop(0, '#a6aeff65');
    pool.addColorStop(1, '#8990cc00');
    ctx.fillStyle = pool;
    ctx.fillRect(x - 150, 357, 300, 155);
  }
  const texture = new THREE.CanvasTexture(wallCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  wall(wallRadius, 11, 3.97, new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, toneMapped: false }));
  const wallFinish = color => new THREE.MeshStandardMaterial({ color, roughness: 0.64, side: THREE.BackSide });
  wall(wallRadius - 0.04, 0.21, -1.60, wallFinish(0xe0dce1));
  wall(wallRadius - 0.07, 0.28, -1.84, wallFinish(0x24232d));
  wall(wallRadius - 0.12, 0.10, -2.03, wallFinish(0xc7c8d0));
  wall(wallRadius - 0.14, 0.40, -2.29, wallFinish(0x292734));
  wall(wallRadius - 0.18, 0.65, -2.82, wallFinish(0x9fa2b2));

  const words = [printPanel(MARK_SIX, 105, '#575569', 19), printPanel('六合彩', 105, '#605e70', 16)];
  const panel = letteringSurface(5.7, 1.03, wallRadius - 0.045, wallRadius - 0.045, true);
  for (let row = 0; row < 3; row++) {
    for (let col = -4; col <= 4; col++) {
      const angle = (col + (row % 2) * 0.47) * 0.55;
      const material = words[Math.abs(col + row) % 2];
      const board = place(panel, material, scene, 0, 3.06 - row * 1.57, 0);
      board.rotation.y = -angle;
    }
  }
  const floor = place(new THREE.PlaneGeometry(60,60), new THREE.MeshStandardMaterial({
    color: 0x676882, roughness: 0.56, metalness: 0.06,
  }), scene, 0, floorY - 0.015, 0);
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowCtx = shadowCanvas.getContext('2d');
  const falloff = shadowCtx.createRadialGradient(64,64,0,64,64,64);
  falloff.addColorStop(0, '#181725a8');
  falloff.addColorStop(0.56, '#191a265c');
  falloff.addColorStop(1, '#26293900');
  shadowCtx.fillStyle = falloff;
  shadowCtx.fillRect(0, 0, 128, 128);
  const contact = place(new THREE.PlaneGeometry(4.5, 3.6), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false,
  }), scene, 0.12, floorY + 0.002, -0.09);
  contact.rotation.x = -Math.PI / 2;
  const line = new THREE.MeshBasicMaterial({ color: 0x88889f });
  for (const r of [3.70, 5.12]) {
    const ring = place(new THREE.RingGeometry(r, r + 0.012, 120), line, scene, 0, floorY, 0);
    ring.rotation.x = -Math.PI/2;
  }
  makeStudioWings(scene, floorY);
}

function makeStudioWings(scene, floorY) {
  const paint = color => new THREE.MeshStandardMaterial({ color, roughness: 0.66, side: THREE.DoubleSide });
  const cream = paint(0xd4c8b5);
  const charcoal = paint(0x27272a);
  const alloy = new THREE.MeshStandardMaterial({ color: 0xb3afb0, metalness: 0.68, roughness: 0.34 });
  const amber = new THREE.MeshBasicMaterial({ color: 0xef7956 });
  const radius = 14.6;
  const inner = (r, h, y, material) =>
    place(new THREE.CylinderGeometry(r, r, h, 96, 1, true), material, scene, 0, y, 0);
  inner(radius, 11, 2.18, cream);
  for (const y of [-2.68,-2.24,-1.78,0.15,2.55,3.05,3.69]) {
    inner(radius - 0.065, 0.13, y, charcoal);
  }
  for (const y of [-2.0, 2.86]) inner(radius - 0.08, 0.085, y, amber);
  for (const angle of [-1.15, -0.56, -0.23, 0.23, 0.56, 1.15]) {
    const post = place(new THREE.BoxGeometry(0.36, 7.45, 0.46), cream, scene,
      14.2 * Math.sin(angle), 0.50, 14.2 * Math.cos(angle));
    post.rotation.set(0, angle, angle < 0 ? -0.063 : 0.063);
  }
  const screen = new THREE.Group();
  screen.position.set(0, 0.52, 14.25);
  screen.rotation.y = Math.PI;
  scene.add(screen);
  place(new THREE.BoxGeometry(4.26, 2.49, 0.15), alloy, screen);
  place(new THREE.BoxGeometry(4.10, 2.32, 0.10), paint(0x13263d), screen, 0, 0, 0.09);
  place(new THREE.PlaneGeometry(3.8, 0.7), printPanel('六合彩',125,'#e4eaf2',11), screen, 0, 0.10, 0.15);
  place(new THREE.PlaneGeometry(2.3, 0.414), printPanel(MARK_SIX,106,'#bacbd9',16), screen, 0, -0.44, 0.15);
  for (const side of [-1,1]) {
    const standby = new THREE.Group();
    standby.position.set(8.8 * side, floorY, 5.1);
    standby.rotation.y = side * 0.85;
    scene.add(standby);
    cylinder(standby, 0.83, 0.89, 1.73, cream, 0, 0.89, 0);
    cylinder(standby, 0.93, 0.94, 0.08, alloy, 0, 0.08, 0);
    cylinder(standby, 0.91, 0.92, 0.10, alloy, 0, 1.75, 0);
    const dome = place(new THREE.SphereGeometry(0.88, 32, 20),
      new THREE.MeshPhysicalMaterial({color: 0xd5e0e9, roughness: 0.18, transparent: true,
        opacity: 0.16, depthWrite: false}), standby, 0, 2.43, 0);
    torus(dome, 0.88, 0.024, alloy);
    cylinder(standby, 0.035, 0.035, 1.38, alloy, 0, 2.44, 0);
  }
  const roof = place(new THREE.CircleGeometry(15, 64), charcoal, scene, 0, 7.65, 0);
  roof.rotation.x = Math.PI / 2;
  const lampFace = new THREE.MeshBasicMaterial({color: 0xfff3dd});
  for (const z of [-4, 2.5, 8.5]) {
    place(new THREE.BoxGeometry(22, 0.16, 0.15), charcoal, scene, 0, 7.36, z);
    for (const x of [-5.1, -2.6, 2.6, 5.1]) {
      const fixture = new THREE.Group();
      fixture.position.set(x, 6.98, z);
      fixture.rotation.set(-z * 0.035, 0, x * 0.09);
      scene.add(fixture);
      place(new THREE.BoxGeometry(0.29, 0.40, 0.28), charcoal, fixture);
      cylinder(fixture, 0.16, 0.21, 0.22, charcoal, 0, -0.23, 0);
      cylinder(fixture, 0.17, 0.17, 0.012, lampFace, 0, -0.35, 0);
    }
  }
}

function makeMachine(scene) {
  const shell = new THREE.Group();
  scene.add(shell);
  const enamel = new THREE.MeshStandardMaterial({ color: 0xe3e0dd, roughness: 0.35, metalness: 0.16 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb2b2ba, roughness: 0.23, metalness: 0.86 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x353840, roughness: 0.32, metalness: 0.65 });
  const acrylic = new THREE.MeshPhysicalMaterial({ color: 0xc9d9ef, roughness: 0.10, metalness: 0.05,
    transparent: true, opacity: 0.23, depthWrite: false, side: THREE.DoubleSide });
  acrylic.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', [
      'float grazing = 1.0 - abs(dot(normal, normalize(vViewPosition)));',
      'diffuseColor.a *= 0.18 + 0.82 * grazing * grazing;',
      '#include <opaque_fragment>',
    ].join('\n'));
  };
  const lip = new THREE.MeshBasicMaterial({ color: 0xdce5f4, transparent: true, opacity: 0.67, depthWrite: false });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xf1ece2, toneMapped: false });
  const redDiffuser = new THREE.MeshStandardMaterial({
    color: 0xad261b, emissive: 0xe22f14, emissiveIntensity: 0.56, roughness: 0.29,
  });
  const liftLight = new THREE.MeshBasicMaterial({ color: 0xe3fcff, toneMapped: false });
  const clearBowl = place(new THREE.SphereGeometry(CHAMBER_RADIUS, 72, 52, 0, Math.PI * 2, 0.10, Math.PI - 0.24),
    glassMaterial(), shell);
  clearBowl.renderOrder = 1;
  torus(shell, 1.64, 0.010, lip, -0.20);
  torus(shell, 1.53, 0.013, lip, 0.64, 0.63, 1.40);
  torus(shell, 1.32, 0.009, lip, 1.00, 0.55, 0.20);

  // Paired acrylic tracks sit in front of the opal arch. Their centerline is the physical rail.
  for (const side of [-1, 1]) {
    const arc = (radius, thickness, material, z, sweep = TRACK_END + 0.09) => {
      const start = side === -1 ? Math.PI/2 : Math.PI/2 - sweep;
      return torus(shell, radius, thickness, material, z, sweep, start);
    };
    arc(TRACK_RADIUS + 0.045, 0.116, enamel, -0.175);
    arc(TRACK_RADIUS + 0.056, 0.084, lamp, -0.086);
    arc(TRACK_RADIUS, BALL_RADIUS + 0.033, acrylic, 0).renderOrder = 4;
    arc(TRACK_RADIUS + 0.14, 0.016, chrome, 0.064);
    arc(TRACK_RADIUS - 0.142, 0.013, lip, 0.067);
    arc(TRACK_RADIUS + 0.126, 0.010, lip, 0.116);
    const stop = railPosition(side === -1 ? 0 : MAIN_COUNT, TRACK_END + 0.085);
    const stopper = place(new THREE.BoxGeometry(0.24, 0.040, 0.25), acrylic, shell, stop.x, stop.y, 0);
    stopper.rotation.z = side === -1 ? -0.42 : 0.42;

    const saddle = new THREE.Shape();
    saddle.moveTo(0.34, -1.80);
    saddle.lineTo(1.26, -1.80);
    saddle.quadraticCurveTo(1.45, -1.78, 1.51, -1.54);
    saddle.quadraticCurveTo(1.91, -1.06, 1.96, -0.66);
    saddle.lineTo(1.66, -0.81);
    saddle.quadraticCurveTo(1.46, -1.27, 0.97, -1.56);
    saddle.quadraticCurveTo(0.70, -1.71, 0.34, -1.68);
    saddle.closePath();
    const support = place(new THREE.ExtrudeGeometry(saddle, { depth: 0.68, bevelEnabled: true,
      bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 3, steps: 1 }), enamel, shell, 0, 0, -0.35);
    support.scale.x = side;
  }
  const feedSlides = [];
  for (const {x,z} of FEED_CHANNELS) {
    const from = { x, y: FEED_MOUTH_Y, z };
    const to = { x, y: FEED_TOP_Y, z };
    tubeBetween(shell, from, to, FEED_RADIUS, acrylic, true);
    for (const y of [FEED_MOUTH_Y, FEED_TOP_Y]) {
      const rim = torus(shell, FEED_RADIUS, 0.008, lip);
      rim.position.set(x,y,z);
      rim.rotation.x = Math.PI / 2;
    }
    for (const side of [-1, 1]) {
      const edgeX = x + side * FEED_RADIUS;
      tubeBetween(shell, { x: edgeX, y: FEED_MOUTH_Y, z }, { x: edgeX, y: FEED_TOP_Y, z }, 0.006, lip);
    }
    const slide = place(new THREE.BoxGeometry(FEED_RADIUS * 2, 0.034, FEED_RADIUS * 2),
      chrome, shell, x, FEED_SHELF_Y - 0.017, z);
    feedSlides.push(slide);
  }
  const rackWidth = FEED_CHANNELS.at(-1).x - FEED_CHANNELS[0].x + 2 * FEED_RADIUS;
  for (const y of [FEED_SHELF_Y + 0.03, FEED_SHELF_Y + 1.22, FEED_TOP_Y - 0.035]) {
    place(new THREE.BoxGeometry(rackWidth + 0.09, 0.055, 0.060), acrylic, shell, 0, y, -0.39);
    place(new THREE.BoxGeometry(rackWidth + 0.07, 0.014, 0.025), lip, shell, 0, y - 0.024, -0.37);
    for (const sign of [-1,1]) {
      const pin = cylinder(shell, 0.022, 0.022, 0.055, chrome, sign * (rackWidth / 2), y, -0.38);
      pin.rotation.x = Math.PI / 2;
    }
  }
  const top = place(new THREE.BoxGeometry(0.65, 0.20, 0.41), acrylic, shell, 0, 1.88, -0.025);
  top.renderOrder = 2;
  for (const x of [-0.29,0.29]) {
    cylinder(shell, 0.046, 0.046, 0.065, chrome, x, 1.95, 0.10);
    cylinder(shell, 0.051, 0.051, 0.045, chrome, x, 1.76, -0.12);
  }
  tubeBetween(shell, {x:0,y:GUIDE_BASE,z:0}, {x:0,y:1.76,z:0}, GUIDE_RADIUS, acrylic, true);
  cylinder(shell, 0.34, 0.26, 0.065, chrome, 0, -1.63, 0);
  const piston = cylinder(shell, 0.092, 0.092, 1, liftLight, 0, POCKET_Y, 0);
  const cup = cylinder(shell, 0.142, 0.102, 0.054, chrome, 0, POCKET_Y, 0);

  const paddles = [0,1].map(i => {
    const rotor = new THREE.Group();
    shell.add(rotor);
    const pts = armPoints(i, 0);
    const hub = torus(rotor, pts[0].x, 0.028, chrome);
    hub.position.y = pts[0].y;
    hub.rotation.x = Math.PI / 2;
    pts.slice(1).forEach((p,n) => tubeBetween(rotor, pts[n], p, ARM_RADIUS, chrome));
    for (const p of pts) place(new THREE.SphereGeometry(ARM_RADIUS,12,8), chrome, rotor, p.x,p.y,p.z);
    return rotor;
  });

  cylinder(shell, 1.36, 1.38, 0.17, enamel, 0, -1.82, -0.04);
  cylinder(shell, 1.55, 1.55, 0.049, chrome, 0, -1.925, -0.04);
  cylinder(shell, 1.55, 1.53, 0.058, redDiffuser, 0, -1.975, -0.04);
  const diodes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.034, 0.026, 0.009),
    new THREE.MeshBasicMaterial({ color: 0xff9254, toneMapped: false }), 144);
  const diode = new THREE.Object3D();
  for (let i = 0; i < diodes.count; i++) {
    const angle = i / diodes.count * 2 * Math.PI;
    diode.position.set(1.546 * Math.sin(angle), -1.974, 1.546 * Math.cos(angle) - 0.04);
    diode.rotation.y = angle;
    diode.updateMatrix();
    diodes.setMatrixAt(i, diode.matrix);
  }
  shell.add(diodes);
  cylinder(shell, 1.50, 1.47, 0.055, graphite, 0, -2.024, -0.04);
  const pedestal = cylinder(shell, 1.37, 1.15, 1.03, enamel, 0, -2.54, -0.04);
  cylinder(shell, 1.16, 1.18, 0.065, chrome, 0, -3.073, -0.04);
  const { radiusTop, radiusBottom, height } = pedestal.geometry.parameters;
  const labelY = pedestal.position.y + 0.03;
  const labelHeight = 0.285;
  const pedestalAt = y => THREE.MathUtils.lerp(radiusBottom, radiusTop, 0.5 + (y - pedestal.position.y) / height) + 0.008;
  const name = letteringSurface(1.58, labelHeight, pedestalAt(labelY - labelHeight / 2), pedestalAt(labelY + labelHeight / 2));
  place(name, printPanel(MARK_SIX,124,'#343749',12), shell, 0, labelY, pedestal.position.z);
  shell.traverse(mesh => {
    if (mesh.isMesh && mesh.material.isMeshStandardMaterial && !mesh.material.transparent && !mesh.material.transmission) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { paddles, piston, cup, feedSlides };
}

function makeThreeScene(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.99;
  renderer.transmissionResolutionScale = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.83;
  scene.add(new THREE.HemisphereLight(0xe6e9f3, 0x5c5061, 0.46));
  const key = new THREE.DirectionalLight(0xfff0db, 1.94);
  key.position.set(-3.8, 5.3, 4.2);
  key.castShadow = true;
  key.shadow.camera.left = -4.2;
  key.shadow.camera.right = 4.2;
  key.shadow.camera.top = 5.2;
  key.shadow.camera.bottom = -3.9;
  key.shadow.camera.far = 18;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.normalBias = 0.009;
  key.shadow.bias = -0.00045;
  key.shadow.radius = 4.6;
  key.shadow.intensity = 0.62;
  const fill = new THREE.DirectionalLight(0xd3dfff, 0.78);
  fill.position.set(4.2, 2.5, 2);
  const rimLight = new THREE.DirectionalLight(0xe1eaff, 0.92);
  rimLight.position.set(-2.4, 2.8, -3.8);
  scene.add(key, fill, rimLight);

  makeStudio(scene);
  const { paddles, piston, cup, feedSlides } = makeMachine(scene);
  const ballGeometry = numberedBallGeometry();
  const ballMeshes = new Map();
  for (const number of BALL_NUMBERS) {
    const material = new THREE.MeshPhysicalMaterial({
      map: ballTexture(number), roughness: 0.50, metalness: 0, clearcoat: 0.16, clearcoatRoughness: 0.34,
    });
    const mesh = place(ballGeometry, material, scene);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ballMeshes.set(number, mesh);
  }

  const navigation = studioCamera(renderer.domElement);
  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    navigation.resize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2000000 / (width * height))));
    renderer.setSize(width, height, false);
  }

  host.replaceChildren(renderer.domElement);
  new ResizeObserver(resize).observe(host);
  resize();

  return {
    mode: '3d',
    setView: navigation.setView,
    setExplore: navigation.setExplore,
    render(machine) {
      navigation.update(machine);
      for (const mesh of ballMeshes.values()) mesh.visible = false;
      for (const ball of machine.balls) {
        const mesh = ballMeshes.get(ball.number);
        mesh.visible = true;
        mesh.position.set(ball.x, ball.y, ball.z);
        mesh.rotation.set(ball.ax, ball.ay, ball.az);
      }
      if (machine.release) {
        const mesh = ballMeshes.get(machine.release.ball.number);
        mesh.visible = true;
        mesh.position.copy(machine.carriedPosition);
        mesh.rotation.set(0, 0, machine.release.angle * TRACK_RADIUS / BALL_RADIUS);
      }
      machine.drawn.forEach((number, i) => {
        const mesh = ballMeshes.get(number);
        mesh.visible = true;
        mesh.position.copy(railPosition(i));
        mesh.rotation.set(0.02, i < MAIN_COUNT ? 0.08 : -0.08, -0.045);
      });
      feedSlides.forEach((slide, i) => { slide.position.z = FEED_CHANNELS[i].z - 0.38 * machine.feedGate; });
      paddles.forEach((paddle,i) => { paddle.rotation.y = -machine.angles[i]; });
      const shaftBottom = POCKET_Y - 0.19;
      piston.scale.y = Math.max(0.01, machine.liftY - shaftBottom);
      piston.position.y = shaftBottom + piston.scale.y / 2;
      cup.position.y = machine.liftY;
      renderer.render(scene, navigation.camera);
    },
  };
}

function makeCanvasScene(host) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  const navigation = studioCamera(canvas);
  host.replaceChildren(canvas);

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.65);
    canvas.width = host.clientWidth * ratio;
    canvas.height = host.clientHeight * ratio;
    if (canvas.height) navigation.resize(canvas.width, canvas.height);
  }

  new ResizeObserver(resize).observe(host);
  resize();

  return {
    mode: '2d',
    setView: navigation.setView,
    setExplore: navigation.setExplore,
    render(machine) {
      const { width, height } = canvas;
      if (!context || !width || !height) return;
      navigation.update(machine);
      const frameTarget = navigation.target;
      const frameDistance = navigation.offset.length();
      const angle = Math.atan2(navigation.offset.x, navigation.offset.z);
      const elevation = Math.asin(navigation.offset.y / frameDistance);
      const scale = Math.min(width / 4.50, height / 5.45) * 8.62 / frameDistance;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const project = p => [p.x * cosine - p.z * sine,
        -p.y * Math.cos(elevation) + (p.x * sine + p.z * cosine) * Math.sin(elevation)];
      const [cx, cy] = project(frameTarget);
      context.clearRect(0, 0, width, height);
      context.save();
      context.translate(width / 2 - cx * scale, height / 2 - cy * scale);
      context.scale(scale, scale);

      const glass = context.createRadialGradient(-0.85, -1.05, 0, 0, 0, CHAMBER_RADIUS);
      glass.addColorStop(0, '#667e899c');
      glass.addColorStop(0.55, '#26394256');
      glass.addColorStop(1, '#15282f99');
      context.fillStyle = glass;
      context.beginPath();
      context.arc(0, 0, CHAMBER_RADIUS, 0, Math.PI * 2);
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
      context.fillStyle = '#ff482d';
      context.fillRect(-1.2, 2.38, 2.4, 0.1);
      context.fillStyle = '#262c40';
      context.textAlign = 'center';
      context.font = '600 0.16px Arial, sans-serif';
      context.fillText(MARK_SIX, 0, 2.17);

      function line(points, color, thickness) {
        context.beginPath();
        points.forEach((p, i) => {
          const [px, py] = project(p);
          if (i === 0) context.moveTo(px,py);
          else context.lineTo(px,py);
        });
        context.lineWidth = thickness;
        context.strokeStyle = color;
        context.stroke();
      }
      for (const i of [0, MAIN_COUNT]) {
        const rail = Array.from({length:51}, (_,n) => railPosition(i, (TRACK_END+0.08)*n/50));
        line(rail, '#e3e5ef', 0.22);
        line(rail, '#a9bfd0', 0.035);
      }
      for (const {x,z} of FEED_CHANNELS) {
        for (const side of [-1,1]) {
          const edgeX = x + side * FEED_RADIUS;
          line([{x:edgeX,y:FEED_MOUTH_Y,z},{x:edgeX,y:FEED_TOP_Y,z}], '#c9d2db', 0.014);
        }
        const gateZ = z - 0.38 * machine.feedGate;
        line([{x:x-FEED_RADIUS,y:FEED_SHELF_Y,z:gateZ},
          {x:x+FEED_RADIUS,y:FEED_SHELF_Y,z:gateZ}], '#505a68', 0.031);
      }
      for (const y of [FEED_SHELF_Y + 0.03, FEED_SHELF_Y + 1.22, FEED_TOP_Y - 0.035]) {
        line([{x:-0.83,y,z:-0.39}, {x:0.83,y,z:-0.39}], '#d3d6df', 0.03);
      }
      for (const [i,angle] of machine.angles.entries()) line(armPoints(i,angle), '#8a8c9b', 2*ARM_RADIUS);
      line([{x:0,y:POCKET_Y,z:0}, {x:0,y:machine.liftY,z:0}], '#ebfcff', 0.18);
      const balls = [...machine.balls, ...machine.drawn.map((number,i) => ({number, ...railPosition(i)}))];
      if (machine.release) balls.push({number:machine.release.ball.number, ...machine.carriedPosition});
      balls.sort((a,b) => (a.z-b.z)*cosine + (a.x-b.x)*sine);
      context.font = '900 0.134px Arial, sans-serif';
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
        context.arc(px, py, BALL_RADIUS * diskRatio, 0, Math.PI * 2);
        context.fillStyle = '#f8f1e3';
        context.fill();
        context.fillStyle = '#112235';
        context.fillText(String(ball.number), px, py + 0.005);
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
        const exploring = Boolean(host.closest('dialog:modal'));
        view.setExplore(false);
        const fallback = makeCanvasScene(host);
        const preset = document.querySelector('[data-view][aria-pressed="true"]')?.dataset.view ?? 'front';
        fallback.setView(preset);
        fallback.setExplore(exploring);
        view.mode = fallback.mode;
        view.setView = fallback.setView;
        view.setExplore = fallback.setExplore;
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
