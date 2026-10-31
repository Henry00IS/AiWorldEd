import * as THREE from 'three';

/** Shortest blend between two received poses. */
export const POSE_COLLABORATION_PRESENCE_BLEND_MIN_MS = 60;
/** Longest blend between two received poses. */
export const POSE_COLLABORATION_PRESENCE_BLEND_MAX_MS = 300;

/**
 * Smooths a remote pose: each received pose is blended in over about the time
 * since the previous one, so motion stays fluid at 4 to 5 updates per second.
 */
export class PoseCollaborationPresence {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  private readonly fromPosition: THREE.Vector3;
  private readonly fromQuaternion: THREE.Quaternion;
  private readonly toPosition: THREE.Vector3;
  private readonly toQuaternion: THREE.Quaternion;
  private start: number;
  private duration: number;
  private received: number;

  /** Creates an empty pose that snaps to its first target. */
  constructor() {
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.fromPosition = new THREE.Vector3();
    this.fromQuaternion = new THREE.Quaternion();
    this.toPosition = new THREE.Vector3();
    this.toQuaternion = new THREE.Quaternion();
    this.start = 0;
    this.duration = 0;
    this.received = Number.NaN;
  }

  /**
   * Sets a new target, blending from the pose shown now.
   *
   * @param position Target position.
   * @param quaternion Target orientation.
   * @param now Current time in milliseconds.
   */
  target(position: THREE.Vector3, quaternion: THREE.Quaternion, now: number): void {
    const first = Number.isNaN(this.received);
    if (!first) this.update(now);
    this.fromPosition.copy(first ? position : this.position);
    this.fromQuaternion.copy(first ? quaternion : this.quaternion);
    this.toPosition.copy(position);
    this.toQuaternion.copy(quaternion);
    const gap = first ? 0 : now - this.received;
    this.duration = first
      ? 0
      : THREE.MathUtils.clamp(gap, POSE_COLLABORATION_PRESENCE_BLEND_MIN_MS, POSE_COLLABORATION_PRESENCE_BLEND_MAX_MS);
    this.start = now;
    this.received = now;
    this.update(now);
  }

  /**
   * Advances the shown pose.
   *
   * @param now Current time in milliseconds.
   * @returns True while still blending.
   */
  update(now: number): boolean {
    const t = this.duration <= 0 ? 1 : THREE.MathUtils.clamp((now - this.start) / this.duration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    this.position.lerpVectors(this.fromPosition, this.toPosition, eased);
    this.quaternion.slerpQuaternions(this.fromQuaternion, this.toQuaternion, eased);
    return t < 1;
  }
}
