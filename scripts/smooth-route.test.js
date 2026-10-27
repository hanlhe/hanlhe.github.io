const assert = require("node:assert/strict");
const test = require("node:test");
const smoothRoute = require("./smooth-route");

const near = (a, b) =>
  a.every((value, axis) => Math.abs(value - b[axis]) < 1e-12);

test("empty, short, and stationary tracks stay finite and preserve endpoints", () => {
  for (const points of [
    [],
    [[37, -122]],
    [
      [37, -122],
      [37.001, -122],
    ],
    Array.from({ length: 7 }, () => [37, -122]),
    [
      [0, 0],
      [0, 0],
      [0, 0.001],
      [0, 0.001],
    ],
  ]) {
    const result = smoothRoute(points);
    assert(result.flat().every(Number.isFinite));
    assert.deepEqual(result[0], points[0]);
    assert.deepEqual(result.at(-1), points.at(-1));
    assert(result.length <= Math.max(0, 1 + 8 * (points.length - 1)));
  }
});

test("Savitzky-Golay attenuates a spike and keeps every filtered anchor", () => {
  const points = Array.from({ length: 7 }, (_, index) => [
    index === 3 ? 0.00001 : 0,
    index * 0.0001,
    100,
  ]);
  const original = structuredClone(points);
  const result = smoothRoute(points);
  for (let index = 0; index < points.length; index += 1) {
    const latitude =
      index === 3
        ? (17 * 0.00001) / 35
        : index === 2 || index === 4
          ? (12 * 0.00001) / 35
          : 0;
    assert(result.some((point) => near(point, [latitude, points[index][1]])));
  }
  assert.deepEqual(points, original);
});

test("large GPS jumps cannot move filtered anchors by more than three meters", () => {
  const points = Array.from({ length: 7 }, (_, index) => [
    index === 3 ? 0.01 : 0,
    index * 0.0001,
  ]);
  const result = smoothRoute(points);
  for (const index of [2, 3, 4]) {
    const latitude = index === 3 ? 0.01 - 3 / 111320 : 3 / 111320;
    assert(result.some((point) => near(point, [latitude, points[index][1]])));
  }
});

test("Savitzky-Golay preserves quadratic trajectories", () => {
  const points = Array.from({ length: 7 }, (_, index) => [
    index * 0.0001,
    index * index * 0.0001,
  ]);
  const result = smoothRoute(points);
  for (const point of points)
    assert(result.some((value) => near(value, point)));
});

test("centripetal interpolation matches an unequal-spacing reference midpoint", () => {
  // Chord lengths 4, 9, 16 give knot intervals 2, 3, 4 (up to a common scale).
  const points = [
    [0, 0],
    [0, 0.00004],
    [0.00009, 0.00004],
    [0.00009, 0.0002],
  ];
  const result = smoothRoute(points);
  const midpoint = [(603 / 140) * 0.00001, (533 / 140) * 0.00001];
  assert(result.some((point) => near(point, midpoint)));
  for (const point of points)
    assert(result.some((value) => near(value, point)));
});

test("straight tracks remain straight with no overshoot", () => {
  const points = [
    [37, -122],
    [37, -121.99999],
    [37, -121.9998],
    [37, -121.9995],
  ];
  const result = smoothRoute(points);
  assert(result.length > points.length);
  for (let index = 0; index < result.length; index += 1) {
    assert.equal(result[index][0], 37);
    if (index) assert(result[index][1] >= result[index - 1][1]);
    assert(result[index][1] <= points.at(-1)[1]);
  }
});
