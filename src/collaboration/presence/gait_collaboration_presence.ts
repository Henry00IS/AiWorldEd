import * as THREE from 'three';
import { playerCharacterBoneIdFromGlbName } from '@/player/character/player_character_bone_names.js';
import { PLAYER_CHARACTER_BONE, type PlayerCharacterBoneId } from '@/player/character/player_character_bone_ids.js';

/** Distance covered by one full stride cycle (left and right step). */
export const GAIT_COLLABORATION_PRESENCE_STRIDE_METERS = 1.6;
/** Speed at which the swing reaches full amplitude. */
export const GAIT_COLLABORATION_PRESENCE_FULL_SPEED = 3;
/** Speed below which the member counts as standing. */
export const GAIT_COLLABORATION_PRESENCE_STAND_SPEED = 0.15;
/** Time constant of the swing amplitude following the speed. */
export const GAIT_COLLABORATION_PRESENCE_RESPONSE_MS = 120;
/** Thigh swing at full amplitude, in radians. */
const GAIT_COLLABORATION_PRESENCE_THIGH = 0.5;
/** Knee bend at full amplitude, in radians. */
const GAIT_COLLABORATION_PRESENCE_KNEE = 0.7;

/**
 * One animated leg bone: its rest pose and the body-right axis in its own
 * frame.
 */
interface GaitCollaborationPresenceJoint {
  readonly bone: THREE.Bone;
  readonly rest: THREE.Quaternion;
  readonly axis: THREE.Vector3;
}

/** Leg bones the gait swings. */
const GAIT_COLLABORATION_PRESENCE_BONES: readonly PlayerCharacterBoneId[] = [
  PLAYER_CHARACTER_BONE.upperLegLeft,
  PLAYER_CHARACTER_BONE.upperLegRight,
  PLAYER_CHARACTER_BONE.lowerLegLeft,
  PLAYER_CHARACTER_BONE.lowerLegRight,
];

/**
 * Lightweight walk cycle for a remote character, driven only by its smoothed
 * motion: the stride phase advances with distance walked and the swing grows
 * with speed, so legs never slide or run in place. The full play-mode
 * locomotion (collision, IK) stays local; remote characters only need to look
 * like they walk.
 */
export class GaitCollaborationPresence {
  private readonly joints: Map<PlayerCharacterBoneId, GaitCollaborationPresenceJoint>;
  private readonly last: THREE.Vector3;
  private hasLast: boolean;
  private phase: number;
  private amplitudeValue: number;

  /** Creates a gait with no bones yet. */
  constructor() {
    this.joints = new Map();
    this.last = new THREE.Vector3();
    this.hasLast = false;
    this.phase = 0;
    this.amplitudeValue = 0;
  }

  /**
   * Current swing amplitude in [0, 1].
   *
   * @returns Amplitude.
   */
  amplitude(): number {
    return this.amplitudeValue;
  }

  /**
   * Finds the leg bones under a character clone in its rest pose.
   *
   * @param root Clone root.
   */
  bind(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    const rootInverse = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    root.traverse((child) => {
      const id = child instanceof THREE.Bone ? playerCharacterBoneIdFromGlbName(child.name) : null;
      if (!id || !GAIT_COLLABORATION_PRESENCE_BONES.includes(id)) return;
      const relative = rootInverse.clone().multiply(child.getWorldQuaternion(new THREE.Quaternion()));
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(relative.invert());
      this.joints.set(id, { bone: child as THREE.Bone, rest: child.quaternion.clone(), axis });
    });
  }

  /**
   * Advances the cycle from the shown position.
   *
   * @param position Shown feet position.
   * @param deltaMs Time since the previous update.
   * @returns True while the legs are still swinging or settling.
   */
  update(position: THREE.Vector3, deltaMs: number): boolean {
    const distance = this.hasLast ? Math.hypot(position.x - this.last.x, position.z - this.last.z) : 0;
    this.last.copy(position);
    this.hasLast = true;
    const speed = deltaMs > 0 ? (distance * 1000) / deltaMs : 0;
    const goal =
      speed < GAIT_COLLABORATION_PRESENCE_STAND_SPEED ? 0 : Math.min(1, speed / GAIT_COLLABORATION_PRESENCE_FULL_SPEED);
    const follow = 1 - Math.exp(-Math.max(0, deltaMs) / GAIT_COLLABORATION_PRESENCE_RESPONSE_MS);
    this.amplitudeValue += (goal - this.amplitudeValue) * follow;
    if (this.amplitudeValue < 1e-3 && goal === 0) this.amplitudeValue = 0;
    this.phase = (this.phase + (distance / GAIT_COLLABORATION_PRESENCE_STRIDE_METERS) * Math.PI * 2) % (Math.PI * 2);
    this.pose();
    return this.amplitudeValue > 0;
  }

  /** Writes the leg angles for the current phase and amplitude. */
  private pose(): void {
    const swing = Math.sin(this.phase) * GAIT_COLLABORATION_PRESENCE_THIGH * this.amplitudeValue;
    const knee = GAIT_COLLABORATION_PRESENCE_KNEE * this.amplitudeValue;
    this.rotate(PLAYER_CHARACTER_BONE.upperLegLeft, -swing);
    this.rotate(PLAYER_CHARACTER_BONE.upperLegRight, swing);
    this.rotate(PLAYER_CHARACTER_BONE.lowerLegLeft, knee * Math.max(0, Math.cos(this.phase)));
    this.rotate(PLAYER_CHARACTER_BONE.lowerLegRight, knee * Math.max(0, -Math.cos(this.phase)));
  }

  /**
   * Sets one bone to its rest pose turned about the body-right axis (positive
   * swings the limb backward).
   *
   * @param id Bone id.
   * @param angle Angle in radians.
   */
  private rotate(id: PlayerCharacterBoneId, angle: number): void {
    const joint = this.joints.get(id);
    if (!joint) return;
    joint.bone.quaternion.setFromAxisAngle(joint.axis, angle).premultiply(joint.rest);
  }
}
