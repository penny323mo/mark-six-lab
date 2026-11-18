import assert from 'node:assert/strict';
import test from 'node:test';
import { drawTheme } from '../src/theme.js';

test('a quick reset cannot seek or pause an unloaded track, and a later round restarts it', t => {
  globalThis.window = { setTimeout };
  globalThis.document = Object.assign(new EventTarget(), {
    createElement: () => ({}), head: { append() {} }, hidden: false,
  });
  t.after(() => { delete globalThis.window; delete globalThis.document; });
  const follow = Object.assign(new EventTarget(), { checked: true });
  const container = { firstElementChild: {}, querySelector: () => null };
  const theme = drawTheme(container, follow);
  const calls = [];
  const events = new Map();
  window.onSpotifyIframeApiReady({ createController(_target, _options, create) {
    create({
      addListener: (event, fn) => events.set(event, fn),
      resume: () => calls.push('resume'), pause: () => calls.push('pause'), seek: n => calls.push(n),
    });
  } });
  events.get('ready')();
  theme.begin();
  theme.end();
  assert.deepEqual(calls, ['resume']);
  events.get('playback_started')();
  assert.deepEqual(calls, ['resume','pause']);
  events.get('playback_update')({ data: { isPaused: true } });
  theme.begin();
  events.get('playback_started')();
  assert.deepEqual(calls, ['resume','pause','resume',0]);
});
