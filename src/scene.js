import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BALL_NUMBERS, MAIN_COUNT, ballColor, formatNumber } from './rules.js';
import { ARM_RADIUS, BALL_RADIUS, CHAMBER_RADIUS, POCKET_Y, TRACK_END, TRACK_RADIUS,
  armPoints, railPosition } from './physics.js';

const pigments = { red: '#cc1527', blue: '#116bb2', green: '#328731' };

function ballTexture(number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = pigments[ballColor(number)];
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = 'bold 39px Arial, sans-serif';
  for (const [row, y] of [[0, 64],[1, 134],[2,204]]) {
    for (let col = -1; col < 6; col++) {
      const cx = (col + (row % 2) / 2) * 114;
      context.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = k * Math.PI * 2 / 5 - Math.PI / 2;
        const x = cx + Math.cos(a) * 42;
        const py = y + Math.sin(a) * 32;
        if (k === 0) context.moveTo(x, py);
        else context.lineTo(x, py);
      }
      context.closePath();
      context.fillStyle = '#fffdf6';
      context.fill();
      context.strokeStyle = '#eee5d9';
      context.lineWidth = 1.5;
      context.stroke();
      context.fillStyle = '#121c23';
      context.fillText(String(number), cx, y + 1);
    }
  }
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
  ctx.font = size + 'px Arial, "Noto Sans CJK TC", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  const letters = Array.from(text);
  const total = letters.reduce((n, c) => n + ctx.measureText(c).width, 0) + spacing * (letters.length - 1);
  let x = (canvas.width - total) / 2;
  for (const c of letters) {
    ctx.fillText(c, x, 94);
    x += ctx.measureText(c).width + spacing;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
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
  wallCanvas.width = 16;
  wallCanvas.height = 512;
  const ctx = wallCanvas.getContext('2d');
  const wash = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [stop, color] of [[0, '#aaa7b2'], [0.35, '#d0c9c5'], [0.65, '#c6bfc4'],
    [0.82, '#aeabc6'], [0.94, '#8a91df'], [1, '#8485e4']]) wash.addColorStop(stop, color);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 16, 512);
  const texture = new THREE.CanvasTexture(wallCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  wall(wallRadius, 11, 3.97, new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, toneMapped: false }));
  const wallFinish = color => new THREE.MeshStandardMaterial({ color, roughness: 0.64, side: THREE.BackSide });
  wall(wallRadius - 0.04, 0.21, -1.60, wallFinish(0xe0dce1));
  wall(wallRadius - 0.07, 0.28, -1.84, wallFinish(0x24232d));
  wall(wallRadius - 0.12, 0.10, -2.03, wallFinish(0xc7c8d0));
  wall(wallRadius - 0.14, 0.40, -2.29, wallFinish(0x292734));
  wall(wallRadius - 0.18, 0.65, -2.82, wallFinish(0x9fa2b2));

  const words = [printPanel('MARK SIX', 117, '#444354', 20), printPanel('六合彩', 114, '#454456', 19)];
  const panel = new THREE.PlaneGeometry(4.88, 0.90);
  for (let row = 0; row < 3; row++) {
    for (let col = -4; col <= 4; col++) {
      const angle = (col + (row % 2) * 0.42) * 0.49;
      const material = words[Math.abs(col + row) % 2];
      const board = place(panel, material, scene, Math.sin(angle) * 9.56,
        3.06 - row * 1.57, -Math.cos(angle) * 9.56);
      board.rotation.y = -angle;
    }
  }
  const floor = place(new THREE.PlaneGeometry(60,60), new THREE.MeshStandardMaterial({
    color: 0x646382, roughness: 0.56, metalness: 0.13,
  }), scene, 0, floorY - 0.015, 0);
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  const line = new THREE.MeshBasicMaterial({ color: 0x88889f });
  for (const r of [3.70, 5.12]) {
    const ring = place(new THREE.RingGeometry(r, r + 0.012, 120), line, scene, 0, floorY, 0);
    ring.rotation.x = -Math.PI/2;
  }
}

function makeMachine(scene) {
  const shell = new THREE.Group();
  scene.add(shell);
  const enamel = new THREE.MeshStandardMaterial({ color: 0xf2f1ef, roughness: 0.30, metalness: 0.12 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb8bbca, roughness: 0.18, metalness: 0.87 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x353840, roughness: 0.32, metalness: 0.65 });
  const acrylic = new THREE.MeshPhysicalMaterial({ color: 0xc9d9ef, roughness: 0.10, metalness: 0.05,
    transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const lip = new THREE.MeshBasicMaterial({ color: 0xdce5f4, transparent: true, opacity: 0.67, depthWrite: false });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfffcf5, toneMapped: false });
  const glow = new THREE.MeshBasicMaterial({ color: 0xff4228, toneMapped: false });
  const liftLight = new THREE.MeshBasicMaterial({ color: 0xe3fcff, toneMapped: false });
  const clearBowl = place(new THREE.SphereGeometry(CHAMBER_RADIUS, 72, 52, 0, Math.PI * 2, 0.10, Math.PI - 0.24),
    glassMaterial(), shell);
  clearBowl.renderOrder = 3;
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
    const stopper = place(new THREE.BoxGeometry(0.24, 0.044, 0.34), chrome, shell, stop.x, stop.y, 0);
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
  // Five clear loading channels and their open mouths are visible behind the bowl.
  for (let i = -2; i <= 2; i++) {
    const x = i * 0.305;
    const from = { x, y: 0.01, z: -0.43 };
    const to = { x, y: 1.93 - 0.032 * i * i, z: -0.65 };
    tubeBetween(shell, from, to, 0.147, acrylic, true);
    for (const end of [from, to]) {
      const rim = torus(shell, 0.149, 0.009, lip);
      rim.position.copy(end);
      rim.rotation.x = 1.19;
    }
    for (const dx of [-0.145, 0.145]) tubeBetween(shell,
      { ...from, x:x+dx }, { ...to, x:x+dx }, 0.005, lip);
  }
  const top = place(new THREE.BoxGeometry(0.65, 0.20, 0.41), acrylic, shell, 0, 1.88, -0.025);
  top.renderOrder = 2;
  for (const x of [-0.29,0.29]) {
    cylinder(shell, 0.046, 0.046, 0.065, chrome, x, 1.95, 0.10);
    cylinder(shell, 0.051, 0.051, 0.045, chrome, x, 1.76, -0.12);
  }
  tubeBetween(shell, {x:0,y:POCKET_Y,z:0}, {x:0,y:1.76,z:0}, 0.142, acrylic, true);
  cylinder(shell, 0.34, 0.26, 0.065, chrome, 0, -1.63, 0);
  const piston = cylinder(shell, 0.092, 0.092, 1, liftLight, 0, POCKET_Y, 0);
  const cup = cylinder(shell, 0.142, 0.102, 0.054, chrome, 0, POCKET_Y, 0);

  const paddles = [0,1].map(i => {
    const rotor = new THREE.Group();
    shell.add(rotor);
    const pts = armPoints(i, 0);
    pts.slice(1).forEach((p,n) => tubeBetween(rotor, pts[n], p, ARM_RADIUS, chrome));
    for (const p of pts) place(new THREE.SphereGeometry(ARM_RADIUS,12,8), chrome, rotor, p.x,p.y,p.z);
    return rotor;
  });

  cylinder(shell, 1.36, 1.38, 0.17, enamel, 0, -1.82, -0.04);
  cylinder(shell, 1.55, 1.55, 0.049, chrome, 0, -1.925, -0.04);
  cylinder(shell, 1.55, 1.53, 0.058, glow, 0, -1.975, -0.04);
  cylinder(shell, 1.50, 1.47, 0.055, graphite, 0, -2.024, -0.04);
  cylinder(shell, 1.37, 1.15, 1.03, enamel, 0, -2.54, -0.04);
  cylinder(shell, 1.16, 1.18, 0.065, chrome, 0, -3.073, -0.04);
  const name = place(new THREE.PlaneGeometry(1.28,0.23), printPanel('MARK SIX',124,'#3e4358',14), shell,
    0, -2.51, 1.23);
  name.rotation.x = -0.21;
  shell.traverse(mesh => {
    if (mesh.isMesh && mesh.material.isMeshStandardMaterial && !mesh.material.transparent) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { paddles, piston, cup };
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
  scene.add(new THREE.HemisphereLight(0xfaf7f4, 0x615a73, 0.85));

  const key = new THREE.DirectionalLight(0xfff8ec, 2.0);
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
  const fill = new THREE.DirectionalLight(0xc6d8ff, 1.65);
  fill.position.set(4, 2.2, -3);
  const frontLight = new THREE.DirectionalLight(0xe1ecff, 0.78);
  frontLight.position.set(1, -0.2, 5);
  scene.add(key, fill, frontLight);

  makeStudio(scene);
  const { paddles, piston, cup } = makeMachine(scene);
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
  const center = new THREE.Vector3(0, -0.48, 0);
  const cameras = {
    front: new THREE.Vector3(0, 0.71, 9.05),
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
    const narrowFov = 2 * Math.atan(2.24 / (cameras.front.length() * camera.aspect)) / THREE.MathUtils.DEG2RAD;
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
        const mesh = ballMeshes.get(machine.release.ball.number);
        mesh.visible = true;
        mesh.position.copy(machine.carriedPosition);
        mesh.rotation.z = machine.release.angle * TRACK_RADIUS / BALL_RADIUS;
      }
      machine.drawn.forEach((number, i) => {
        const mesh = ballMeshes.get(number);
        mesh.visible = true;
        mesh.position.copy(railPosition(i));
        mesh.rotation.set(0, 0.7, i * 0.22);
      });
      paddles.forEach((paddle,i) => { paddle.rotation.y = -machine.angles[i]; });
      const shaftBottom = POCKET_Y - 0.19;
      piston.scale.y = Math.max(0.01, machine.liftY - shaftBottom);
      piston.position.y = shaftBottom + piston.scale.y / 2;
      cup.position.y = machine.liftY;
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
      const scale = Math.min(width / 4.7, height / 5.5);
      const x = width / 2;
      const y = height / 2 - 0.4 * scale;
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
      context.fillStyle = '#ff482d';
      context.fillRect(-1.2, 2.38, 2.4, 0.1);

      const project = ({ x: px, y: py, z: pz }) => [
        px * cosine - pz * sine, -py * Math.cos(elevation) + pz * Math.sin(elevation),
      ];
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
      for (let i=-2; i<=2; i++) {
        for (const side of [-1,1]) {
          const x = i*0.305 + side*0.143;
          line([{x,y:0.01,z:-0.43},{x,y:1.90,z:-0.65}], '#c7cddd', 0.011);
        }
      }
      for (const [i,angle] of machine.angles.entries()) line(armPoints(i,angle), '#8a8c9b', 2*ARM_RADIUS);
      line([{x:0,y:POCKET_Y,z:0}, {x:0,y:machine.liftY,z:0}], '#ebfcff', 0.18);
      const balls = [...machine.balls, ...machine.drawn.map((number,i) => ({number, ...railPosition(i)}))];
      if (machine.release) balls.push({number:machine.release.ball.number, ...machine.carriedPosition});
      balls.sort((a,b) => (a.z-b.z)*cosine + (a.x-b.x)*sine);
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
