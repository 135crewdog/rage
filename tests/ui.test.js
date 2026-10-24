import { test } from 'node:test';
import assert from 'node:assert/strict';
import { throttleFromPosition, positionFromThrottle } from '../src/ui/throttle.js';
import { MIL_THROTTLE } from '../src/sim/engine.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('the throttle has a detent at MIL: a gap to cross before afterburner', () => {
  assert.equal(throttleFromPosition(0), 0);
  near(throttleFromPosition(0.5), 0.5, 1e-12);
  near(throttleFromPosition(MIL_THROTTLE), MIL_THROTTLE, 1e-12);
  near(throttleFromPosition(MIL_THROTTLE + 0.03), MIL_THROTTLE, 1e-12);   // inside the gap: still MIL
  assert.ok(throttleFromPosition(MIL_THROTTLE + 0.07) > MIL_THROTTLE);  // past it: afterburner
  near(throttleFromPosition(1), 1, 1e-12);
  for (const t of [0, 0.3, MIL_THROTTLE, 0.8, 0.95, 1]) near(throttleFromPosition(positionFromThrottle(t)), t, 1e-12);
});
