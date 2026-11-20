import type * as THREE from 'three';

/** Sizes below this many metres keep their millionths as exact whole numbers. */
const SOLID_SCRIPT_POINTS_KEY_FAST_LIMIT = 1e9;

/** Millionths of a metre in a metre. */
const SOLID_SCRIPT_POINTS_KEY_SCALE = 1e6;

/** Closest a scaled size may come to a half before the exact path rounds it. */
const SOLID_SCRIPT_POINTS_KEY_HALF_MARGIN = 0.1;

/**
 * Writes a coordinate rounded to millionths, through the exact decimal text:
 * the sign, then the whole millionths, such as -1250000 for -1.25. This is the
 * rule the quick path always matches.
 *
 * @param value Coordinate.
 * @returns Text of the rounded coordinate.
 */
export function solidScriptPointsKeyExact(value: number): string {
  const fixed = value.toFixed(6);
  if (!fixed.includes('.')) return fixed;
  const negative = fixed.startsWith('-');
  const digits = (negative ? fixed.slice(1) : fixed).replace('.', '').replace(/^0+(?=\d)/, '');
  return negative ? `-${digits}` : digits;
}

/**
 * Writes a coordinate rounded to millionths as its sign and whole millionths.
 * Two coordinates get the same text exactly when toFixed(6) writes them the
 * same; sizes near a half millionth go through the exact decimal text.
 *
 * @param value Coordinate.
 * @returns Text of the rounded coordinate.
 */
export function solidScriptPointsKeyCoordinate(value: number): string {
  const negative = value < 0;
  const size = negative ? -value : value;
  if (!(size < SOLID_SCRIPT_POINTS_KEY_FAST_LIMIT)) return solidScriptPointsKeyExact(value);
  const scaled = size * SOLID_SCRIPT_POINTS_KEY_SCALE;
  const whole = Math.floor(scaled);
  const part = scaled - whole;
  if (Math.abs(part - 0.5) < SOLID_SCRIPT_POINTS_KEY_HALF_MARGIN) return solidScriptPointsKeyExact(value);
  const rounded = part > 0.5 ? whole + 1 : whole;
  return negative ? `-${rounded}` : `${rounded}`;
}

/**
 * A key of corner points rounded to millionths, so two solids of the same shape
 * share one hull.
 *
 * @param points Corners.
 * @returns Key.
 */
export function solidScriptPointsKey(points: readonly THREE.Vector3[]): string {
  let key = '';
  for (const point of points)
    key += `${solidScriptPointsKeyCoordinate(point.x)},${solidScriptPointsKeyCoordinate(point.y)},${solidScriptPointsKeyCoordinate(point.z)};`;
  return key;
}
