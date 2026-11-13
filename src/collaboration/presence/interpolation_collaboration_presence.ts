import * as THREE from 'three';
import type { BufferCollaborationPresenceSample } from '@/collaboration/presence/buffer_collaboration_presence.js';

/**
 * Longest linear extrapolation past the newest sample when packets are late or
 * missing.
 */
export const INTERPOLATION_COLLABORATION_PRESENCE_EXTRAPOLATE_MS = 100;
/**
 * How long the extrapolated pose is held before easing back to the newest
 * sample.
 */
export const INTERPOLATION_COLLABORATION_PRESENCE_HOLD_MS = 400;
/**
 * Duration of the ease back to the newest received pose once the stream
 * stopped.
 */
export const INTERPOLATION_COLLABORATION_PRESENCE_SETTLE_MS = 200;
/** Largest gap between two samples that still yields a velocity. */
export const INTERPOLATION_COLLABORATION_PRESENCE_VELOCITY_GAP_MS = 600;

/** What the sampler did at the requested time. */
export type InterpolationCollaborationPresencePhase =
  'interpolating' | 'extrapolating' | 'holding' | 'settling' | 'settled';

/** Sampled pose (written in place). */
export interface InterpolationCollaborationPresencePose {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}

const tangentFrom = new THREE.Vector3();
const tangentTo = new THREE.Vector3();

/**
 * Samples the buffered poses at a render time: cubic Hermite position with
 * monotone tangents (never past a sample, so a stop does not overshoot) and
 * shortest-arc slerped rotation between the two surrounding samples; past the
 * newest sample a short capped linear extrapolation of the position only, a
 * hold, then an ease back to the newest received pose.
 *
 * @param samples Buffered samples, oldest first, non-empty.
 * @param renderTime Time to sample (clock minus the render delay).
 * @param out Receives the pose.
 * @returns Phase.
 */
export function interpolationCollaborationPresenceSample(
  samples: readonly BufferCollaborationPresenceSample[],
  renderTime: number,
  out: InterpolationCollaborationPresencePose,
): InterpolationCollaborationPresencePhase {
  const newestIndex = samples.length - 1;
  const newest = samples[newestIndex]!;
  if (samples.length === 1) return interpolationCollaborationPresenceCopy(newest, out, 'settled');
  if (renderTime >= newest.time) return interpolationCollaborationPresenceBeyond(samples, renderTime, out);
  const nextIndex = samples.findIndex((sample) => sample.time > renderTime);
  if (nextIndex <= 0) return interpolationCollaborationPresenceCopy(samples[0]!, out, 'interpolating');
  const from = samples[nextIndex - 1]!;
  const to = samples[nextIndex]!;
  const span = to.time - from.time;
  const t = (renderTime - from.time) / span;
  interpolationCollaborationPresenceTangent(samples, nextIndex - 1, tangentFrom).multiplyScalar(span);
  interpolationCollaborationPresenceTangent(samples, nextIndex, tangentTo).multiplyScalar(span);
  interpolationCollaborationPresenceHermite(from.position, tangentFrom, to.position, tangentTo, t, out.position);
  out.quaternion.slerpQuaternions(from.quaternion, to.quaternion, t);
  return 'interpolating';
}

/**
 * Evaluates a cubic Hermite curve.
 *
 * @param from Start point.
 * @param fromTangent Start tangent, scaled to the segment.
 * @param to End point.
 * @param toTangent End tangent, scaled to the segment.
 * @param t Segment parameter in [0, 1].
 * @param target Receives the point.
 * @returns The target.
 */
export function interpolationCollaborationPresenceHermite(
  from: THREE.Vector3,
  fromTangent: THREE.Vector3,
  to: THREE.Vector3,
  toTangent: THREE.Vector3,
  t: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;
  return target
    .copy(from)
    .multiplyScalar(2 * t3 - 3 * t2 + 1)
    .addScaledVector(fromTangent, t3 - 2 * t2 + t)
    .addScaledVector(to, -2 * t3 + 3 * t2)
    .addScaledVector(toTangent, t3 - t2);
}

/**
 * Velocity at one sample from its neighbours, per axis limited the
 * Fritsch-Carlson way: zero where the motion reverses or pauses on that axis,
 * at most three times the slower neighbouring slope, so the curve stays between
 * the samples. Ends use the one neighbouring slope.
 *
 * @param samples Buffered samples, at least two.
 * @param index Sample index.
 * @param target Receives the velocity in units per millisecond.
 * @returns The target.
 */
export function interpolationCollaborationPresenceTangent(
  samples: readonly BufferCollaborationPresenceSample[],
  index: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const before = samples[index - 1];
  const sample = samples[index]!;
  const after = samples[index + 1];
  for (let axis = 0; axis < 3; axis++) {
    const left = before ? interpolationCollaborationPresenceSlope(before, sample, axis) : null;
    const right = after ? interpolationCollaborationPresenceSlope(sample, after, axis) : null;
    target.setComponent(axis, interpolationCollaborationPresenceLimit(left ?? right ?? 0, right ?? left ?? 0));
  }
  return target;
}

/**
 * Slope of one axis between two samples.
 *
 * @param from Earlier sample.
 * @param to Later sample.
 * @param axis Axis index.
 * @returns Units per millisecond.
 */
function interpolationCollaborationPresenceSlope(
  from: BufferCollaborationPresenceSample,
  to: BufferCollaborationPresenceSample,
  axis: number,
): number {
  const gap = to.time - from.time;
  if (gap <= 0 || gap > INTERPOLATION_COLLABORATION_PRESENCE_VELOCITY_GAP_MS) return 0;
  return (to.position.getComponent(axis) - from.position.getComponent(axis)) / gap;
}

/**
 * Combines the slopes on both sides of a sample into a tangent that cannot
 * overshoot.
 *
 * @param left Slope before the sample.
 * @param right Slope after the sample.
 * @returns Tangent.
 */
function interpolationCollaborationPresenceLimit(left: number, right: number): number {
  if (left * right <= 0) return 0;
  const average = (left + right) / 2;
  const limit = 3 * Math.min(Math.abs(left), Math.abs(right));
  return Math.sign(average) * Math.min(Math.abs(average), limit);
}

/**
 * Copies a sample into the output.
 *
 * @param sample Sample.
 * @param out Receives the pose.
 * @param phase Phase to report.
 * @returns The phase.
 */
function interpolationCollaborationPresenceCopy(
  sample: BufferCollaborationPresenceSample,
  out: InterpolationCollaborationPresencePose,
  phase: InterpolationCollaborationPresencePhase,
): InterpolationCollaborationPresencePhase {
  out.position.copy(sample.position);
  out.quaternion.copy(sample.quaternion);
  return phase;
}

/**
 * Samples past the newest sample: the position extrapolates linearly along the
 * newest tangent (zero once the member stopped) for a capped time, the rotation
 * stays at the newest sample; then hold, settle, settled.
 *
 * @param samples Buffered samples, at least two.
 * @param renderTime Time to sample, at or after the newest sample.
 * @param out Receives the pose.
 * @returns Phase.
 */
function interpolationCollaborationPresenceBeyond(
  samples: readonly BufferCollaborationPresenceSample[],
  renderTime: number,
  out: InterpolationCollaborationPresencePose,
): InterpolationCollaborationPresencePhase {
  const newest = samples[samples.length - 1]!;
  const late = renderTime - newest.time;
  const holdEnd = INTERPOLATION_COLLABORATION_PRESENCE_EXTRAPOLATE_MS + INTERPOLATION_COLLABORATION_PRESENCE_HOLD_MS;
  if (late >= holdEnd + INTERPOLATION_COLLABORATION_PRESENCE_SETTLE_MS)
    return interpolationCollaborationPresenceCopy(newest, out, 'settled');
  const velocity = interpolationCollaborationPresenceTangent(samples, samples.length - 1, tangentTo);
  if (velocity.lengthSq() === 0) return interpolationCollaborationPresenceCopy(newest, out, 'settled');
  const ahead = Math.min(late, INTERPOLATION_COLLABORATION_PRESENCE_EXTRAPOLATE_MS);
  out.position.copy(newest.position).addScaledVector(velocity, ahead);
  out.quaternion.copy(newest.quaternion);
  if (late <= INTERPOLATION_COLLABORATION_PRESENCE_EXTRAPOLATE_MS) return 'extrapolating';
  if (late <= holdEnd) return 'holding';
  const ease = THREE.MathUtils.smoothstep((late - holdEnd) / INTERPOLATION_COLLABORATION_PRESENCE_SETTLE_MS, 0, 1);
  out.position.lerp(newest.position, ease);
  return 'settling';
}
