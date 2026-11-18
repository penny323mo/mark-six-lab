import { BALL_COUNT, DRAW_COUNT, shuffledNumbers } from './rules.js';

export const TIME_STEP = 1 / 120;
export const CHAMBER_RADIUS = 1.8;
export const BALL_RADIUS = 0.137;
export const GATE_RADIUS = 0.266;
export const GATE_EXIT = CHAMBER_RADIUS + 0.36;

const axis = [0.55, 0.81, 0.20];
const axisLength = Math.hypot(...axis);
export const GATE_AXIS = Object.freeze(axis.map(value => value / axisLength));

const [gateX, gateY, gateZ] = GATE_AXIS;
const centerLimit = CHAMBER_RADIUS - BALL_RADIUS;
const gateClearance = GATE_RADIUS - BALL_RADIUS;
const throatStart = Math.sqrt(centerLimit ** 2 - gateClearance ** 2);
const minimumDistance = 2 * BALL_RADIUS;
const gravity = 9.81;
const ballRestitution = 0.73;
const wallRestitution = 0.64;
const launchTime = 1.25;
const releaseTime = 1.03;
const parkTime = 0.38;
const maxGateTime = 18;

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
          inCollar: false,
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

export function constrainToChamber(ball, gateOpen) {
  const { x, y, z } = ball;
  const radiusSquared = x * x + y * y + z * z;
  if (radiusSquared <= centerLimit * centerLimit) {
    ball.inCollar = false;
    return false;
  }

  const axial = x * gateX + y * gateY + z * gateZ;
  const lateralSquared = Math.max(0, radiusSquared - axial * axial);
  const throughMouth = gateOpen && lateralSquared <= gateClearance ** 2;
  if (axial >= throatStart && (throughMouth || ball.inCollar)) {
    ball.inCollar = true;
    if (lateralSquared > gateClearance ** 2) {
      const lateral = Math.sqrt(lateralSquared);
      const nx = (x - axial * gateX) / lateral;
      const ny = (y - axial * gateY) / lateral;
      const nz = (z - axial * gateZ) / lateral;
      ball.x = axial * gateX + gateClearance * nx;
      ball.y = axial * gateY + gateClearance * ny;
      ball.z = axial * gateZ + gateClearance * nz;
      const normalSpeed = ball.vx * nx + ball.vy * ny + ball.vz * nz;
      const impulse = Math.max(0, normalSpeed) * 1.24;
      ball.vx -= impulse * nx;
      ball.vy -= impulse * ny;
      ball.vz -= impulse * nz;
    }

    const outwardSpeed = ball.vx * gateX + ball.vy * gateY + ball.vz * gateZ;
    if (gateOpen) return axial >= GATE_EXIT && outwardSpeed > 0;

    // The closed outlet acts as a plane at the end of the neck. A ball still
    // in the neck can roll back down without being moved through the shell.
    const overlap = axial + BALL_RADIUS - GATE_EXIT;
    if (overlap > 0) {
      ball.x -= overlap * gateX;
      ball.y -= overlap * gateY;
      ball.z -= overlap * gateZ;
      const impulse = Math.max(0, outwardSpeed) * 1.45;
      ball.vx -= impulse * gateX;
      ball.vy -= impulse * gateY;
      ball.vz -= impulse * gateZ;
    }
    return false;
  }

  ball.inCollar = false;
  const distance = Math.sqrt(radiusSquared);
  const nx = x / distance;
  const ny = y / distance;
  const nz = z / distance;
  ball.x = nx * centerLimit;
  ball.y = ny * centerLimit;
  ball.z = nz * centerLimit;
  const normalSpeed = ball.vx * nx + ball.vy * ny + ball.vz * nz;
  if (normalSpeed <= 0) return false;
  const restitution = normalSpeed > 0.65 ? wallRestitution : 0;
  const impulse = (1 + restitution) * normalSpeed;
  ball.vx = (ball.vx - impulse * nx) * 0.97;
  ball.vy = (ball.vy - impulse * ny) * 0.97;
  ball.vz = (ball.vz - impulse * nz) * 0.97;
  return false;
}

function applyAirflow(ball, time, power, gateAge, phase) {
  const { x, y, z, vx, vy, vz } = ball;
  const nozzle = Math.exp(-(x * x + z * z) * 0.85);
  const lift = (2.9 + 24 * nozzle) * (0.82 - y * 0.19);
  const swirl = 5.1 + Math.sin(time * 1.8 + phase) * 2.15;
  let ax = power * (-z * swirl - x * 1.12 + 4.6 * Math.sin(time * 2.5 + y * 2.6 + z + phase));
  let ay = -gravity + power * (lift + 4.0 * Math.sin(time * 2.8 + x * 3 - z * 1.5 + phase));
  let az = power * (x * swirl - z * 1.12 + 4.6 * Math.cos(time * 2.1 + y * 2 + x + phase));

  if (gateAge >= 0) {
    const axial = x * gateX + y * gateY + z * gateZ;
    const lateralX = x - axial * gateX;
    const lateralY = y - axial * gateY;
    const lateralZ = z - axial * gateZ;
    const lateralSquared = lateralX ** 2 + lateralY ** 2 + lateralZ ** 2;
    const axialGap = GATE_EXIT - axial;
    const reach = 0.62 + Math.min(gateAge * 0.21, 1.3);
    const influence = Math.exp(-(axialGap ** 2 + lateralSquared) / (reach * reach));
    const pull = (31 + Math.min(gateAge * 7, 52)) * influence;
    const centering = 102 * influence;
    const axialSpeed = vx * gateX + vy * gateY + vz * gateZ;
    const damping = 16 * influence;
    ax += pull * gateX - centering * lateralX - damping * (vx - axialSpeed * gateX);
    ay += pull * gateY - centering * lateralY - damping * (vy - axialSpeed * gateY);
    az += pull * gateZ - centering * lateralZ - damping * (vz - axialSpeed * gateZ);
  } else if (ball.inCollar) {
    // The blower does not feed the neck while the outlet is closed.
    ax = 0;
    ay = -gravity;
    az = 0;
  }

  const drag = power > 0 ? 0.984 : 0.98;
  ball.vx = drag * vx + ax * TIME_STEP;
  ball.vy = drag * vy + ay * TIME_STEP;
  ball.vz = drag * vz + az * TIME_STEP;
  const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
  const scale = speed > 10 ? 10 / speed : 1;
  ball.vx *= scale;
  ball.vy *= scale;
  ball.vz *= scale;
  ball.x += ball.vx * TIME_STEP;
  ball.y += ball.vy * TIME_STEP;
  ball.z += ball.vz * TIME_STEP;
  ball.ax += ball.vz * TIME_STEP / BALL_RADIUS * 0.65;
  ball.ay += ball.vx * TIME_STEP / BALL_RADIUS * 0.35;
  ball.az -= ball.vx * TIME_STEP / BALL_RADIUS * 0.65;
}

export class DrawMachine {
  constructor(labels = shuffledNumbers(), phase = 0) {
    // Labels are assigned independently of airflow, initial positions and contact order.
    this.balls = spawnBalls(labels);
    this.phase = phase;
    this.time = 0;
    this.power = 0;
    this.drawn = [];
    this.release = null;
    this.gateOpen = false;
    this.nextGate = launchTime;
    this.state = 'idle';
    this.parkedAt = 0;
  }

  start() {
    if (this.state !== 'idle') return;
    this.nextGate = this.time + launchTime;
    this.state = 'running';
  }

  advance() {
    if (this.state === 'idle' && this.time >= 2.8) return;
    if ((this.state === 'complete' || this.state === 'stalled') && this.time >= this.parkedAt + 2.8) return;
    this.time += TIME_STEP;
    const running = this.state === 'running';
    this.power = running ? Math.min(1, this.power + 1.9 * TIME_STEP) : Math.max(0, this.power - 1.5 * TIME_STEP);
    this.gateOpen = running && !this.release && this.time >= this.nextGate;
    const gateAge = this.gateOpen ? this.time - this.nextGate : -1;

    for (const ball of this.balls) applyAirflow(ball, this.time, this.power, gateAge, this.phase);

    for (let iteration = 0; iteration < 4; iteration += 1) {
      for (let left = 0; left < this.balls.length; left += 1) {
        for (let right = left + 1; right < this.balls.length; right += 1) {
          collideBalls(this.balls[left], this.balls[right]);
        }
      }
      for (let index = 0; index < this.balls.length; index += 1) {
        const ball = this.balls[index];
        if (constrainToChamber(ball, this.gateOpen)) {
          this.release = { ball, startedAt: this.time };
          this.balls.splice(index, 1);
          this.gateOpen = false;
          index -= 1;
        }
      }
    }

    if (this.release && this.time - this.release.startedAt >= releaseTime) {
      const { ball } = this.release;
      this.drawn.push(ball.number);
      this.release = null;
      this.nextGate = this.time + parkTime;
      if (this.drawn.length === DRAW_COUNT) {
        this.state = 'complete';
        this.parkedAt = this.time;
      }
      return ball.number;
    }

    if (this.gateOpen && gateAge > maxGateTime) {
      this.state = 'stalled';
      this.parkedAt = this.time;
      this.gateOpen = false;
    }
  }

  get travel() {
    return this.release ? Math.min(1, (this.time - this.release.startedAt) / releaseTime) : 0;
  }
}
