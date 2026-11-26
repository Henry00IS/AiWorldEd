import type { Curve } from '@/curve/model/curve_model.js';
import { solidScriptCurveFromText } from './solid_script_curve_read.js';
import { SolidScriptElement, solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';

/**
 * A Curve: a line across a square from left (0) to right (1), each point with
 * its height, joined by straight or bent segments, such as a Curve input or a
 * curve from Curve(points). Its points are under .Points and its segments under
 * .Segments.
 */
export class SolidScriptCurveValue extends SolidScriptElement {
  /** @param curve The line, never changed once made. */
  constructor(readonly curve: Curve) {
    super('curve', -1);
  }

  /**
   * Writes the curve the way a formula makes it from its points, such as
   * Curve([[0, 1], [1, 0]]).
   *
   * @returns Text.
   */
  override toString(): string {
    const points = this.curve.points.map(
      (point) => `[${solidScriptCurveNumber(point.x)}, ${solidScriptCurveNumber(point.y)}]`,
    );
    return `Curve([${points.join(', ')}])`;
  }
}

/**
 * Rounds a curve number for display, without rounding noise.
 *
 * @param value Number.
 * @returns Rounded number.
 */
export function solidScriptCurveNumber(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Reads a value as a curve: a Curve, a number for a flat line, a preset name
 * such as "Classic Column", or points in brackets such as "[0, 1], [1, 0]".
 *
 * @param value Value.
 * @returns The curve, shared and not to be changed, or null when the value is
 *   no curve.
 */
export function solidScriptCurveOf(value: SolidScriptValue): Curve | null {
  if (value instanceof SolidScriptCurveValue) return value.curve;
  return solidScriptCurveFromText(typeof value === 'string' ? value : solidScriptValueText(value));
}

/**
 * Reads a value as a curve, an empty one as a flat line at 1 like a new curve
 * field.
 *
 * @param value Value.
 * @returns Curve, or null when the value is no curve.
 */
export function solidScriptCurveOrFlat(value: SolidScriptValue): Curve | null {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) return solidScriptCurveOf('1');
  return solidScriptCurveOf(value);
}
