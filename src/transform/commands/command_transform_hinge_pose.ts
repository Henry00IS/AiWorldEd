import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';

/** Start and final pose of one object rotated about a hinge. */
export interface ObjectHingePoseSnapshot {
  object: THREE.Object3D;
  originalPosition: THREE.Vector3;
  originalQuaternion: THREE.Quaternion;
  originalScale: THREE.Vector3;
  finalPosition: THREE.Vector3;
  finalQuaternion: THREE.Quaternion;
  finalScale: THREE.Vector3;
}

/**
 * Undoable hinge pose. Stores position, quaternion, and scale so undo restores
 * the start size as well as the rotation.
 */
export class CommandTransformHingePose implements UndoCommand {
  private readonly snapshots: ObjectHingePoseSnapshot[];

  /**
   * Creates a hinge pose command from poses that are already applied.
   *
   * @param snapshots Start and final poses.
   */
  constructor(snapshots: readonly ObjectHingePoseSnapshot[]) {
    this.snapshots = snapshots.map((snapshot) => cloneHingePoseSnapshot(snapshot));
  }

  /** Writes every final pose. */
  execute(): void {
    this.snapshots.forEach((snapshot) => {
      writeHingePose(snapshot, snapshot.finalPosition, snapshot.finalQuaternion, snapshot.finalScale);
    });
  }

  /** Writes every original pose. */
  undo(): void {
    this.snapshots.forEach((snapshot) => {
      writeHingePose(snapshot, snapshot.originalPosition, snapshot.originalQuaternion, snapshot.originalScale);
    });
  }
}

/**
 * Copies one hinge pose onto its object.
 *
 * @param snapshot Pose owner.
 * @param position Position to write.
 * @param quaternion Quaternion to write.
 * @param scale Scale to write.
 */
function writeHingePose(
  snapshot: ObjectHingePoseSnapshot,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  scale: THREE.Vector3,
): void {
  snapshot.object.position.copy(position);
  snapshot.object.quaternion.copy(quaternion);
  snapshot.object.scale.copy(scale);
  snapshot.object.updateMatrixWorld(true);
}

/**
 * Clones the vectors of one hinge pose snapshot.
 *
 * @param snapshot Snapshot to copy.
 * @returns Independent snapshot.
 */
function cloneHingePoseSnapshot(snapshot: ObjectHingePoseSnapshot): ObjectHingePoseSnapshot {
  return {
    object: snapshot.object,
    originalPosition: snapshot.originalPosition.clone(),
    originalQuaternion: snapshot.originalQuaternion.clone(),
    originalScale: snapshot.originalScale.clone(),
    finalPosition: snapshot.finalPosition.clone(),
    finalQuaternion: snapshot.finalQuaternion.clone(),
    finalScale: snapshot.finalScale.clone(),
  };
}
