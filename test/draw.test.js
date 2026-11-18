import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BALL_RADIUS, CHAMBER_RADIUS, DrawMachine, POCKET_RADIUS, POCKET_Y, TRACK_RADIUS, TIME_STEP, railPosition,
  FEED_CHANNELS, FEED_MOUTH_Y, FEED_RADIUS, FEED_ROWS, FEED_SHELF_Y, FEED_TOP_Y,
  collideBalls, constrainToChamber,
} from '../src/physics.js';
import { BALL_NUMBERS, autoPick, matchEntry, resultOrder, validNumbers } from '../src/rules.js';

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

test('sorts only the six main numbers of a completed draw and preserves the raw draw', () => {
  const live = Object.freeze([41, 3, 25, 19, 7, 48]);
  const complete = Object.freeze([...live, 2]);
  assert.deepEqual(resultOrder(live), [41, 3, 25, 19, 7, 48]);
  assert.deepEqual(resultOrder(complete), [3, 7, 19, 25, 41, 48, 2]);
  assert.deepEqual(complete, [...live, 2]);
});

test('all 49 balls stay on the shelf until release and drop continuously through five guides before mixing', () => {
  const machine = new DrawMachine(undefined, 1.05);
  const initial = machine.balls.map(b => [b.x,b.y,b.z]);
  for (let i = 0; i < 600; i++) machine.advance();
  assert.equal(machine.inFeed, 49);
  assert.equal(machine.feedGate, 0);
  assert.deepEqual(machine.balls.map(b => [b.x,b.y,b.z]), initial);
  for (const [lane, channel] of FEED_CHANNELS.entries()) {
    const column = machine.balls.filter(ball => ball.feedLane === lane);
    assert.deepEqual(column.map(ball => ball.number), BALL_NUMBERS.slice(lane * FEED_ROWS, (lane + 1) * FEED_ROWS));
    for (const ball of column) {
      assert.ok(ball.y - BALL_RADIUS >= FEED_SHELF_Y - 1e-8 && ball.y + BALL_RADIUS <= FEED_TOP_Y);
      assert.ok(Math.hypot(ball.x - channel.x, ball.z - channel.z) <= FEED_RADIUS - BALL_RADIUS);
    }
  }

  machine.start();
  machine.advance();
  assert.ok(machine.feedGate > 0 && machine.feedGate < 1);
  assert.deepEqual(machine.balls.map(b => [b.x,b.y,b.z]), initial);
  let mixedLocations = false;
  const originalFirst = machine.balls[0];
  let droppedBelowShelf = false;
  for (let tick = 0; tick < 3 / TIME_STEP && machine.inFeed > 0; tick++) {
    const lastY = originalFirst.y;
    machine.advance();
    assert.equal(machine.drawn.length, 0);
    assert.equal(machine.release, null);
    assert.equal(machine.gateOpen, false);
    assert.equal(machine.power, 0);
    if (originalFirst.y < FEED_SHELF_Y && originalFirst.feedLane !== null) {
      assert.ok(originalFirst.y < lastY && originalFirst.vy < 0);
      droppedBelowShelf = true;
    }
    mixedLocations ||= machine.inFeed > 0 && machine.inFeed < 49;
  }
  assert.ok(droppedBelowShelf && mixedLocations);
  assert.equal(machine.inFeed, 0);
  assert.equal(machine.balls.length, 49);
  assert.ok(machine.balls.every(ball => ball.feedLane === null));
  assert.ok(machine.nextGate > machine.time && originalFirst.y < FEED_MOUTH_Y);
  machine.advance();
  assert.ok(machine.power > 0);
});

test('conserves momentum, loses impact energy and transfers oblique slip into spin', () => {
  const left = { x: 0, y: 0, z: 0, vx: 1, vy: 0.2, vz: 0 };
  const right = { x: BALL_RADIUS * 1.99, y: 0, z: 0, vx: -1, vy: -0.1, vz: 0 };
  collideBalls(left, right);
  assert.ok(Math.abs(left.vx + right.vx) < 1e-9);
  assert.ok(Math.abs(right.vx - left.vx - 1.26) < 1e-9);
  assert.ok(Math.abs(left.vy + right.vy - 0.1) < 1e-9);
  assert.ok(left.vy < 0.2 && right.vy > -0.1);
  assert.ok(left.wz < 0 && right.wz === left.wz);
  const energy = b => (b.vx ** 2 + b.vy ** 2 + b.vz ** 2) / 2
    + BALL_RADIUS ** 2 * (b.wx ** 2 + b.wy ** 2 + b.wz ** 2) / 5;
  assert.ok(energy(left) + energy(right) < (2 + 0.2 ** 2 + 0.1 ** 2) / 2);
});

test('only a downward crossing inside the open bottom pocket can release a ball', () => {
  const probe = (x, y, vy) => ({ x, y, z: 0, vx: 0, vy, vz: 0, inPocket: false });
  const closed = probe(0, POCKET_Y - 0.02, -1);
  assert.equal(constrainToChamber(closed, false), false);
  assert.ok(closed.y > POCKET_Y);
  assert.equal(constrainToChamber(probe(0, POCKET_Y + 0.02, -1), true), false);
  assert.equal(constrainToChamber(probe(0, POCKET_Y - 0.01, 1), true), false);
  assert.equal(constrainToChamber(probe(POCKET_RADIUS, POCKET_Y - 0.01, -1), true), false);
  assert.equal(constrainToChamber(probe(0, POCKET_Y - 0.01, -1), true), true);
  const side = probe(CHAMBER_RADIUS + 0.20, 0, -1);
  assert.equal(constrainToChamber(side, true), false);
  assert.ok(Math.abs(side.x - (CHAMBER_RADIUS-BALL_RADIUS)) < 1e-7);
});

test('piston rises to the crown and both rails hold their balls at distinct positions', () => {
  const m = new DrawMachine(BALL_NUMBERS, 0.62);
  m.start();
  let count = 0;
  let lastHeight = POCKET_Y - 0.05;
  let lastPhase = '';
  for (let tick = 0; m.state === 'running' && tick < 60/TIME_STEP; tick++) {
    m.advance();
    if (!m.release) {
      lastHeight = POCKET_Y - 0.05;
      lastPhase = '';
      continue;
    }
    const p = m.carriedPosition;
    if (m.release.phase === 'lift') {
      assert.ok(p.y >= lastHeight - 1e-6);
      lastHeight = p.y;
    } else {
      if (lastPhase === 'lift') {
        assert.ok(Math.abs(lastHeight - TRACK_RADIUS) < 0.01);
        count++;
      }
      assert.ok(Math.abs(Math.hypot(p.x, p.y) - TRACK_RADIUS) < 1e-8);
      assert.ok(m.drawn.length === 6 ? p.x >= 0 : p.x <= 0);
    }
    lastPhase = m.release.phase;
  }
  assert.equal(count, 7);
  for (let i=1; i<6; i++) {
    const a=railPosition(i-1), b=railPosition(i);
    assert.ok(Math.hypot(a.x-b.x, a.y-b.y) >= 2*BALL_RADIUS);
  }
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

test('draws seven distinct balls through the same outlet over varied motor phases and rest times', () => {
  for (let phase = 0; phase < 32; phase += 1) {
    simulate(phase * Math.PI / 16, BALL_NUMBERS, phase * 19);
  }
});

test('printed numbers have no effect on the physical order in which balls exit', () => {
  const reversed = [...BALL_NUMBERS].reverse();
  const original = simulate(1.25);
  assert.deepEqual(simulate(1.25, reversed), original.map(number => reversed[number - 1]));
});
