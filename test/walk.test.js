import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { walkingCamera } from '../src/walk.js';

test('looking turns in place, walking follows the gaze, and releasing the stick stops movement', () => {
  const canvas = new EventTarget();
  canvas.clientWidth = 650;
  canvas.setPointerCapture = () => {};
  const camera = new PerspectiveCamera();
  camera.position.set(0, 1.1, 7);
  camera.lookAt(0, 1.1, 0);
  const controls = walkingCamera(camera, canvas, () => {});
  controls.setEnabled(true);
  const start = camera.position.clone();
  const keys = new Set();
  const step = frames => { for (let n = 0; n < frames; n++) controls.update(1 / 60, keys); };
  const pointer = (type, x) => canvas.dispatchEvent(Object.assign(new Event(type), {
    clientX:x, clientY:150, button:0, pointerId:1,
  }));
  pointer('pointerdown', 80);
  pointer('pointermove', 400);
  pointer('pointerup', 400);
  step(60);
  assert.ok(camera.position.distanceTo(start) < 1e-8);
  assert.ok(camera.getWorldDirection(new Vector3()).x > 0.9);
  controls.setStick(0, 1);
  step(60);
  assert.ok(camera.position.x > 2.4);
  controls.setStick(0, 0);
  step(60);
  const stopped = camera.position.clone();
  step(60);
  assert.ok(camera.position.distanceTo(stopped) < 0.001);
  controls.setEnabled(false);
});

test('the walkthrough stops at the draw machine and inside the studio wall', () => {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0.4, 4);
  camera.lookAt(0, 0.4, 0);
  const controls = walkingCamera(camera, new EventTarget(), () => {});
  controls.sync();
  const move = code => {
    const keys = new Set([code,'ShiftLeft']);
    for (let n = 0; n < 360; n++) controls.update(1 / 60, keys);
  };
  move('KeyW');
  assert.ok(camera.position.z >= 2.10 && camera.position.z < 2.12);
  move('KeyS');
  assert.ok(camera.position.z <= 13.65 && camera.position.z > 13.6);
});

test('a held stick stops at a solid edge and can immediately slide or reverse', () => {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0.6, 11.8);
  camera.lookAt(0, 0.6, 0);
  const walk = walkingCamera(camera, new EventTarget(), () => {});
  walk.sync();
  const keys = new Set();
  const advance = () => walk.update(1 / 60, keys);
  walk.setStick(0, -1);
  for (let frame = 0; frame < 900; frame++) advance();
  assert.equal(advance(), true);
  const edgeZ = camera.position.z;
  walk.setStick(0, 1);
  assert.equal(advance(), false);
  assert.ok(camera.position.z < edgeZ);
  for (let frame = 0; frame < 500; frame++) advance();
  assert.equal(advance(), true);
  const besideMachine = camera.position.clone();
  walk.setStick(1, 1);
  for (let frame = 0; frame < 15; frame++) advance();
  assert.ok(camera.position.x > besideMachine.x + 0.25);
  assert.ok(Math.hypot(camera.position.x, camera.position.z) >= 2.10 - 1e-9);
});
