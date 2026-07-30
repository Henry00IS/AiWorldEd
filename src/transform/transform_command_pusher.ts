import * as THREE from 'three';
import { TransformMode } from '../types/transform_mode.js';
import { TransformGizmo } from './gizmo/transform_gizmo.js';
import { TransformExecutor } from './transform_executor.js';
import { CommandStack } from '../commands/command_stack.js';
import { UndoCommand } from '../commands/undo_command.js';
import { TranslateCommand, ObjectTransformSnapshot } from '../commands/transform/translate_command.js';
import { RotateCommand, ObjectRotationSnapshot } from '../commands/transform/rotate_command.js';
import { ScaleCommand, ObjectScaleSnapshot } from '../commands/transform/scale_command.js';
import { BoundsResizeCommand, BoundsResizeSnapshot } from '../commands/transform/bounds_resize_command.js';
import { TextureLockedTransformCommand } from '../commands/transform/texture_locked_transform_command.js';
import { captureTransformTextureState } from '../commands/transform/transform_texture_state.js';
import { TransformDragSession } from './transform_drag_session.js';

/** Builds and pushes undo/redo commands after a completed transform drag. */
export class TransformCommandPusher {
  private session: TransformDragSession;
  private transformGizmo: TransformGizmo;
  private transformExecutor: TransformExecutor;
  private commandStack: CommandStack | null;

  /**
   * Creates a command pusher for transform undo support.
   *
   * @param session Shared drag session with pre-drag snapshots.
   * @param transformGizmo Gizmo used to read the active mode.
   * @param transformExecutor Executor used for snap queries.
   * @param commandStack Optional command stack; null disables undo pushes.
   */
  constructor(
    session: TransformDragSession,
    transformGizmo: TransformGizmo,
    transformExecutor: TransformExecutor,
    commandStack: CommandStack | null,
  ) {
    this.session = session;
    this.transformGizmo = transformGizmo;
    this.transformExecutor = transformExecutor;
    this.commandStack = commandStack;
  }

  /**
   * Pushes an appropriate undo command based on the current transform mode.
   *
   * @param pivot The transform pivot point.
   * @param selectedObjects The objects that were transformed.
   */
  pushUndoCommand(pivot: THREE.Vector3, selectedObjects: THREE.Object3D[]): void {
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
   *
   * @param selectedObjects Objects that were transformed.
   */
  private pushBoundsUndoCommand(selectedObjects: THREE.Object3D[]): void {
    if (this.session.isBoundsFaceMove) {
      this.pushTranslateCommand(selectedObjects);
      return;
    }
    if (this.session.isBoundsResize) {
      this.pushBoundsResizeCommand(selectedObjects);
    }
  }

  /**
   * Creates and pushes a bounds resize command from final object state.
   *
   * @param selectedObjects Objects that were resized.
   */
  private pushBoundsResizeCommand(selectedObjects: THREE.Object3D[]): void {
    const snapshots = this.buildBoundsResizeSnapshots(selectedObjects);
    const changed = snapshots.some((snapshot) => {
      const posChanged = snapshot.originalPosition.distanceToSquared(snapshot.finalPosition) > 1e-12;
      const scaleChanged = snapshot.originalScale.distanceToSquared(snapshot.finalScale) > 1e-12;
      return posChanged || scaleChanged;
    });
    if (!changed) return;
    this.pushTextureAwareCommand(new BoundsResizeCommand(snapshots), selectedObjects);
  }

  /**
   * Builds bounds resize snapshots with original and final transforms.
   *
   * @param selectedObjects Objects to snapshot.
   * @returns Snapshot array for BoundsResizeCommand.
   */
  private buildBoundsResizeSnapshots(selectedObjects: THREE.Object3D[]): BoundsResizeSnapshot[] {
    return selectedObjects.map((object) => {
      const originalPos = this.session.initialPositions.get(object);
      const originalScale = this.session.initialScales.get(object);
      return {
        object,
        originalPosition: originalPos ? originalPos.clone() : object.position.clone(),
        originalScale: originalScale ? originalScale.clone() : object.scale.clone(),
        finalPosition: object.position.clone(),
        finalScale: object.scale.clone(),
      };
    });
  }

  /**
   * Creates and pushes a translate command using actual final positions.
   *
   * @param selectedObjects The objects that were translated.
   */
  private pushTranslateCommand(selectedObjects: THREE.Object3D[]): void {
    const snapshots = this.buildPositionSnapshotsWithFinals(selectedObjects);
    const moved = snapshots.some((snapshot) => {
      if (!snapshot.finalPosition) return false;
      return snapshot.position.distanceToSquared(snapshot.finalPosition) > 1e-12;
    });
    if (!moved) return;
    const fallbackDelta = this.computeAverageDelta(snapshots);
    this.pushTextureAwareCommand(new TranslateCommand(snapshots, fallbackDelta), selectedObjects);
  }

  /**
   * Creates and pushes a rotate command using the final applied angle.
   *
   * @param pivot The rotation pivot point.
   * @param selectedObjects The objects that were rotated.
   */
  private pushRotateCommand(pivot: THREE.Vector3, selectedObjects: THREE.Object3D[]): void {
    const snappedAngle = this.transformExecutor.getGridSnap().snapAngleRadians(this.session.dragRotationAngle);
    if (Math.abs(snappedAngle) < 1e-8) return;
    const snapshots = this.buildRotationSnapshots(selectedObjects);
    const axisVector = this.session.activeAxis
      ? this.transformGizmo.axisToWorldVector(this.session.activeAxis)
      : new THREE.Vector3(0, 1, 0);
    this.pushTextureAwareCommand(new RotateCommand(snapshots, pivot, axisVector, snappedAngle), selectedObjects);
  }

  /**
   * Creates and pushes a scale command using the final applied factor.
   *
   * @param pivot The scale pivot point.
   * @param selectedObjects The objects that were scaled.
   */
  private pushScaleCommand(pivot: THREE.Vector3, selectedObjects: THREE.Object3D[]): void {
    const snappedFactor = this.transformExecutor.getGridSnap().snapScaleFactor(this.session.dragScaleFactor);
    if (Math.abs(snappedFactor - 1) < 1e-8) return;
    const snapshots = this.buildScaleSnapshots(selectedObjects);
    const axisVector = this.session.activeAxis
      ? this.transformGizmo.axisToWorldVector(this.session.activeAxis)
      : new THREE.Vector3(1, 0, 0);
    this.pushTextureAwareCommand(
      new ScaleCommand(snapshots, pivot, axisVector, snappedFactor, this.session.activeAxis ?? undefined),
      selectedObjects,
    );
  }

  /**
   * Pushes a pose command wrapped with before/after texture lock UV state.
   *
   * @param poseCommand Pose-only undo command.
   * @param selectedObjects Objects transformed in this drag.
   */
  private pushTextureAwareCommand(poseCommand: UndoCommand, selectedObjects: THREE.Object3D[]): void {
    const beforeTexture = this.session.initialTextureState;
    const afterTexture = captureTransformTextureState(this.collectMeshTargets(selectedObjects));
    const command = new TextureLockedTransformCommand(poseCommand, beforeTexture, afterTexture);
    this.commandStack?.push(command);
  }

  /**
   * Filters drag targets down to meshes for texture-lock capture.
   *
   * @param objects Drag targets.
   * @returns Mesh subset.
   */
  private collectMeshTargets(objects: readonly THREE.Object3D[]): THREE.Mesh[] {
    return objects.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
  }

  /**
   * Builds position snapshots including final positions after the drag.
   *
   * @param selectedObjects The objects to build snapshots for.
   * @returns Snapshots with original and final positions.
   */
  private buildPositionSnapshotsWithFinals(selectedObjects: THREE.Object3D[]): ObjectTransformSnapshot[] {
    return selectedObjects.map((object) => {
      const originalPos = this.session.initialPositions.get(object);
      return {
        object,
        position: originalPos ? originalPos.clone() : object.position.clone(),
        finalPosition: object.position.clone(),
      };
    });
  }

  /**
   * Computes an average delta for fallback TranslateCommand consumers.
   *
   * @param snapshots The position snapshots with finals.
   * @returns Average translation delta.
   */
  private computeAverageDelta(snapshots: ObjectTransformSnapshot[]): THREE.Vector3 {
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
   *
   * @param selectedObjects The objects to build snapshots for.
   * @returns An array of rotation snapshots.
   */
  private buildRotationSnapshots(selectedObjects: THREE.Object3D[]): ObjectRotationSnapshot[] {
    return selectedObjects.map((object) => {
      const originalPos = this.session.initialPositions.get(object);
      const originalQuat = this.session.initialQuaternions.get(object);
      return {
        object,
        originalPosition: originalPos ? originalPos.clone() : object.position.clone(),
        originalQuaternion: originalQuat ? originalQuat.clone() : object.quaternion.clone(),
      };
    });
  }

  /**
   * Builds scale snapshots including original scales.
   *
   * @param selectedObjects The objects to build snapshots for.
   * @returns An array of scale snapshots.
   */
  private buildScaleSnapshots(selectedObjects: THREE.Object3D[]): ObjectScaleSnapshot[] {
    return selectedObjects.map((object) => {
      const originalPos = this.session.initialPositions.get(object);
      const originalScale = this.session.initialScales.get(object);
      return {
        object,
        originalPosition: originalPos ? originalPos.clone() : object.position.clone(),
        originalScale: originalScale ? originalScale.clone() : object.scale.clone(),
      };
    });
  }
}
