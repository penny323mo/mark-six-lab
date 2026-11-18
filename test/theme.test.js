import assert from 'node:assert/strict';
import test from 'node:test';
import { backgroundTheme } from '../src/theme.js';

function setup(t, enabled = true) {
  globalThis.window = Object.assign(new EventTarget(), { setTimeout });
  globalThis.document = Object.assign(new EventTarget(), {
    createElement: () => ({}), head: { append() {} }, hidden: false,
  });
  t.after(() => { delete globalThis.window; delete globalThis.document; });
  const toggle = Object.assign(new EventTarget(), { checked: enabled });
  const hint = { hidden: true };
  const calls = [];
  const events = new Map();
  backgroundTheme({ firstElementChild: {}, querySelector: () => null }, toggle, hint);
  window.onSpotifyIframeApiReady({ createController(_mount, _options, connect) {
    connect({
      addListener: (name, listener) => events.set(name, listener),
      resume: () => calls.push('resume'), play: () => calls.push('replay'), pause: () => calls.push('pause'),
    });
  } });
  events.get('ready')();
  return {
    calls, hint,
    progress(position, { paused = false, duration = 29713, buffering = false } = {}) {
      events.get('playback_update')({ data: { isPaused: paused, isBuffering: buffering, position, duration } });
    },
    enable(checked) {
      toggle.checked = checked;
      toggle.dispatchEvent(new Event('change'));
    },
  };
}

test('starts on page entry, retries a blocked start on a gesture, and respects a manual pause', t => {
  const { calls, hint, progress } = setup(t);
  assert.deepEqual(calls, ['resume']);
  progress(0, { paused: true });
  assert.equal(hint.hidden, false);
  document.dispatchEvent(new Event('click'));
  progress(840);
  assert.equal(hint.hidden, true);
  document.dispatchEvent(new Event('keydown'));
  progress(4500, { paused: true });
  document.dispatchEvent(new Event('click'));
  assert.deepEqual(calls, ['resume', 'resume']);
});

test('replays each natural end once, including duplicated unpaused ends and a reset to zero', t => {
  const { calls, progress } = setup(t);
  progress(1800);
  progress(29713);
  progress(29713);
  progress(0, { buffering: true });
  progress(920);
  progress(29000);
  progress(0, { paused: true });
  progress(0, { paused: true });
  progress(900);
  progress(29713, { paused: true });
  assert.deepEqual(calls, ['resume', 'replay', 'replay', 'replay']);
});

test('a saved opt-out stays quiet, including late starts and the end of the preview', t => {
  const { calls, enable, progress } = setup(t, false);
  document.dispatchEvent(new Event('click'));
  assert.deepEqual(calls, []);
  enable(true);
  enable(false);
  progress(0);
  progress(0, { paused: true });
  progress(29713, { paused: true });
  document.dispatchEvent(new Event('click'));
  assert.deepEqual(calls, ['resume', 'pause']);
  enable(true);
  progress(1400);
  enable(false);
  assert.deepEqual(calls, ['resume', 'pause', 'resume', 'pause']);
});

test('switching off while a loop restart is in flight silences the delayed start', t => {
  const { calls, enable, progress } = setup(t);
  progress(28600);
  progress(29713);
  enable(false);
  progress(0);
  progress(0, { paused: true });
  document.dispatchEvent(new Event('click'));
  assert.deepEqual(calls, ['resume', 'replay', 'pause']);
});

test('returns to an interrupted stream when the tab becomes visible again', t => {
  const { calls, progress } = setup(t);
  progress(7500);
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  progress(8200, { paused: true });
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(calls, ['resume', 'resume']);
});
