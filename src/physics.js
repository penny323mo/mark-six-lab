import { BALL_COUNT, BALL_NUMBERS, DRAW_COUNT, MAIN_COUNT } from './rules.js';

export const TIME_STEP = 1 / 120;
// Scene dimensions are scaled so a 50 mm diameter ball spans 0.25 units.
export const BALL_RADIUS = 0.125;
export const CHAMBER_RADIUS = 1.66;
export const GRAVITY = 9.81 / 0.20;
export const POCKET_RADIUS = 0.245;
export const TRACK_RADIUS = 1.86;
export const TRACK_END = 1.85;
export const LIFT_TIME = 0.84;
const returnTime = 0.68;
const centerLimit = CHAMBER_RADIUS - BALL_RADIUS;
const gateClearance = POCKET_RADIUS - BALL_RADIUS;
const funnelEdge = 0.66;
const funnelSlope = 0.88;
const funnelEdgeY = -Math.sqrt(centerLimit ** 2 - funnelEdge ** 2);
const mouthY = funnelEdgeY - funnelSlope * (funnelEdge - gateClearance);
export const POCKET_Y = mouthY - 0.15;
export const FEED_ROWS = 10;
export const FEED_RADIUS = 0.157;
export const FEED_SHELF_Y = 2.08;
export const FEED_MOUTH_Y = 0.33;
export const FEED_TOP_Y = FEED_SHELF_Y + 2 * BALL_RADIUS * FEED_ROWS + 0.07;
export const GUIDE_RADIUS = 0.142;
export const GUIDE_BASE = -1.11;
const feedOpenTime = 0.32;
export const FEED_CHANNELS = Object.freeze(Array.from({ length: Math.ceil(BALL_COUNT / FEED_ROWS) }, (_, i) => {
  const offset = i - 2;
  return Object.freeze({ x: offset * 0.326, z: -0.63 + 0.029 * offset * offset });
}));
const minimumDistance = 2 * BALL_RADIUS;
const ballRestitution = 0.63;
const fullTurn = 2 * Math.PI;
const launchTime = 2.8;
const parkTime = 0.32;
const railSpacing = 2 * Math.asin((BALL_RADIUS + 0.001) / TRACK_RADIUS);

// The same swept capsule centerlines drive both motor contacts and the visible paddles.
// Each local [radial, height, tangential] point belongs to a bent mechanical arm.
const armShapes = [
  [[0.20, -1.50, 0.00], [0.60, -1.37, -0.07], [1.00, -1.16, -0.15], [1.26, -0.84, -0.08]],
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

function roundRandom(phase) {
  let state = Math.floor(phase / fullTurn * 0x100000000) >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function loadRack(labels, random) {
  return labels.map((number, index) => {
    const feedLane = Math.floor(index / FEED_ROWS);
    const { x, z } = FEED_CHANNELS[feedLane];
    const row = index % FEED_ROWS;
    return {
      number, feedLane,
      x: x + (random() - 0.5) * 0.021,
      y: FEED_SHELF_Y + BALL_RADIUS + row * (2 * BALL_RADIUS + 0.0006),
      z: z + (random() - 0.5) * 0.021,
      vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0,
      ax: (random() - 0.5) * 0.34, ay: (random() - 0.5) * 0.58, az: (random() - 0.5) * 0.86,
      inPocket: false, impact: 0,
    };
  });
}

// For a solid sphere I = 2 m r² / 5. A tangential contact impulse also changes spin.
function spinFromContact(ball, nx, ny, nz, jx, jy, jz) {
  const factor = -2.5 / BALL_RADIUS;
  ball.wx = (ball.wx ?? 0) + factor * (ny * jz - nz * jy);
  ball.wy = (ball.wy ?? 0) + factor * (nz * jx - nx * jz);
  ball.wz = (ball.wz ?? 0) + factor * (nx * jy - ny * jx);
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
  left.impact = Math.max(left.impact ?? 0, -normalSpeed);
  const restitution = normalSpeed < -0.6 ? ballRestitution : 0;
  const impulse = -(1 + restitution) * normalSpeed / 2;
  left.vx -= impulse * nx;
  left.vy -= impulse * ny;
  left.vz -= impulse * nz;
  right.vx += impulse * nx;
  right.vy += impulse * ny;
  right.vz += impulse * nz;

  const wx = (left.wx ?? 0) + (right.wx ?? 0);
  const wy = (left.wy ?? 0) + (right.wy ?? 0);
  const wz = (left.wz ?? 0) + (right.wz ?? 0);
  const tx = right.vx - left.vx - (normalSpeed + 2 * impulse) * nx - BALL_RADIUS * (wy * nz - wz * ny);
  const ty = right.vy - left.vy - (normalSpeed + 2 * impulse) * ny - BALL_RADIUS * (wz * nx - wx * nz);
  const tz = right.vz - left.vz - (normalSpeed + 2 * impulse) * nz - BALL_RADIUS * (wx * ny - wy * nx);
  const slip = Math.hypot(tx, ty, tz);
  if (slip < 1e-9) return;
  const grip = Math.min(1 / 7, 0.22 * impulse / slip);
  const jx = -grip * tx;
  const jy = -grip * ty;
  const jz = -grip * tz;
  left.vx -= jx; left.vy -= jy; left.vz -= jz;
  right.vx += jx; right.vy += jy; right.vz += jz;
  spinFromContact(left, nx, ny, nz, jx, jy, jz);
  spinFromContact(right, nx, ny, nz, jx, jy, jz);
}

// Normal impulse against a fixed surface or a moving paddle, with bounded sliding friction.
function surfaceContact(ball, nx, ny, nz, depth, restitution, friction = 0.16, wallVX = 0, wallVY = 0, wallVZ = 0) {
  ball.x += nx * depth;
  ball.y += ny * depth;
  ball.z += nz * depth;
  const vx = ball.vx - wallVX;
  const vy = ball.vy - wallVY;
  const vz = ball.vz - wallVZ;
  const vn = vx * nx + vy * ny + vz * nz;
  if (vn >= 0) return;
  ball.impact = Math.max(ball.impact ?? 0, -vn);
  const impulse = -(1 + (vn < -1 ? restitution : 0)) * vn;
  const wx = ball.wx ?? 0;
  const wy = ball.wy ?? 0;
  const wz = ball.wz ?? 0;
  const tx = vx - vn * nx - BALL_RADIUS * (wy * nz - wz * ny);
  const ty = vy - vn * ny - BALL_RADIUS * (wz * nx - wx * nz);
  const tz = vz - vn * nz - BALL_RADIUS * (wx * ny - wy * nx);
  const slip = Math.hypot(tx, ty, tz);
  const grip = slip > 0 ? Math.min(2 / 7, friction * impulse / slip) : 0;
  ball.vx += nx * impulse - tx * grip;
  ball.vy += ny * impulse - ty * grip;
  ball.vz += nz * impulse - tz * grip;
  spinFromContact(ball, nx, ny, nz, -tx * grip, -ty * grip, -tz * grip);
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
        (height - ball.y) * normalY, 0.36, 0.07);
    }
    return false;
  }

  ball.inPocket = false;
  const distance = Math.hypot(radial, ball.y);
  if (distance > centerLimit) {
    surfaceContact(ball, -ball.x / distance, -ball.y / distance, -ball.z / distance,
      distance - centerLimit, 0.49, 0.09);
  }
  return false;
}

// Closest point on an open cylindrical sleeve, including its lower rim.
function contactFeedTube(ball, channel) {
  const dx = ball.x - channel.x;
  const dz = ball.z - channel.z;
  const radial = Math.hypot(dx, dz);
  const radialGap = radial - FEED_RADIUS;
  const dy = Math.min(0, ball.y - FEED_MOUTH_Y);
  const distance = Math.hypot(radialGap, dy);
  if (distance >= BALL_RADIUS || radial === 0 || distance === 0) return;
  const normal = radialGap / (distance * radial);
  surfaceContact(ball, dx * normal, dy / distance, dz * normal, BALL_RADIUS - distance, 0.28, 0.07);
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
        0.54, 0.30, -angularSpeed * pz, 0, angularSpeed * px);
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
  ball.wx *= 0.9992;
  ball.wy *= 0.9992;
  ball.wz *= 0.9992;
  ball.ax += ball.wx * TIME_STEP;
  ball.ay += ball.wy * TIME_STEP;
  ball.az += ball.wz * TIME_STEP;
}

function smooth(t) {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

function contactLift(ball, headY, headSpeed) {
  const clearance = 0.094 + BALL_RADIUS;
  const radial = Math.hypot(ball.x, ball.z);
  if (ball.y > headY + BALL_RADIUS || radial >= clearance) return;
  const topDepth = headY + BALL_RADIUS - ball.y;
  if (topDepth < clearance - radial) surfaceContact(ball, 0, 1, 0, topDepth, 0.25, 0.16, 0, headSpeed, 0);
  else if (radial > 0) {
    surfaceContact(ball, ball.x / radial, 0, ball.z / radial, clearance - radial, 0.28, 0.16, 0, headSpeed, 0);
  }
}

// Loose balls can enter the cup below the sleeve. Only the captured ball travels inside it.
function contactGuide(ball) {
  if (ball.y < GUIDE_BASE - BALL_RADIUS || ball.x * ball.x + ball.z * ball.z >= (GUIDE_RADIUS + BALL_RADIUS) ** 2) return;
  const radial = Math.hypot(ball.x, ball.z);
  const sideDepth = GUIDE_RADIUS + BALL_RADIUS - radial;
  const endDepth = ball.y - GUIDE_BASE + BALL_RADIUS;
  if (endDepth < sideDepth) surfaceContact(ball, 0, -1, 0, endDepth, 0.3);
  else surfaceContact(ball, radial ? ball.x / radial : 1, 0, radial ? ball.z / radial : 0, sideDepth, 0.32);
}

function randomMotorPhase() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000 * fullTurn;
}

export class DrawMachine {
  constructor(labels = BALL_NUMBERS, phase = randomMotorPhase()) {
    this.random = roundRandom(phase);
    this.balls = loadRack(labels, this.random);
    this.inFeed = this.balls.length;
    this.motorSpeeds = motorSpeeds.map(speed => speed * (0.90 + 0.20 * this.random()));
    this.angles = [phase, Math.PI + phase * 0.63];
    this.time = 0;
    this.power = 0;
    this.impact = 0;
    this.drawn = [];
    this.release = null;
    this.liftY = POCKET_Y - BALL_RADIUS;
    this.liftSpeed = 0;
    this.gateOpen = false;
    this.nextGate = Infinity;
    this.state = 'idle';
    this.parkedAt = 0;
  }

  start() {
    if (this.state !== 'idle') return;
    this.state = 'running';
  }

  get feedGate() {
    return smooth(this.time / feedOpenTime);
  }

  advance() {
    this.impact = 0;
    if (this.state === 'idle' || (this.state === 'complete' && this.time - this.parkedAt >= 2.4)) return;
    this.time += TIME_STEP;
    if (this.time < feedOpenTime) return;
    const running = this.state === 'running';
    this.power = running && this.inFeed === 0
      ? Math.min(1, this.power + TIME_STEP * 1.3)
      : Math.max(0, this.power - TIME_STEP * 2);
    this.gateOpen = running && !this.release && this.time >= this.nextGate;
    // A brief change of motor speed breaks persistent arches at the one-ball throat.
    const waiting = this.gateOpen ? Math.max(0, this.time - this.nextGate - 2.0) : 0;
    const drive = this.motorSpeeds.map((speed, i) => {
      const pulse = Math.sin(Math.min(waiting, 0.50) * Math.PI) * Math.sin(waiting * (2.9 + i));
      return speed * this.power * (1 - 0.79 * pulse);
    });
    const paddles = this.angles.map((angle, i) => {
      this.angles[i] = (angle + drive[i] * TIME_STEP) % fullTurn;
      return armPoints(i, this.angles[i]);
    });
    for (const ball of this.balls) {
      ball.impact = 0;
      integrate(ball);
      if (ball.feedLane !== null && ball.y + BALL_RADIUS <= FEED_MOUTH_Y) {
        ball.feedLane = null;
        this.inFeed--;
        if (this.inFeed === 0) this.nextGate = this.time + launchTime + this.random() * 1.6;
      }
    }

    let captured;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      for (let i = 0; i < this.balls.length; i += 1) {
        const ball = this.balls[i];
        for (let j = i + 1; j < this.balls.length; j += 1) collideBalls(ball, this.balls[j]);
        contactPaddle(ball, paddles[0], drive[0]);
        contactPaddle(ball, paddles[1], drive[1]);
        contactGuide(ball);
        if (this.release) contactLift(ball, this.liftY, this.liftSpeed);
      }
      for (const ball of this.balls) {
        if (ball.feedLane !== null) {
          contactFeedTube(ball, FEED_CHANNELS[ball.feedLane]);
          continue;
        }
        if (ball.y + BALL_RADIUS >= FEED_MOUTH_Y) {
          for (const channel of FEED_CHANNELS) contactFeedTube(ball, channel);
        }
        if (constrainToChamber(ball, this.gateOpen)) {
          captured = ball;
          this.gateOpen = false;
          break;
        }
      }
      if (captured) break;
    }
    for (const ball of this.balls) this.impact = Math.max(this.impact, ball.impact);
    if (captured) {
      this.balls.splice(this.balls.indexOf(captured), 1);
      this.release = { ball: captured, startedAt: this.time, angle: 0, omega: 0.42, phase: 'lift' };
    }
    if (this.release) {
      const previousY = this.liftY;
      const number = this.advanceRelease();
      this.liftSpeed = (this.liftY - previousY) / TIME_STEP;
      return number;
    }
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
    this.nextGate = this.time + parkTime + 0.40 * this.random();
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
