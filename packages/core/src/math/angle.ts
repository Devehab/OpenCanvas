export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export const degToRad = (deg: number): number => deg * DEG_TO_RAD;
export const radToDeg = (rad: number): number => rad * RAD_TO_DEG;

/** Normalizes an angle in degrees to the half-open range (-180, 180]. */
export function normalizeDegrees(deg: number): number {
  let d = deg % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  // Avoid -0 so serialized documents stay canonical.
  return d === 0 ? 0 : d;
}

/** Snaps `deg` to the nearest multiple of `step` when within `tolerance` degrees of it. */
export function snapDegrees(deg: number, step: number, tolerance = step / 2): number {
  const snapped = Math.round(deg / step) * step;
  return Math.abs(snapped - deg) <= tolerance ? normalizeDegrees(snapped) : deg;
}
