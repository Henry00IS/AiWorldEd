import * as THREE from 'three';

/** Tolerance used when comparing decomposed transform components. */
const PHYSICS_LEVEL_POSE_EPSILON = 1e-6;

/** How a world matrix changed relative to the last recorded pose. */
export type PhysicsLevelPoseChange = 'none' | 'rigid' | 'scale';

/**
 * A world transform split into the rigid pose Rapier colliders use and the
 * scale that has to be baked into collider vertices.
 */
export class PhysicsLevelPose {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly scale: THREE.Vector3;
  readonly scaleMatrix: THREE.Matrix4;
  readonly worldMatrix: THREE.Matrix4;
  private readonly scratchPosition: THREE.Vector3;
  private readonly scratchQuaternion: THREE.Quaternion;
  private readonly scratchScale: THREE.Vector3;

  /** Creates an identity pose. */
  constructor() {
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3(1, 1, 1);
    this.scaleMatrix = new THREE.Matrix4();
    this.worldMatrix = new THREE.Matrix4();
    this.scratchPosition = new THREE.Vector3();
    this.scratchQuaternion = new THREE.Quaternion();
    this.scratchScale = new THREE.Vector3();
  }

  /**
   * Records a world matrix and reports what changed since the last record.
   *
   * @param worldMatrix World matrix to record.
   * @returns 'scale' when vertices need rebaking, 'rigid' when only the pose
   *   moved, or 'none'.
   */
  update(worldMatrix: THREE.Matrix4): PhysicsLevelPoseChange {
    this.worldMatrix.copy(worldMatrix);
    worldMatrix.decompose(this.scratchPosition, this.scratchQuaternion, this.scratchScale);
    const scaleChanged = !physicsLevelPoseVectorsClose(this.scratchScale, this.scale);
    const rigidChanged =
      !physicsLevelPoseVectorsClose(this.scratchPosition, this.position) ||
      Math.abs(this.scratchQuaternion.dot(this.quaternion)) < 1 - PHYSICS_LEVEL_POSE_EPSILON;
    this.position.copy(this.scratchPosition);
    this.quaternion.copy(this.scratchQuaternion);
    this.scale.copy(this.scratchScale);
    this.scaleMatrix.makeScale(this.scale.x, this.scale.y, this.scale.z);
    if (scaleChanged) {
      return 'scale';
    }
    return rigidChanged ? 'rigid' : 'none';
  }

  /**
   * Returns the matrix to bake into vertices, or null for unit scale.
   *
   * @returns Scale matrix, or null.
   */
  getBakeMatrix(): THREE.Matrix4 | null {
    const isUnitScale =
      Math.abs(this.scale.x - 1) < PHYSICS_LEVEL_POSE_EPSILON &&
      Math.abs(this.scale.y - 1) < PHYSICS_LEVEL_POSE_EPSILON &&
      Math.abs(this.scale.z - 1) < PHYSICS_LEVEL_POSE_EPSILON;
    return isUnitScale ? null : this.scaleMatrix;
  }
}

/**
 * Returns whether two vectors match within the pose tolerance.
 *
 * @param first First vector.
 * @param second Second vector.
 * @returns True when every component is close.
 */
function physicsLevelPoseVectorsClose(first: THREE.Vector3, second: THREE.Vector3): boolean {
  return (
    Math.abs(first.x - second.x) < PHYSICS_LEVEL_POSE_EPSILON &&
    Math.abs(first.y - second.y) < PHYSICS_LEVEL_POSE_EPSILON &&
    Math.abs(first.z - second.z) < PHYSICS_LEVEL_POSE_EPSILON
  );
}
