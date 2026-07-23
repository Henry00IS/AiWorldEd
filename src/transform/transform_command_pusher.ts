import * as THREE from 'three';
import { TransformMode } from '../types/transform_mode.js';
import { TransformGizmo } from './transform_gizmo.js';
import { TransformExecutor } from './transform_executor.js';
import { CommandStack } from '../commands/command_stack.js';
import { TranslateCommand, ObjectTransformSnapshot } from '../commands/translate_command.js';
import { RotateCommand, ObjectRotationSnapshot } from '../commands/rotate_command.js';
import { ScaleCommand, ObjectScaleSnapshot } from '../commands/scale_command.js';
import {
  BoundsResizeCommand,
  BoundsResizeSnapshot
} from '../commands/bounds_resize_command.js';
import { TransformDragSession } from './transform_drag_session.js';
import { TransformProjectionMath } from './transform_projection_math.js';

/**
 * Builds and pushes undo/redo commands after a completed transform drag.
 */
export class TransformCommandPusher {
  private session: TransformDragSession;
  private transformGizmo: TransformGizmo;
  private transformExecutor: TransformExecutor;
  private commandStack: CommandStack | null;

  /**
   * Creates a command pusher for transform undo support.
   * @param session Shared drag session with pre-drag snapshots.
   * @param transformGizmo Gizmo used to read the active mode.
   * @param transformExecutor Executor used for snap queries.
   * @param commandStack Optional command stack; null disables undo pushes.
   */
  constructor(
    session: TransformDragSession,
    transformGizmo: TransformGizmo,
    transformExecutor: TransformExecutor,
    commandStack: CommandStack | null
  ) {
    this.session = session;
    this.transformGizmo = transformGizmo;
    this.transformExecutor = transformExecutor;
    this.commandStack = commandStack;
  }

  /**
   * Pushes an appropriate undo command based on the current transform mode.
   * @param pivot The transform pivot point.
   * @param selectedObjects The meshes that were transformed.
   */
  pushUndoCommand(
    pivot: THREE.Vector3,
    selectedObjects: THREE.Mesh[]
  ): void {
    if (!this.commandStack) return;
    const mode = this.transformGizmo.getMode();
    if (mode === TransformMode.TRANSLATE) {
      this.pushTranslateCommand(selectedObjects);
    }
    if (mode === TransformMode.ROTATE) {
      this.pushRotateCommand(pivot, selectedObjects);
    }
    if (mode === TransformMode.SCALE) {
      this.pushScaleCommand(pivot, selectedObjects);
    }
    if (mode === TransformMode.BOUNDS) {
      this.pushBoundsUndoCommand(selectedObjects);
    }
  }

  /**
   * Pushes translate or bounds-resize undo depending on the active bounds drag.
   * @param selectedObjects Meshes that were transformed.
   */
  private pushBoundsUndoCommand(selectedObjects: THREE.Mesh[]): void {
    if (this.session.isBoundsFaceMove) {
      this.pushTranslateCommand(selectedObjects);
      return;
    }
    if (this.session.isBoundsResize) {
      this.pushBoundsResizeCommand(selectedObjects);
    }
  }

  /**
   * Creates and pushes a bounds resize command from final mesh state.
   * @param selectedObjects Meshes that were resized.
   */
  private pushBoundsResizeCommand(selectedObjects: THREE.Mesh[]): void {
    const snapshots = this.buildBoundsResizeSnapshots(selectedObjects);
    const changed = snapshots.some((snapshot) => {
      const posChanged =
        snapshot.originalPosition.distanceToSquared(snapshot.finalPosition) > 1e-12;
      const scaleChanged =
        snapshot.originalScale.distanceToSquared(snapshot.finalScale) > 1e-12;
      return posChanged || scaleChanged;
    });
    if (!changed) return;
    this.commandStack?.push(new BoundsResizeCommand(snapshots));
  }

  /**
   * Builds bounds resize snapshots with original and final transforms.
   * @param selectedObjects Meshes to snapshot.
   * @returns Snapshot array for BoundsResizeCommand.
   */
  private buildBoundsResizeSnapshots(
    selectedObjects: THREE.Mesh[]
  ): BoundsResizeSnapshot[] {
    return selectedObjects.map((mesh) => {
      const originalPos = this.session.initialPositions.get(mesh);
      const originalScale = this.session.initialScales.get(mesh);
      return {
        object: mesh,
        originalPosition: originalPos ? originalPos.clone() : mesh.position.clone(),
        originalScale: originalScale ? originalScale.clone() : mesh.scale.clone(),
        finalPosition: mesh.position.clone(),
        finalScale: mesh.scale.clone()
      };
    });
  }

  /**
   * Creates and pushes a translate command using actual final positions.
   * @param selectedObjects The meshes that were translated.
   */
  private pushTranslateCommand(selectedObjects: THREE.Mesh[]): void {
    const snapshots = this.buildPositionSnapshotsWithFinals(selectedObjects);
    const moved = snapshots.some((snapshot) => {
      if (!snapshot.finalPosition) return false;
      return snapshot.position.distanceToSquared(snapshot.finalPosition) > 1e-12;
    });
    if (!moved) return;
    const fallbackDelta = this.computeAverageDelta(snapshots);
    const command = new TranslateCommand(snapshots, fallbackDelta);
    this.commandStack?.push(command);
  }

  /**
   * Creates and pushes a rotate command using the final applied angle.
   * @param pivot The rotation pivot point.
   * @param selectedObjects The meshes that were rotated.
   */
  private pushRotateCommand(
    pivot: THREE.Vector3,
    selectedObjects: THREE.Mesh[]
  ): void {
    const snappedAngle = this.transformExecutor
      .getGridSnap()
      .snapAngleRadians(this.session.dragRotationAngle);
    if (Math.abs(snappedAngle) < 1e-8) return;
    const snapshots = this.buildRotationSnapshots(selectedObjects);
    const axisVector = this.session.activeAxis
      ? TransformProjectionMath.axisToWorldVector(
          this.session.activeAxis,
          this.transformGizmo.getOrientation()
        )
      : new THREE.Vector3(0, 1, 0);
    const command = new RotateCommand(
      snapshots,
      pivot,
      axisVector,
      snappedAngle
    );
    this.commandStack?.push(command);
  }

  /**
   * Creates and pushes a scale command using the final applied factor.
   * @param pivot The scale pivot point.
   * @param selectedObjects The meshes that were scaled.
   */
  private pushScaleCommand(
    pivot: THREE.Vector3,
    selectedObjects: THREE.Mesh[]
  ): void {
    const snappedFactor = this.transformExecutor
      .getGridSnap()
      .snapScaleFactor(this.session.dragScaleFactor);
    if (Math.abs(snappedFactor - 1) < 1e-8) return;
    const snapshots = this.buildScaleSnapshots(selectedObjects);
    const axisVector = this.session.activeAxis
      ? TransformProjectionMath.axisToWorldVector(
          this.session.activeAxis,
          this.transformGizmo.getOrientation()
        )
      : new THREE.Vector3(1, 0, 0);
    const command = new ScaleCommand(
      snapshots,
      pivot,
      axisVector,
      snappedFactor,
      this.session.activeAxis ?? undefined
    );
    this.commandStack?.push(command);
  }

  /**
   * Builds position snapshots including final positions after the drag.
   * @param selectedObjects The meshes to build snapshots for.
   * @returns Snapshots with original and final positions.
   */
  private buildPositionSnapshotsWithFinals(
    selectedObjects: THREE.Mesh[]
  ): ObjectTransformSnapshot[] {
    return selectedObjects.map((mesh) => {
      const originalPos = this.session.initialPositions.get(mesh);
      return {
        object: mesh,
        position: originalPos ? originalPos.clone() : mesh.position.clone(),
        finalPosition: mesh.position.clone()
      };
    });
  }

  /**
   * Computes an average delta for fallback TranslateCommand consumers.
   * @param snapshots The position snapshots with finals.
   * @returns Average translation delta.
   */
  private computeAverageDelta(
    snapshots: ObjectTransformSnapshot[]
  ): THREE.Vector3 {
    const delta = new THREE.Vector3();
    let count = 0;
    snapshots.forEach((snapshot) => {
      if (!snapshot.finalPosition) return;
      delta.add(snapshot.finalPosition.clone().sub(snapshot.position));
      count += 1;
    });
    if (count > 0) delta.multiplyScalar(1 / count);
    return delta;
  }

  /**
   * Builds rotation snapshots including original quaternions.
   * @param selectedObjects The meshes to build snapshots for.
   * @returns An array of rotation snapshots.
   */
  private buildRotationSnapshots(
    selectedObjects: THREE.Mesh[]
  ): ObjectRotationSnapshot[] {
    return selectedObjects.map((mesh) => {
      const originalPos = this.session.initialPositions.get(mesh);
      const originalQuat = this.session.initialQuaternions.get(mesh);
      return {
        object: mesh,
        originalPosition: originalPos
          ? originalPos.clone()
          : mesh.position.clone(),
        originalQuaternion: originalQuat
          ? originalQuat.clone()
          : mesh.quaternion.clone()
      };
    });
  }

  /**
   * Builds scale snapshots including original scales.
   * @param selectedObjects The meshes to build snapshots for.
   * @returns An array of scale snapshots.
   */
  private buildScaleSnapshots(
    selectedObjects: THREE.Mesh[]
  ): ObjectScaleSnapshot[] {
    return selectedObjects.map((mesh) => {
      const originalPos = this.session.initialPositions.get(mesh);
      const originalScale = this.session.initialScales.get(mesh);
      return {
        object: mesh,
        originalPosition: originalPos
          ? originalPos.clone()
          : mesh.position.clone(),
        originalScale: originalScale
          ? originalScale.clone()
          : mesh.scale.clone()
      };
    });
  }
}
