import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { GizmoAxis } from '../types/transform_mode.js';

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
  private gizmoAxis: GizmoAxis;

  /**
   * Creates a new scale command.
   * @param snapshots The scale snapshots of all affected objects.
   * @param pivot The scale pivot point.
   * @param axis The scaling axis vector in world space.
   * @param factor The scale factor multiplier relative to original state.
   * @param gizmoAxis Local scale component the handle maps to.
   */
  constructor(
    snapshots: ObjectScaleSnapshot[],
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    factor: number,
    gizmoAxis: GizmoAxis = GizmoAxis.X
  ) {
    this.snapshots = snapshots;
    this.pivot = pivot.clone();
    this.axis = axis.clone();
    this.factor = factor;
    this.gizmoAxis = gizmoAxis;
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
   * @param axis The normalized world-space scale axis.
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
    this.multiplyLocalScaleComponent(snapshot.object.scale, factor);
  }

  /**
   * Multiplies the local scale component for the active gizmo axis.
   * @param scale Scale vector modified in place.
   * @param factor Multiplicative factor.
   */
  private multiplyLocalScaleComponent(
    scale: THREE.Vector3,
    factor: number
  ): void {
    if (this.gizmoAxis === GizmoAxis.X) {
      scale.x = Math.max(0.01, scale.x * factor);
      return;
    }
    if (this.gizmoAxis === GizmoAxis.Y) {
      scale.y = Math.max(0.01, scale.y * factor);
      return;
    }
    if (this.gizmoAxis === GizmoAxis.Z) {
      scale.z = Math.max(0.01, scale.z * factor);
      return;
    }
    scale.x = Math.max(0.01, scale.x * factor);
    scale.y = Math.max(0.01, scale.y * factor);
    scale.z = Math.max(0.01, scale.z * factor);
  }
}
