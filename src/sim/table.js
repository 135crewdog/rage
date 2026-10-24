// Piecewise-linear table lookup with linear extrapolation from the end
// segment, which is what the book's fix() and 1.1*sign() trick does.
// Breakpoints must be evenly spaced and ascending.

// Index of the segment that x falls in, and the fraction along it.
// Outside the breakpoints the end segment is extended, so the fraction
// can be below 0 or above 1.
function locate(points, x) {
  const n = points.length;
  const step = points[1] - points[0];
  let i = Math.floor((x - points[0]) / step);
  if (i < 0) i = 0;
  if (i > n - 2) i = n - 2;
  return { i, f: (x - points[i]) / step };
}

// values[k] at points[k]
export function interp1(points, values, x) {
  const { i, f } = locate(points, x);
  return values[i] + (values[i + 1] - values[i]) * f;
}

// values[row][col] with rows at rowPoints and columns at colPoints
export function interp2(rowPoints, colPoints, values, row, col) {
  const r = locate(rowPoints, row);
  const c = locate(colPoints, col);
  const v0 = values[r.i][c.i] + (values[r.i][c.i + 1] - values[r.i][c.i]) * c.f;
  const v1 = values[r.i + 1][c.i] + (values[r.i + 1][c.i + 1] - values[r.i + 1][c.i]) * c.f;
  return v0 + (v1 - v0) * r.f;
}
