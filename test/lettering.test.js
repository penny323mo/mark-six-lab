import assert from 'node:assert/strict';
import test from 'node:test';
import { MARK_SIX, letteringSurface } from '../src/lettering.js';

test('both ends of MARK SIX follow the sign surface and read left to right', () => {
  assert.equal(MARK_SIX, 'MARK SIX');
  for (const [bottom, top, inside] of [[9.655, 9.655, true], [1.24, 1.30, false]]) {
    const geometry = letteringSurface(1.6, 0.29, bottom, top, inside);
    const { position, normal, uv } = geometry.attributes;
    const columns = position.count / 2;
    for (let i = 0; i < position.count; i++) {
      const row = i < columns ? 0 : 1;
      const radius = Math.hypot(position.getX(i), position.getZ(i));
      assert.ok(Math.abs(radius - (row ? top : bottom)) < 0.000001);
      assert.ok(normal.getZ(i) > 0);
      if (i % columns !== 0) {
        assert.ok(uv.getX(i) > uv.getX(i - 1));
        assert.ok(position.getX(i) > position.getX(i - 1));
      }
    }
    assert.equal(uv.getX(0), 0);
    assert.equal(uv.getX(columns - 1), 1);
  }
});
