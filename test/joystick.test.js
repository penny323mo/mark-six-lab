import assert from 'node:assert/strict';
import test from 'node:test';
import { bindWalkStick } from '../src/joystick.js';

function setup(touchMode = true) {
  const win = new EventTarget();
  if (touchMode) win.ontouchstart = null;
  const doc = Object.assign(new EventTarget(), { defaultView: win, hidden: false });
  const stick = Object.assign(new EventTarget(), {
    ownerDocument: doc, style: { setProperty() {} }, contains: node => node === stick,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setPointerCapture() { throw new Error('Pointer is outside the capture surface'); },
  });
  let position = [0, 0];
  bindWalkStick(stick, (x, y) => { position = [x, y]; });
  const dispatch = (target, name, data) => target.dispatchEvent(Object.assign(new Event(name), data));
  return {
    win, doc, stick,
    pos: () => position,
    finger: (identifier, x, y, target = stick) => ({ identifier, clientX: x, clientY: y, target }),
    touch: (type, touches, changedTouches) => dispatch(win, type, { touches, changedTouches }),
    pointer: (target, type, id, x, buttons = 1) => dispatch(target, type, {
      pointerId: id, pointerType: 'mouse', isPrimary: true, button: 0, buttons, clientX: x, clientY: 50,
    }),
  };
}

test('a fresh thumb immediately reverses the stick after a missed release', () => {
  const pad = setup();
  const first = pad.finger(1, 75, 74);
  pad.touch('touchstart', [first], [first]);
  assert.ok(pad.pos()[0] > 0 && pad.pos()[1] < 0);
  const next = pad.finger(8, 20, 25);
  pad.touch('touchstart', [next], [next]);
  assert.ok(pad.pos()[0] < 0 && pad.pos()[1] > 0);
  pad.touch('touchend', [], [next]);
  assert.deepEqual(pad.pos(), [0, 0]);
});

test('the look finger can lift or cancel independently, including when its ID is reused', () => {
  const pad = setup();
  const thumb = pad.finger(4, 83, 50);
  const look = pad.finger(7, 190, 100, {});
  pad.touch('touchstart', [look], [look]);
  pad.touch('touchstart', [look, thumb], [thumb]);
  const moving = pad.pos();
  pad.touch('touchcancel', [thumb], [look]);
  assert.deepEqual(pad.pos(), moving);
  const reused = pad.finger(4, 190, 100, {});
  pad.touch('touchstart', [reused], [reused]);
  assert.deepEqual(pad.pos(), [0, 0]);
  const fresh = pad.finger(9, 17, 50);
  pad.touch('touchstart', [reused, fresh], [fresh]);
  pad.touch('touchend', [reused], [fresh]);
  assert.deepEqual(pad.pos(), [0, 0]);
});

test('an uncaptured pointer keeps steering outside the pad and a new press can recover it', () => {
  const pad = setup(false);
  pad.pointer(pad.stick, 'pointerdown', 1, 83);
  pad.pointer(pad.win, 'pointermove', 1, 145);
  assert.ok(pad.pos()[0] > 0.99);
  pad.pointer(pad.stick, 'pointerdown', 2, 10);
  assert.ok(pad.pos()[0] < -0.99);
  pad.pointer(pad.win, 'pointerup', 1, 145, 0);
  assert.ok(pad.pos()[0] < -0.99);
  pad.pointer(pad.win, 'pointerup', 2, 10, 0);
  assert.deepEqual(pad.pos(), [0, 0]);
});

test('hiding or leaving the page centres the stick without an end event', () => {
  const pad = setup();
  const thumb = pad.finger(2, 50, 17);
  pad.touch('touchstart', [thumb], [thumb]);
  pad.doc.hidden = true;
  pad.doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(pad.pos(), [0, 0]);
  pad.doc.hidden = false;
  pad.touch('touchstart', [thumb], [thumb]);
  assert.ok(pad.pos()[1] > 0.99);
  pad.win.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(pad.pos(), [0, 0]);
});
