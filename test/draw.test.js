import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BALL_RADIUS, CHAMBER_RADIUS, DrawMachine, GATE_AXIS, GATE_EXIT, TIME_STEP,
  collideBalls, constrainToChamber,
} from '../src/physics.js';
import { BALL_NUMBERS, autoPick, matchEntry, validNumbers } from '../src/rules.js';

test('applies all seven official prize divisions and requires a six-number entry', () => {
  const draw = [31, 4, 42, 5, 12, 6, 7];
  const cases = [
    [[4, 5, 6, 12, 31, 42], [6, false, '頭獎']],
    [[4, 5, 6, 7, 12, 31], [5, true, '二獎']],
    [[4, 5, 6, 12, 31, 49], [5, false, '三獎']],
    [[4, 5, 6, 7, 12, 49], [4, true, '四獎']],
    [[4, 5, 6, 12, 48, 49], [4, false, '五獎']],
    [[4, 5, 6, 7, 48, 49], [3, true, '六獎']],
    [[4, 5, 6, 47, 48, 49], [3, false, '七獎']],
    [[4, 5, 7, 47, 48, 49], [2, true, null]],
  ];
  for (const [entry, [main, extra, prize]] of cases) {
    assert.deepEqual(matchEntry(entry, draw), { main, extra, prize });
  }
  assert.equal(matchEntry([4, 4, 6, 12, 31, 42], draw), null);
  assert.equal(matchEntry([4, 5, 6, 12, 31, 50], draw), null);
  assert.equal(matchEntry(draw.slice(0, 6), draw.slice(0, 6)), null);
  assert.ok(validNumbers(autoPick(), 6));
});

test('conserves momentum along an equal-mass contact with restitution', () => {
  const left = { x: 0, y: 0, z: 0, vx: 1, vy: 0.2, vz: 0 };
  const right = { x: BALL_RADIUS * 1.99, y: 0, z: 0, vx: -1, vy: -0.1, vz: 0 };
  collideBalls(left, right);
  assert.ok(Math.abs(left.vx + right.vx) < 1e-9);
  assert.ok(Math.abs(right.vx - left.vx - 1.46) < 1e-9);
  assert.equal(left.vy, 0.2);
  assert.equal(right.vy, -0.1);
});

test('rejects exits through the shell and permits outward transit at the open outlet', () => {
  const makeProbe = (distance, direction = 1) => {
    const [x, y, z] = GATE_AXIS.map(component => distance * component * direction);
    const [vx, vy, vz] = GATE_AXIS.map(component => 2 * component * direction);
    return { x, y, z, vx, vy, vz, inCollar: false };
  };
  const wallLimit = CHAMBER_RADIUS - BALL_RADIUS;
  const closed = makeProbe(GATE_EXIT + 0.01);
  assert.equal(constrainToChamber(closed, false), false);
  assert.ok(Math.abs(Math.hypot(closed.x, closed.y, closed.z) - wallLimit) < 1e-9);
  assert.equal(constrainToChamber(makeProbe(GATE_EXIT - 0.01), true), false);
  assert.equal(constrainToChamber(makeProbe(GATE_EXIT + 0.01, -1), true), false);
  assert.equal(constrainToChamber(makeProbe(GATE_EXIT + 0.01), true), true);
});

function simulate(phase, labels = BALL_NUMBERS, idleSteps = 150) {
  const machine = new DrawMachine(labels, phase);
  for (let tick = 0; tick < idleSteps; tick += 1) machine.advance();
  assert.equal(machine.balls.length, 49);
  machine.start();
  const exits = [];
  for (let tick = 0; machine.state === 'running' && tick < 60 / TIME_STEP; tick += 1) {
    const previous = machine.release;
    machine.advance();
    if (!previous && machine.release) exits.push(machine.release.ball.number);
  }
  assert.equal(machine.state, 'complete');
  assert.ok(validNumbers(machine.drawn, 7));
  assert.equal(machine.balls.length, 42);
  assert.deepEqual(machine.drawn, exits);
  return machine.drawn;
}

test('draws seven distinct balls through the same outlet over varied airflow and rest times', () => {
  for (let phase = 0; phase < 32; phase += 1) {
    simulate(phase * Math.PI / 16, BALL_NUMBERS, phase * 19);
  }
});

test('printed numbers have no effect on the physical order in which balls exit', () => {
  const reversed = [...BALL_NUMBERS].reverse();
  const original = simulate(1.25);
  assert.deepEqual(simulate(1.25, reversed), original.map(number => reversed[number - 1]));
});
