import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interp1, interp2 } from '../src/sim/table.js';

const pts = [0, 10, 20, 30];
const vals = [1, 3, 2, 6];

test('1-D lookup returns the cell at a breakpoint', () => {
  for (let k = 0; k < pts.length; k++) assert.equal(interp1(pts, vals, pts[k]), vals[k]);
});

test('1-D lookup is linear between breakpoints', () => {
  assert.ok(Math.abs(interp1(pts, vals, 5) - 2) < 1e-12);
  assert.ok(Math.abs(interp1(pts, vals, 22.5) - 3) < 1e-12);
});

test('1-D lookup extrapolates the end segment, not clamps', () => {
  // first segment slope 0.2/unit; last segment slope 0.4/unit
  assert.ok(Math.abs(interp1(pts, vals, -10) - (-1)) < 1e-12);
  assert.ok(Math.abs(interp1(pts, vals, 40) - 10) < 1e-12);
});

test('2-D lookup returns cells at breakpoints and is bilinear between them', () => {
  const rows = [0, 1];
  const cols = [0, 2, 4];
  const t = [
    [0, 2, 4],
    [10, 12, 14],
  ];
  assert.equal(interp2(rows, cols, t, 1, 2), 12);
  assert.ok(Math.abs(interp2(rows, cols, t, 0.5, 1) - 6) < 1e-12);
  // extrapolation in both directions
  assert.ok(Math.abs(interp2(rows, cols, t, 2, 6) - 26) < 1e-12);
  assert.ok(Math.abs(interp2(rows, cols, t, -1, -2) - (-12)) < 1e-12);
});
