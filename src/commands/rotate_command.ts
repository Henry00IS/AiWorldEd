import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Snapshot of an object's transform before a rotation operation.
 * Stores original position and quaternion so undo can restore both.
 */
export interface ObjectRotationSnapshot {
  object: THREE.Mesh;
  originalPosition: THREE.Vector3;
  originalQuaternion: THREE.Quaternion;
}

/**
 * Undoable command for rotate operations.
 * Stores original transforms and the rotation parameters for each object.
 */
export class RotateCommand implements UndoCommand {
  private snapshots: ObjectRotationSnapshot[];
  private pivot: THREE.Vector3;
  private axis: THREE.Vector3;
  private angle: number;

  /**
   * Creates a new rotate command.
   * @param snapshots The rotation snapshots of all affected objects.
   * @param pivot The rotation pivot point.
   * @param axis The rotation axis vector.
   * @param angle The rotation angle in radians.
   */
  constructor(
    snapshots: ObjectRotationSnapshot[],
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    angle: number
  ) {
    this.snapshots = snapshots;
    this.pivot = pivot.clone();
    this.axis = axis.clone();
    this.angle = angle;
  }

  /**
   * Executes the rotation by applying orientation and orbit around the pivot.
   */
  execute(): void {
    const normalizedAxis = this.axis.clone().normalize();
    const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(
      normalizedAxis,
      this.angle
    );
    this.snapshots.forEach((snapshot) => {
      this.applyRotationToSnapshot(snapshot, rotationQuaternion);
    });
  }

  /**
   * Undoes the rotation by restoring original positions and orientations.
   */
  undo(): void {
    this.snapshots.forEach((snapshot) => {
      snapshot.object.position.copy(snapshot.originalPosition);
      snapshot.object.quaternion.copy(snapshot.originalQuaternion);
    });
  }

  /**
   * Applies the stored rotation to a single snapshot target from its original state.
   * @param snapshot The object snapshot to rotate from original state.
   * @param rotationQuaternion The rotation quaternion to apply.
   */
  private applyRotationToSnapshot(
    snapshot: ObjectRotationSnapshot,
    rotationQuaternion: THREE.Quaternion
  ): void {
    const relativePos = snapshot.originalPosition.clone().sub(this.pivot);
    relativePos.applyQuaternion(rotationQuaternion);
    snapshot.object.position.copy(relativePos.add(this.pivot));
    snapshot.object.quaternion
      .copy(rotationQuaternion)
      .multiply(snapshot.originalQuaternion);
  }
}
