import { BALL_COUNT, DRAW_COUNT, MAIN_COUNT, shuffledNumbers } from './rules.js';

export const TIME_STEP = 1 / 120;
// Scene dimensions are scaled so a 50 mm diameter ball spans 0.25 units.
export const BALL_RADIUS = 0.125;
export const CHAMBER_RADIUS = 1.66;
export const GRAVITY = 9.81 / 0.20;
export const POCKET_RADIUS = 0.219;
export const TRACK_RADIUS = 1.86;
export const TRACK_END = 1.97;
export const LIFT_TIME = 0.84;
const returnTime = 0.68;
const centerLimit = CHAMBER_RADIUS - BALL_RADIUS;
const gateClearance = POCKET_RADIUS - BALL_RADIUS;
const funnelEdge = 0.66;
const funnelSlope = 0.66;
const funnelEdgeY = -Math.sqrt(centerLimit ** 2 - funnelEdge ** 2);
const mouthY = funnelEdgeY - funnelSlope * (funnelEdge - gateClearance);
export const POCKET_Y = mouthY - 0.15;
const minimumDistance = 2 * BALL_RADIUS;
const ballRestitution = 0.63;
const launchTime = 2.8;
const parkTime = 0.32;
const railSpacing = 2 * Math.asin((BALL_RADIUS + 0.001) / TRACK_RADIUS);

// The same swept capsule centerlines drive both motor contacts and the visible paddles.
// Each local [radial, height, tangential] point belongs to a bent mechanical arm.
const armShapes = [
  [[0.17, -1.45, 0.00], [0.60, -1.37, -0.07], [1.00, -1.16, -0.15], [1.26, -0.84, -0.08]],
  [[0.19, -1.17, 0.00], [0.62, -1.08, 0.15], [1.10, -0.98, 0.27], [1.30, -0.73, 0.28]],
];
export const ARM_RADIUS = 0.066;
const motorSpeeds = [3.85, -3.32];

export function armPoints(index, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return armShapes[index].map(([r, y, t]) => ({
    x: r * cos - t * sin, y, z: r * sin + t * cos,
  }));
}

export function railPosition(index, angle = railStop(index)) {
  const sign = index < MAIN_COUNT ? -1 : 1;
  return { x: sign * TRACK_RADIUS * Math.sin(angle), y: TRACK_RADIUS * Math.cos(angle), z: 0 };
}

export function railStop(index) {
  return TRACK_END - (index < MAIN_COUNT ? index * railSpacing : 0);
}

function spawnBalls(labels) {
  const balls = [];
  const spacing = 2 * BALL_RADIUS + 0.021;
  for (let layer = 0; balls.length < BALL_COUNT; layer += 1) {
    const y = -centerLimit + 0.075 + layer * spacing;
    const offset = layer % 2 * spacing / 2;
    for (let column = -5; column <= 5 && balls.length < BALL_COUNT; column += 1) {
      for (let row = -5; row <= 5 && balls.length < BALL_COUNT; row += 1) {
        const x = column * spacing + offset;
        const z = row * spacing + offset;
        if (x * x + y * y + z * z > (centerLimit - 0.012) ** 2) continue;
        balls.push({
          number: labels[balls.length],
          x, y, z,
          vx: 0, vy: 0, vz: 0,
          ax: 0, ay: 0, az: 0,
          inPocket: false,
        });
      }
    }
  }
  return balls;
}

// Equal masses, a normal impulse and a small positional correction for overlap.
export function collideBalls(left, right) {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const dz = right.z - left.z;
  const distanceSquared = dx * dx + dy * dy + dz * dz;
  if (distanceSquared >= minimumDistance * minimumDistance) return;
  const distance = Math.sqrt(distanceSquared);
  const nx = distance > 1e-8 ? dx / distance : 1;
  const ny = distance > 1e-8 ? dy / distance : 0;
  const nz = distance > 1e-8 ? dz / distance : 0;

  const correction = Math.max(0, minimumDistance - distance - 0.00025) * 0.48;
  left.x -= nx * correction;
  left.y -= ny * correction;
  left.z -= nz * correction;
  right.x += nx * correction;
  right.y += ny * correction;
  right.z += nz * correction;

  const normalSpeed = (right.vx - left.vx) * nx
    + (right.vy - left.vy) * ny
    + (right.vz - left.vz) * nz;
  if (normalSpeed >= 0) return;
  const restitution = normalSpeed < -0.6 ? ballRestitution : 0;
  const impulse = -(1 + restitution) * normalSpeed / 2;
  left.vx -= impulse * nx;
  left.vy -= impulse * ny;
  left.vz -= impulse * nz;
  right.vx += impulse * nx;
  right.vy += impulse * ny;
  right.vz += impulse * nz;
}

// Normal impulse against a fixed surface or a moving paddle, with bounded sliding friction.
function surfaceContact(ball, nx, ny, nz, depth, restitution, wallVX = 0, wallVZ = 0, friction = 0.16) {
  ball.x += nx * depth;
  ball.y += ny * depth;
  ball.z += nz * depth;
  const vx = ball.vx - wallVX;
  const vy = ball.vy;
  const vz = ball.vz - wallVZ;
  const vn = vx * nx + vy * ny + vz * nz;
  if (vn >= 0) return;
  const impulse = -(1 + (vn < -1 ? restitution : 0)) * vn;
  const tx = vx - vn * nx;
  const ty = vy - vn * ny;
  const tz = vz - vn * nz;
  const slip = Math.hypot(tx, ty, tz);
  const grip = slip > 0 ? Math.min(1, friction * impulse / slip) : 0;
  ball.vx += nx * impulse - tx * grip;
  ball.vy += ny * impulse - ty * grip;
  ball.vz += nz * impulse - tz * grip;
}

export function constrainToChamber(ball, gateOpen) {
  const radial = Math.hypot(ball.x, ball.z);
  if (ball.y < 0 && radial < funnelEdge) {
    if (ball.inPocket || radial <= gateClearance) {
      if (radial > gateClearance && ball.y < mouthY) {
        surfaceContact(ball, -ball.x / radial, 0, -ball.z / radial, radial - gateClearance, 0.25);
      }
      if (!gateOpen && ball.y < mouthY) surfaceContact(ball, 0, 1, 0, mouthY - ball.y, 0.1);
      ball.inPocket = gateOpen && ball.y < mouthY;
      return ball.inPocket && ball.y <= POCKET_Y && ball.vy < 0;
    }
    const height = funnelEdgeY + (radial - funnelEdge) * funnelSlope;
    if (ball.y < height) {
      const normalY = 1 / Math.hypot(1, funnelSlope);
      const inward = -funnelSlope * normalY / radial;
      surfaceContact(ball, ball.x * inward, normalY, ball.z * inward,
        (height - ball.y) * normalY, 0.36, 0, 0, 0.07);
    }
    return false;
  }

  ball.inPocket = false;
  const distance = Math.hypot(radial, ball.y);
  if (distance > centerLimit) {
    surfaceContact(ball, -ball.x / distance, -ball.y / distance, -ball.z / distance,
      distance - centerLimit, 0.49, 0, 0, 0.09);
  }
  return false;
}

function contactPaddle(ball, segments, angularSpeed) {
  if (ball.y > -0.51) return;
  const clearance = BALL_RADIUS + ARM_RADIUS;
  let a = segments[0];
  for (let i = 1; i < segments.length; i++) {
    const b = segments[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((ball.x - a.x) * dx + (ball.y - a.y) * dy
      + (ball.z - a.z) * dz) / (dx * dx + dy * dy + dz * dz)));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const nx = ball.x - px;
    const ny = ball.y - a.y - dy * t;
    const nz = ball.z - pz;
    const d2 = nx * nx + ny * ny + nz * nz;
    if (d2 < clearance * clearance) {
      const d = Math.sqrt(d2);
      surfaceContact(ball, d ? nx / d : 0, d ? ny / d : 1, d ? nz / d : 0, clearance - d,
        0.54, -angularSpeed * pz, angularSpeed * px, 0.30);
    }
    a = b;
  }
}

function integrate(ball) {
  ball.vy -= GRAVITY * TIME_STEP;
  ball.vx *= 0.9994;
  ball.vy *= 0.9994;
  ball.vz *= 0.9994;
  ball.x += ball.vx * TIME_STEP;
  ball.y += ball.vy * TIME_STEP;
  ball.z += ball.vz * TIME_STEP;
  ball.ax += ball.vz * TIME_STEP / BALL_RADIUS * 0.65;
  ball.ay += ball.vx * TIME_STEP / BALL_RADIUS * 0.35;
  ball.az -= ball.vx * TIME_STEP / BALL_RADIUS * 0.65;
}

function smooth(t) {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

function contactLift(ball, headY) {
  const clearance = 0.094 + BALL_RADIUS;
  const radial = Math.hypot(ball.x, ball.z);
  if (ball.y > headY + BALL_RADIUS || radial >= clearance) return;
  const topDepth = headY + BALL_RADIUS - ball.y;
  if (topDepth < clearance - radial) surfaceContact(ball, 0, 1, 0, topDepth, 0.25);
  else if (radial > 0) {
    surfaceContact(ball, ball.x / radial, 0, ball.z / radial, clearance - radial, 0.28);
  }
}

export class DrawMachine {
  constructor(labels = shuffledNumbers(), phase = 0) {
    this.balls = spawnBalls(labels);
    this.angles = [phase, Math.PI + phase * 0.63];
    this.time = 0;
    this.power = 0;
    this.drawn = [];
    this.release = null;
    this.liftY = POCKET_Y - BALL_RADIUS;
    this.gateOpen = false;
    this.nextGate = 0;
    this.state = 'idle';
    this.parkedAt = 0;
  }

  start() {
    if (this.state !== 'idle') return;
    this.nextGate = this.time + launchTime;
    this.state = 'running';
  }

  advance() {
    if (this.state !== 'running' && this.time - this.parkedAt >= 2.4) return;
    this.time += TIME_STEP;
    const running = this.state === 'running';
    this.power = running ? Math.min(1, this.power + TIME_STEP * 1.3) : Math.max(0, this.power - TIME_STEP * 2);
    this.gateOpen = running && !this.release && this.time >= this.nextGate;
    const paddles = this.angles.map((angle, i) => {
      this.angles[i] = (angle + motorSpeeds[i] * this.power * TIME_STEP) % (2 * Math.PI);
      return armPoints(i, this.angles[i]);
    });
    for (const ball of this.balls) integrate(ball);

    let captured;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      for (let i = 0; i < this.balls.length; i += 1) {
        const ball = this.balls[i];
        for (let j = i + 1; j < this.balls.length; j += 1) collideBalls(ball, this.balls[j]);
        contactPaddle(ball, paddles[0], motorSpeeds[0] * this.power);
        contactPaddle(ball, paddles[1], motorSpeeds[1] * this.power);
        if (this.release) contactLift(ball, this.liftY);
      }
      for (const ball of this.balls) {
        if (constrainToChamber(ball, this.gateOpen)) {
          captured = ball;
          this.gateOpen = false;
          break;
        }
      }
      if (captured) break;
    }
    if (captured) {
      this.balls.splice(this.balls.indexOf(captured), 1);
      this.release = { ball: captured, startedAt: this.time, angle: 0, omega: 0.42, phase: 'lift' };
    }
    if (this.release) return this.advanceRelease();
  }

  advanceRelease() {
    const release = this.release;
    const age = this.time - release.startedAt;
    const bottom = POCKET_Y - BALL_RADIUS;
    const top = TRACK_RADIUS - BALL_RADIUS;
    if (age < LIFT_TIME) {
      this.liftY = bottom + (top - bottom) * smooth(age / LIFT_TIME);
      return;
    }
    this.liftY = top + (bottom - top) * smooth((age - LIFT_TIME) / returnTime);
    release.phase = 'rail';
    // A solid sphere rolling on a circular track accelerates at (5/7)g sin(theta).
    release.omega += (5 / 7 * GRAVITY * Math.sin(release.angle) / TRACK_RADIUS
      - 0.22 * release.omega) * TIME_STEP;
    release.angle += release.omega * TIME_STEP;
    if (release.angle < railStop(this.drawn.length)) return;
    this.drawn.push(release.ball.number);
    this.release = null;
    this.liftY = bottom;
    this.nextGate = this.time + parkTime;
    if (this.drawn.length === DRAW_COUNT) {
      this.state = 'complete';
      this.parkedAt = this.time;
    }
    return release.ball.number;
  }

  get carriedPosition() {
    if (!this.release) return null;
    if (this.release.phase === 'rail') return railPosition(this.drawn.length, this.release.angle);
    const ball = this.release.ball;
    const t = smooth((this.time - this.release.startedAt) / LIFT_TIME);
    return { x: ball.x * (1 - t), y: ball.y + (TRACK_RADIUS - ball.y) * t, z: ball.z * (1 - t) };
  }
}
