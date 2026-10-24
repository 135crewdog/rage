// docs/flight-model.md 12.2: the FCS behaves like an F-16. Each check flies
// the full simulation (FCS, actuators, engine) from a trimmed air start and
// prints what it measured.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS } from './checks.js';

for (const check of CHECKS) {
  test(check.name, () => {
    const r = check();
    console.log(`  ${r.name}: ${r.text}`);
    assert.ok(r.pass, `${r.name}: ${r.text}`);
  });
}
