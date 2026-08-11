/**
 * Clamps a number into [0, 1].
 *
 * @param value Input value.
 * @returns Clamped value.
 */
export function playerLocomotionClamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Linearly interpolates two numbers.
 *
 * @param from Start value.
 * @param to End value.
 * @param weight Blend weight in [0, 1].
 * @returns Interpolated value.
 */
export function playerLocomotionLerp(from: number, to: number, weight: number): number {
  return from + (to - from) * weight;
}

/**
 * Raised cosine arch peaking at mid progress.
 *
 * @param phaseRadians Phase angle.
 * @returns Lift factor in [0, 1] for the positive half-cycle.
 */
export function playerLocomotionPositiveHalfLift(phaseRadians: number): number {
  return Math.max(0, Math.sin(phaseRadians));
}

/**
 * Smoothstep ease in [0, 1].
 *
 * @param t Normalized progress.
 * @returns Eased value in [0, 1].
 */
export function playerLocomotionEaseSmooth(t: number): number {
  const clamped = playerLocomotionClamp01(t);
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Raised cosine lift for a 0..1 swing segment.
 *
 * @param t Normalized swing progress.
 * @returns Lift factor in [0, 1].
 */
export function playerLocomotionSwingLift(t: number): number {
  const clamped = playerLocomotionClamp01(t);
  return Math.sin(clamped * Math.PI);
}
