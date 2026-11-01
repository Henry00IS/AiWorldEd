import * as THREE from 'three';
import {
  BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS,
  type BufferCollaborationPresenceSample,
} from '@/collaboration/presence/buffer_collaboration_presence.js';

/**
 * How far behind the clock remote motion is rendered (one interval plus a
 * jitter margin of 80 ms).
 */
export const INTERPOLATION_COLLABORATION_PRESENCE_DELAY_MS = BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS + 80;
/**
 * Longest extrapolation past the newest sample when packets are late or
 * missing.
 */
export const INTERPOLATION_COLLABORATION_PRESENCE_EXTRAPOLATE_MS = 250;
/**
 * How long the extrapolated pose is held before easing back to the newest
 * sample.
 */
export const INTERPOLATION_COLLABORATION_PRESENCE_HOLD_MS = 300;
/**
 * Duration of the ease back to the newest received pose once the stream
 * stopped.
 */
export const INTERPOLATION_COLLABORATION_PRESENCE_SETTLE_MS = 200;
/** Largest gap between the two newest samples that still yields a velocity. */
export const INTERPOLATION_COLLABORATION_PRESENCE_VELOCITY_GAP_MS = BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS * 3;

/** What the sampler did at the requested time. */
export type InterpolationCollaborationPresencePhase =
  'interpolating' | 'extrapolating' | 'holding' | 'settling' | 'settled';

/** Sampled pose (written in place). */
export interface InterpolationCollaborationPresencePose {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}

/**
 * Samples the buffered poses at a render time: linear position and slerped
 * rotation between the two surrounding samples, extrapolation from the last
 * velocity past the newest one (capped), then a hold, then an ease back to the
 * newest received pose.
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
  const newest = samples[samples.length - 1]!;
  if (samples.length === 1) return interpolationCollaborationPresenceCopy(newest, out, 'settled');
  if (renderTime >= newest.time) return interpolationCollaborationPresenceBeyond(samples, renderTime, out);
  const nextIndex = samples.findIndex((sample) => sample.time > renderTime);
  if (nextIndex <= 0) return interpolationCollaborationPresenceCopy(samples[0]!, out, 'interpolating');
  const from = samples[nextIndex - 1]!;
  const to = samples[nextIndex]!;
  const t = (renderTime - from.time) / (to.time - from.time);
  out.position.lerpVectors(from.position, to.position, t);
  out.quaternion.slerpQuaternions(from.quaternion, to.quaternion, t);
  return 'interpolating';
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
 * Samples past the newest sample: extrapolate, hold, settle, settled.
 *
 * @param samples Buffered samples, non-empty.
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
  interpolationCollaborationPresenceExtrapolate(
    samples,
    Math.min(late, INTERPOLATION_COLLABORATION_PRESENCE_EXTRAPOLATE_MS),
    out,
  );
  if (late <= INTERPOLATION_COLLABORATION_PRESENCE_EXTRAPOLATE_MS) return 'extrapolating';
  if (late <= holdEnd) return 'holding';
  const ease = THREE.MathUtils.smoothstep((late - holdEnd) / INTERPOLATION_COLLABORATION_PRESENCE_SETTLE_MS, 0, 1);
  out.position.lerp(newest.position, ease);
  out.quaternion.slerp(newest.quaternion, ease);
  return 'settling';
}

/**
 * Extrapolates the newest sample along the last velocity. The velocity is
 * scaled down when the member was slowing (the newest step shorter than the one
 * before), so a member who stops does not overshoot.
 *
 * @param samples Buffered samples, at least two.
 * @param ahead Milliseconds past the newest sample.
 * @param out Receives the pose.
 */
function interpolationCollaborationPresenceExtrapolate(
  samples: readonly BufferCollaborationPresenceSample[],
  ahead: number,
  out: InterpolationCollaborationPresencePose,
): void {
  const newest = samples[samples.length - 1]!;
  const before = samples[samples.length - 2]!;
  const gap = newest.time - before.time;
  const usable = gap > 0 && gap <= INTERPOLATION_COLLABORATION_PRESENCE_VELOCITY_GAP_MS;
  const scale = usable ? (ahead / gap) * interpolationCollaborationPresenceSlowing(samples) : 0;
  out.position.copy(newest.position).sub(before.position).multiplyScalar(scale).add(newest.position);
  out.quaternion.slerpQuaternions(before.quaternion, newest.quaternion, 1 + scale);
}

/**
 * Measures how much the member slowed over the newest step: 1 for steady or
 * faster motion, toward 0 when the newest step is much shorter than the
 * previous one (squared, so a stop barely extrapolates).
 *
 * @param samples Buffered samples, at least two.
 * @returns Factor in [0, 1].
 */
export function interpolationCollaborationPresenceSlowing(
  samples: readonly BufferCollaborationPresenceSample[],
): number {
  if (samples.length < 3) return 1;
  const [first, second, third] = samples.slice(-3) as [
    BufferCollaborationPresenceSample,
    BufferCollaborationPresenceSample,
    BufferCollaborationPresenceSample,
  ];
  const previousSpeed = second.position.distanceTo(first.position) / Math.max(1, second.time - first.time);
  const newestSpeed = third.position.distanceTo(second.position) / Math.max(1, third.time - second.time);
  if (previousSpeed <= 1e-9) return 1;
  return THREE.MathUtils.clamp(newestSpeed / previousSpeed, 0, 1) ** 2;
}
