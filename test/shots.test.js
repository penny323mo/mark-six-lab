import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { DrawMachine, FEED_TOP_Y } from '../src/physics.js';
import { shotFraming, studioCamera } from '../src/camera.js';

test('idle overhead shows rack, globe and pedestal beneath the ceiling in both orientations', () => {
  for (const [width,height] of [[350,690],[760,320]]) {
    const nav = studioCamera(new EventTarget());
    nav.setView('overhead');
    nav.resize(width,height);
    nav.update(new DrawMachine(undefined,1));
    nav.camera.updateMatrixWorld();
    assert.ok(nav.camera.position.y < 6.65);
    for (const [x,y,z] of [[-.86,FEED_TOP_Y,-.66],[.86,FEED_TOP_Y,-.66],[-2,0,0],[2,0,0],[0,-3.12,0]]) {
      const screen = new Vector3(x,y,z).project(nav.camera);
      assert.ok(Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1 && Math.abs(screen.z) < 1);
    }
  }
});

test('the close camera returns to the bowl between balls and follows every moving rail ball', () => {
  const machine = new DrawMachine(undefined,0.68);
  machine.start();
  const tracked = new Set(), wideAfter = new Set();
  while (machine.state === 'running' && machine.time < 60) {
    machine.advance();
    const shot = shotFraming(machine,'close');
    if (machine.release?.phase === 'rail') {
      assert.ok(Math.abs(shot.target.x - machine.carriedPosition.x * .81) < 0.001);
      tracked.add(machine.release.ball.number);
    } else if (!machine.release && machine.state === 'running' && !machine.inFeed) {
      assert.equal(shot.target.x, 0);
      assert.ok(shot.distance >= 7);
      wideAfter.add(machine.drawn.length);
    }
  }
  assert.equal(tracked.size,7);
  assert.deepEqual([...wideAfter],[0,1,2,3,4,5,6]);
  for (let i=0;i<200;i++) machine.advance();
  assert.ok(shotFraming(machine,'close').distance >= 7);
});
