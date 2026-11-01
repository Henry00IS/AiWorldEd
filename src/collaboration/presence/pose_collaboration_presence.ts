import * as THREE from 'three';
import { BufferCollaborationPresence } from '@/collaboration/presence/buffer_collaboration_presence.js';
import {
  INTERPOLATION_COLLABORATION_PRESENCE_DELAY_MS,
  interpolationCollaborationPresenceSample,
  type InterpolationCollaborationPresencePhase,
} from '@/collaboration/presence/interpolation_collaboration_presence.js';

/** Jump between two received poses that is shown as a teleport (snap). */
export const POSE_COLLABORATION_PRESENCE_TELEPORT_METERS = 5;
/** Time constant of the correction that hides changes to the sampled path. */
export const POSE_COLLABORATION_PRESENCE_CORRECTION_MS = 100;
/** Correction below which it is dropped. */
const POSE_COLLABORATION_PRESENCE_CORRECTION_EPSILON = 1e-4;

/**
 * Smooths a remote pose from the 5-per-second presence stream. Received poses
 * go into a small buffer on a jitter-smoothed timeline and are rendered one
 * send interval (plus a margin) behind: position interpolates linearly and
 * rotation by slerp between the two surrounding samples. When packets are late
 * or missing the last velocity is extrapolated for a capped time, then held.
 * Whenever a new pose changes the path being shown, the difference decays
 * smoothly instead of snapping; jumps over the teleport distance snap.
 */
export class PoseCollaborationPresence {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  private readonly buffer: BufferCollaborationPresence;
  private readonly sampled: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  private readonly offsetPosition: THREE.Vector3;
  private readonly offsetQuaternion: THREE.Quaternion;
  private phase: InterpolationCollaborationPresencePhase;
  private updated: number;

  /** Creates an empty pose that snaps to its first target. */
  constructor() {
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.buffer = new BufferCollaborationPresence();
    this.sampled = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    this.offsetPosition = new THREE.Vector3();
    this.offsetQuaternion = new THREE.Quaternion();
    this.phase = 'settled';
    this.updated = Number.NaN;
  }

  /**
   * Adds a received pose; the first one and teleports snap.
   *
   * @param position Received position.
   * @param quaternion Received orientation.
   * @param now Receive time in milliseconds.
   */
  target(position: THREE.Vector3, quaternion: THREE.Quaternion, now: number): void {
    const newest = this.buffer.newest();
    if (!newest || newest.position.distanceTo(position) > POSE_COLLABORATION_PRESENCE_TELEPORT_METERS)
      return this.snap(position, quaternion, now);
    this.update(now);
    this.buffer.push(position, quaternion, now);
    this.sample(now);
    this.offsetPosition.subVectors(this.position, this.sampled.position);
    this.offsetQuaternion.copy(this.quaternion).multiply(this.sampled.quaternion.clone().invert());
    this.compose();
  }

  /**
   * Jumps straight to a pose and forgets the buffered path.
   *
   * @param position Position.
   * @param quaternion Orientation.
   * @param now Current time in milliseconds.
   */
  snap(position: THREE.Vector3, quaternion: THREE.Quaternion, now: number): void {
    this.buffer.reset(position, quaternion, now);
    this.offsetPosition.set(0, 0, 0);
    this.offsetQuaternion.identity();
    this.updated = now;
    this.sample(now);
    this.compose();
  }

  /**
   * Advances the shown pose.
   *
   * @param now Current time in milliseconds.
   * @returns True while the shown pose can still change without new input.
   */
  update(now: number): boolean {
    if (!this.buffer.newest()) return false;
    const elapsed = Number.isNaN(this.updated) ? 0 : Math.max(0, now - this.updated);
    this.updated = now;
    this.correctionDecay(elapsed);
    this.sample(now);
    this.compose();
    return this.phase !== 'settled' || this.correcting();
  }

  /**
   * Samples the buffer at the render time.
   *
   * @param now Current time in milliseconds.
   */
  private sample(now: number): void {
    const renderTime = now - INTERPOLATION_COLLABORATION_PRESENCE_DELAY_MS;
    this.phase = interpolationCollaborationPresenceSample(this.buffer.samples, renderTime, this.sampled);
  }

  /** Writes the sampled pose plus the remaining correction to the shown pose. */
  private compose(): void {
    this.position.addVectors(this.sampled.position, this.offsetPosition);
    this.quaternion.multiplyQuaternions(this.offsetQuaternion, this.sampled.quaternion).normalize();
  }

  /**
   * Shrinks the correction exponentially.
   *
   * @param elapsed Milliseconds since the previous update.
   */
  private correctionDecay(elapsed: number): void {
    const keep = Math.exp(-elapsed / POSE_COLLABORATION_PRESENCE_CORRECTION_MS);
    this.offsetPosition.multiplyScalar(keep);
    this.offsetQuaternion.slerp(new THREE.Quaternion(), 1 - keep);
    if (!this.correcting()) {
      this.offsetPosition.set(0, 0, 0);
      this.offsetQuaternion.identity();
    }
  }

  /**
   * Returns true while a visible correction remains.
   *
   * @returns Correcting state.
   */
  private correcting(): boolean {
    const angle = 2 * Math.acos(Math.min(1, Math.abs(this.offsetQuaternion.w)));
    return (
      this.offsetPosition.length() > POSE_COLLABORATION_PRESENCE_CORRECTION_EPSILON ||
      angle > POSE_COLLABORATION_PRESENCE_CORRECTION_EPSILON
    );
  }
}
