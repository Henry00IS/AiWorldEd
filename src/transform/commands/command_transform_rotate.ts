import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';

/**
 * Snapshot of an object's transform for a rotation operation. Optional final
 * pose fields commit the live drag result without re-baking axis-angle math.
 */
export interface ObjectRotationSnapshot {
  object: THREE.Object3D;
  originalPosition: THREE.Vector3;
  originalQuaternion: THREE.Quaternion;
  finalPosition?: THREE.Vector3;
  finalQuaternion?: THREE.Quaternion;
}

/**
 * Undoable command for rotate operations. Prefers explicit final poses so
 * free-view and parented world-space live previews survive command push.
 */
export class CommandTransformRotate implements UndoCommand {
  private snapshots: ObjectRotationSnapshot[];
  private pivot: THREE.Vector3;
  private axis: THREE.Vector3;
  private angle: number;

  /**
   * Creates a new rotate command.
   *
   * @param snapshots The rotation snapshots of all affected objects.
   * @param pivot The rotation pivot point for axis-angle fallback.
   * @param axis The rotation axis vector for axis-angle fallback.
   * @param angle The rotation angle in radians for axis-angle fallback.
   */
  constructor(snapshots: ObjectRotationSnapshot[], pivot: THREE.Vector3, axis: THREE.Vector3, angle: number) {
    this.snapshots = snapshots;
    this.pivot = pivot.clone();
    this.axis = axis.clone();
    this.angle = angle;
  }

  /**
   * Applies stored final poses when present, otherwise axis-angle from
   * original.
   */
  execute(): void {
    this.snapshots.forEach((snapshot) => {
      this.applySnapshotExecute(snapshot);
    });
  }

  /** Undoes the rotation by restoring original positions and orientations. */
  undo(): void {
    this.snapshots.forEach((snapshot) => {
      snapshot.object.position.copy(snapshot.originalPosition);
      snapshot.object.quaternion.copy(snapshot.originalQuaternion);
    });
  }

  /**
   * Writes one object to its committed pose or axis-angle fallback.
   *
   * @param snapshot Object snapshot to apply.
   */
  private applySnapshotExecute(snapshot: ObjectRotationSnapshot): void {
    if (this.applyFinalPoseWhenPresent(snapshot)) {
      return;
    }
    this.applyAxisAngleFromOriginal(snapshot);
  }

  /**
   * Copies final position and quaternion when both were recorded at drag end.
   *
   * @param snapshot Object snapshot that may include final pose fields.
   * @returns True when a final pose was applied.
   */
  private applyFinalPoseWhenPresent(snapshot: ObjectRotationSnapshot): boolean {
    const finalPosition = snapshot.finalPosition;
    const finalQuaternion = snapshot.finalQuaternion;
    if (!finalPosition || !finalQuaternion) {
      return false;
    }
    snapshot.object.position.copy(finalPosition);
    snapshot.object.quaternion.copy(finalQuaternion);
    return true;
  }

  /**
   * Recomputes orientation and orbit from original local pose via axis-angle.
   *
   * @param snapshot Object snapshot without final pose fields.
   */
  private applyAxisAngleFromOriginal(snapshot: ObjectRotationSnapshot): void {
    const rotationQuaternion = this.buildAxisAngleQuaternion();
    const relativePos = snapshot.originalPosition.clone().sub(this.pivot);
    relativePos.applyQuaternion(rotationQuaternion);
    snapshot.object.position.copy(relativePos.add(this.pivot));
    snapshot.object.quaternion.copy(rotationQuaternion).multiply(snapshot.originalQuaternion);
  }

  /**
   * Builds a unit quaternion from this command's stored axis and angle.
   *
   * @returns Unit rotation quaternion for this command's axis and angle.
   */
  private buildAxisAngleQuaternion(): THREE.Quaternion {
    const normalizedAxis = this.axis.clone().normalize();
    return new THREE.Quaternion().setFromAxisAngle(normalizedAxis, this.angle);
  }
}
