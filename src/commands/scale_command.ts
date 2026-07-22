import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Snapshot of an object's transform before a scale operation.
 * Stores original position and scale so undo can restore both.
 */
export interface ObjectScaleSnapshot {
  object: THREE.Mesh;
  originalPosition: THREE.Vector3;
  originalScale: THREE.Vector3;
}

/**
 * Undoable command for scale operations.
 * Stores original transforms and the scaling parameters for each object.
 */
export class ScaleCommand implements UndoCommand {
  private snapshots: ObjectScaleSnapshot[];
  private pivot: THREE.Vector3;
  private axis: THREE.Vector3;
  private factor: number;

  /**
   * Creates a new scale command.
   * @param snapshots The scale snapshots of all affected objects.
   * @param pivot The scale pivot point.
   * @param axis The scaling axis vector.
   * @param factor The scale factor multiplier relative to original state.
   */
  constructor(
    snapshots: ObjectScaleSnapshot[],
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    factor: number
  ) {
    this.snapshots = snapshots;
    this.pivot = pivot.clone();
    this.axis = axis.clone();
    this.factor = factor;
  }

  /**
   * Executes the scaling by applying factor to positions and mesh scales.
   */
  execute(): void {
    const normalizedAxis = this.axis.clone().normalize();
    const safeFactor = Math.max(0.01, this.factor);
    this.snapshots.forEach((snapshot) => {
      this.applyScaleToSnapshot(snapshot, normalizedAxis, safeFactor);
    });
  }

  /**
   * Undoes the scaling by restoring original positions and scales.
   */
  undo(): void {
    this.snapshots.forEach((snapshot) => {
      snapshot.object.position.copy(snapshot.originalPosition);
      snapshot.object.scale.copy(snapshot.originalScale);
    });
  }

  /**
   * Applies absolute scale to a snapshot target from its original state.
   * @param snapshot The object snapshot to scale from original state.
   * @param axis The normalized scale axis.
   * @param factor The total scale factor.
   */
  private applyScaleToSnapshot(
    snapshot: ObjectScaleSnapshot,
    axis: THREE.Vector3,
    factor: number
  ): void {
    const relativePos = snapshot.originalPosition.clone().sub(this.pivot);
    const projection = relativePos.dot(axis);
    const scaledRelative = relativePos
      .clone()
      .sub(axis.clone().multiplyScalar(projection))
      .add(axis.clone().multiplyScalar(projection * factor));
    snapshot.object.position.copy(scaledRelative.add(this.pivot));
    snapshot.object.scale.copy(snapshot.originalScale);
    this.multiplyScaleAlongAxis(snapshot.object.scale, axis, factor);
  }

  /**
   * Multiplies a scale vector along the dominant axis components of a direction.
   * @param scale The scale vector to modify in place.
   * @param axis The normalized axis of scaling.
   * @param factor The multiplicative scale factor.
   */
  private multiplyScaleAlongAxis(
    scale: THREE.Vector3,
    axis: THREE.Vector3,
    factor: number
  ): void {
    const absX = Math.abs(axis.x);
    const absY = Math.abs(axis.y);
    const absZ = Math.abs(axis.z);
    if (absX >= absY && absX >= absZ) {
      scale.x = Math.max(0.01, scale.x * factor);
      return;
    }
    if (absY >= absX && absY >= absZ) {
      scale.y = Math.max(0.01, scale.y * factor);
      return;
    }
    scale.z = Math.max(0.01, scale.z * factor);
  }
}
