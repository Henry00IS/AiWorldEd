import { CadRulerStyle } from './cad_ruler_style.js';

/**
 * Formats a world-space length for CAD dimension labels. Uses up to five
 * fractional digits (for fine snap steps such as 0.03125) and strips trailing
 * zeros.
 *
 * @param distance Absolute length in world units.
 * @returns Compact display string without unit suffix.
 */
export function formatCadDistance(distance: number, unitScale: number = 1, unitLabel: string = ''): string {
  const absolute = Math.abs(distance * unitScale);
  const suffix = unitLabel.length > 0 ? ` ${unitLabel}` : '';
  if (absolute < 1e-9) return `0${suffix}`;
  if (absolute >= 10000) return `${absolute.toFixed(0)}${suffix}`;
  if (absolute >= 1000) return `${trimTrailingZeros(absolute.toFixed(1))}${suffix}`;
  return `${trimTrailingZeros(absolute.toFixed(CadRulerStyle.distanceDecimals))}${suffix}`;
}

/**
 * Removes trailing fractional zeros while keeping a leading integer part.
 *
 * @param value Fixed-decimal string.
 * @returns Compact numeric string.
 */
function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/\.?0+$/, '');
}

/**
 * Formats a signed component delta for drag feedback.
 *
 * @param delta Signed offset along one axis.
 * @returns Signed compact string such as "+1.25" or "-0.03125".
 */
export function formatCadSignedDelta(delta: number, unitScale: number = 1, unitLabel: string = ''): string {
  if (Math.abs(delta) < 1e-9) return formatCadDistance(0, unitScale, unitLabel);
  const sign = delta > 0 ? '+' : '-';
  return `${sign}${formatCadDistance(delta, unitScale, unitLabel).replace(/^[-+]/, '')}`;
}

/**
 * Formats a three-component drag delta for status text.
 *
 * @param deltaX Signed X component.
 * @param deltaY Signed Y component.
 * @param deltaZ Signed Z component.
 * @returns Status-bar friendly summary.
 */
export function formatCadDeltaStatus(
  deltaX: number,
  deltaY: number,
  deltaZ: number,
  unitScale: number = 1,
  unitLabel: string = '',
): string {
  const total = Math.hypot(deltaX, deltaY, deltaZ);
  return `Δ ${formatCadSignedDelta(deltaX, unitScale, unitLabel)}, ${formatCadSignedDelta(deltaY, unitScale, unitLabel)}, ${formatCadSignedDelta(deltaZ, unitScale, unitLabel)} | ${formatCadDistance(total, unitScale, unitLabel)}`;
}
