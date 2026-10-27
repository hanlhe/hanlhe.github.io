module.exports = function smoothRoute(points) {
  if (!points.length) return [];
  const longitudeScale = Math.cos((points[0][0] * Math.PI) / 180);
  const metersBetween = (a, b) =>
    Math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * 111320 * longitudeScale);
  const blend = (a, b, fraction) =>
    [0, 1].map((axis) => a[axis] + (b[axis] - a[axis]) * fraction);
  const weights = [-3, 12, 17, 12, -3];
  // shortcut: the five-point quadratic filter uses sample order; resample by distance if recording intervals vary widely.
  const filtered = points.map((point, index) => {
    if (index < 2 || index >= points.length - 2) return point.slice(0, 2);
    const sample = [0, 1].map(
      (axis) =>
        point[axis] +
        weights.reduce(
          (sum, weight, offset) =>
            sum + weight * (points[index + offset - 2][axis] - point[axis]),
          0
        ) /
          35
    );
    // Keep recording gaps and GPS spikes from dragging nearby points far off course.
    const shift = metersBetween(point, sample);
    return shift > 3 ? blend(point, sample, 3 / shift) : sample;
  });
  if (filtered.length < 3) return filtered;

  // Centripetal knots advance by the square root of the distance in local meters.
  const knotDistance = (a, b) => Math.sqrt(metersBetween(a, b));
  const curved = [filtered[0]];

  for (let index = 0; index < filtered.length - 1; index += 1) {
    const p1 = filtered[index];
    const p2 = filtered[index + 1];
    const span = knotDistance(p1, p2);
    if (!span) {
      curved.push(p2);
      continue;
    }
    let p0 = filtered[index - 1] || p1;
    let p3 = filtered[index + 2] || p2;
    // Reflect missing or coincident neighbors to avoid zero-length knot intervals.
    if (!knotDistance(p0, p1)) p0 = blend(p2, p1, 2);
    if (!knotDistance(p2, p3)) p3 = blend(p1, p2, 2);
    const t1 = knotDistance(p0, p1);
    const t2 = t1 + span;
    const t3 = t2 + knotDistance(p2, p3);
    // shortcut: cap each span at eight pieces; use adaptive tessellation if sparse tracks need finer curves.
    const steps = Math.min(8, Math.ceil((span * span) / 2));

    for (let step = 1; step < steps; step += 1) {
      const fraction = step / steps;
      const t = t1 + span * fraction;
      const a1 = blend(p0, p1, t / t1);
      const a2 = blend(p1, p2, fraction);
      const a3 = blend(p2, p3, (t - t2) / (t3 - t2));
      const b1 = blend(a1, a2, t / t2);
      const b2 = blend(a2, a3, (t - t1) / (t3 - t1));
      curved.push(blend(b1, b2, fraction));
    }
    curved.push(p2);
  }
  return curved;
};
