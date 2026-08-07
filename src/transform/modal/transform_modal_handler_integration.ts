import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis, TransformMode } from '@/types/transform_mode.js';
import type { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import type { TransformExecutor } from '@/transform/core/transform_executor.js';
import type { TransformDragSession } from '@/transform/core/session_transform_drag.js';
import { TransformModalAxis } from './transform_modal_axis.js';
import type { TransformModalApplyHost } from './transform_modal_apply_host.js';
import { TransformModalController } from './transform_modal_controller.js';
import { TransformModalConstraintLine } from './visual/transform_modal_constraint_line.js';
import { transformModalApplyTranslateNumeric } from './transform_modal_apply_translate.js';
import {
  transformModalApplyRotateNumeric,
  transformModalApplyRotateViewNumeric,
} from './transform_modal_apply_rotate.js';
import { transformModalApplyScaleFreeNumeric, transformModalApplyScaleNumeric } from './transform_modal_apply_scale.js';
import {
  transformModalApplyBoundsMoveNumeric,
  transformModalApplyBoundsResizeNumeric,
} from './transform_modal_apply_bounds.js';
import { resolveMinimumBoundsHalfExtent } from '@/transform/bounds/bounds_resize_math.js';
import { transformModalConstrainTranslationDelta } from './transform_modal_delta_constrain.js';
import { transformModalAxisWorldVector } from './transform_modal_axis_vector.js';
import { transformModalAxisToGizmoAxis } from './transform_modal_effective_axis.js';
import { freeScaleAxisFactors } from '@/transform/core/free_scale_axis_factors.js';

/** Callbacks for commit/cancel and live texture rebake during modal apply. */
export interface TransformModalHandlerIntegrationCallbacks {
  /** Commits the drag (undo push + clear). */
  commitDrag: () => void;
  /** Cancels the drag (restore snapshot + clear). */
  cancelDrag: () => void;
  /**
   * Rebakes locked textures after a modal pose change.
   *
   * @param objects Drag targets.
   * @param translationLike True for pose translation-like updates.
   * @param scaleLike True for scale/resize updates.
   */
  rebakeTextures: (objects: THREE.Object3D[], translationLike: boolean, scaleLike: boolean) => void;
  /**
   * Publishes modal status text.
   *
   * @param text Status label.
   */
  setStatusText: (text: string) => void;
  /** Re-runs the last pointer-driven path when typed input is cleared. */
  reapplyMouseDrivenTransform: () => void;
}

/**
 * Owns the modal controller and constraint line, and implements apply-host
 * methods for HandlerTransform without bloating the drag handler file.
 */
export class TransformModalHandlerIntegration implements TransformModalApplyHost {
  private readonly controller: TransformModalController;
  private readonly constraintLine: TransformModalConstraintLine;
  private readonly session: TransformDragSession;
  private readonly transformGizmo: GizmoTransform;
  private readonly transformExecutor: TransformExecutor;
  private callbacks: TransformModalHandlerIntegrationCallbacks | null;

  /**
   * Creates modal integration bound to a shared drag session and gizmo.
   *
   * @param theme Editor theme.
   * @param session Shared transform drag session.
   * @param transformGizmo Gizmo orchestrator.
   * @param transformExecutor Transform executor.
   */
  constructor(
    theme: typeof Theme,
    session: TransformDragSession,
    transformGizmo: GizmoTransform,
    transformExecutor: TransformExecutor,
  ) {
    this.session = session;
    this.transformGizmo = transformGizmo;
    this.transformExecutor = transformExecutor;
    this.controller = new TransformModalController();
    this.constraintLine = new TransformModalConstraintLine(theme);
    this.callbacks = null;
    this.attachConstraintLineToGizmo();
    this.controller.setHost(this);
  }

  /**
   * Wires commit/cancel/status callbacks from the transform handler.
   *
   * @param callbacks Integration callbacks.
   */
  setCallbacks(callbacks: TransformModalHandlerIntegrationCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Returns the modal controller for keyboard routing.
   *
   * @returns Modal controller.
   */
  getController(): TransformModalController {
    return this.controller;
  }

  /** Starts modal keyboard handling for a new drag. */
  beginDrag(): void {
    this.controller.beginDrag();
    this.session.modalAxisLock = TransformModalAxis.None;
  }

  /** Ends modal keyboard handling when the drag finishes. */
  endDrag(): void {
    this.controller.endDrag();
    this.session.modalAxisLock = TransformModalAxis.None;
    this.constraintLine.hide();
  }

  /**
   * Handles a keyboard event during an active drag.
   *
   * @param event Browser keyboard event.
   * @returns True when consumed.
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    return this.controller.handleKeyDown(event);
  }

  /**
   * Returns whether typed numeric input is driving the transform.
   *
   * @returns True when digits have been typed.
   */
  hasTypedValue(): boolean {
    return this.controller.hasTypedValue();
  }

  /**
   * Returns the current keyboard axis lock.
   *
   * @returns Modal axis enum.
   */
  getModalAxis(): TransformModalAxis {
    return this.controller.getAxis();
  }

  /**
   * Constrains a translation delta using the keyboard lock and handle axis.
   *
   * @param delta Unconstrained world delta.
   * @returns Constrained world delta.
   */
  constrainTranslationDelta(delta: THREE.Vector3): THREE.Vector3 {
    return transformModalConstrainTranslationDelta(
      delta,
      this.controller.getAxis(),
      this.session.activeAxis,
      this.transformGizmo.getOrientation(),
    );
  }

  /** @inheritdoc */
  isDragging(): boolean {
    return this.session.dragActive;
  }

  /** @inheritdoc */
  getMode(): TransformMode {
    return this.transformGizmo.getMode();
  }

  /** @inheritdoc */
  getActiveAxis(): GizmoAxis | null {
    return this.session.activeAxis;
  }

  /** @inheritdoc */
  isSingleUseDrag(): boolean {
    return this.session.isSingleUseDrag;
  }

  /** @inheritdoc */
  getOrientation(): THREE.Quaternion {
    return this.transformGizmo.getOrientation();
  }

  /** @inheritdoc */
  getDragObjects(): THREE.Object3D[] {
    return this.session.dragObjects;
  }

  /** @inheritdoc */
  getDragPivot(): THREE.Vector3 {
    return this.session.dragPivot.clone();
  }

  /** @inheritdoc */
  reapplyMouseDrivenTransform(): void {
    this.callbacks?.reapplyMouseDrivenTransform();
  }

  /** @inheritdoc */
  applyNumericValue(value: number, axis: TransformModalAxis): boolean {
    const objects = this.session.dragObjects;
    if (objects.length === 0) {
      return false;
    }
    return this.withExactNumericSnapDisabled(() => this.applyNumericValueForMode(value, axis, objects));
  }

  /**
   * Applies a typed value for the active transform mode.
   *
   * @param value Parsed numeric value.
   * @param axis Effective single axis, or None for free scale/rotate.
   * @param objects Drag targets.
   * @returns True when applied.
   */
  private applyNumericValueForMode(value: number, axis: TransformModalAxis, objects: THREE.Object3D[]): boolean {
    const mode = this.transformGizmo.getMode();
    if (mode === TransformMode.TRANSLATE) {
      return this.applyTranslateNumeric(value, axis, objects);
    }
    if (mode === TransformMode.ROTATE) {
      return this.applyRotateNumeric(value, axis, objects);
    }
    if (mode === TransformMode.SCALE) {
      return this.applyScaleNumeric(value, axis, objects);
    }
    return this.applyBoundsNumeric(value, axis, objects);
  }

  /**
   * Runs a typed numeric apply with grid/angle/scale snap disabled so the typed
   * value is exact.
   *
   * @param applyFn Apply callback.
   * @returns Result of the apply callback.
   */
  private withExactNumericSnapDisabled(applyFn: () => boolean): boolean {
    const gridSnap = this.transformExecutor.getGridSnap();
    const wasEnabled = gridSnap.isEnabled();
    gridSnap.setEnabled(false);
    try {
      return applyFn();
    } finally {
      gridSnap.setEnabled(wasEnabled);
    }
  }

  /** @inheritdoc */
  commitDrag(): void {
    this.callbacks?.commitDrag();
  }

  /** @inheritdoc */
  cancelDrag(): void {
    this.callbacks?.cancelDrag();
  }

  /** @inheritdoc */
  setConstraintLineAxis(axis: TransformModalAxis): void {
    this.session.modalAxisLock = axis;
    this.constraintLine.setAxis(axis);
  }

  /** @inheritdoc */
  setStatusText(text: string): void {
    this.callbacks?.setStatusText(text);
  }

  /** Releases constraint line resources. */
  dispose(): void {
    this.controller.setHost(null);
    this.constraintLine.dispose();
  }

  /**
   * Applies typed translation.
   *
   * @param value Typed distance.
   * @param axis Effective axis.
   * @param objects Drag targets.
   * @returns True when applied.
   */
  private applyTranslateNumeric(value: number, axis: TransformModalAxis, objects: THREE.Object3D[]): boolean {
    const ok = transformModalApplyTranslateNumeric(
      this.transformExecutor,
      objects,
      this.session.initialPositions,
      value,
      axis,
      this.transformGizmo.getOrientation(),
      this.session.dragDeltaAccumulator,
    );
    if (ok) {
      this.callbacks?.rebakeTextures(objects, true, false);
    }
    return ok;
  }

  /**
   * Applies typed rotation in degrees about a locked axis or free view axis.
   *
   * @param value Typed degrees.
   * @param axis Effective axis, or None for view-axis free rotate.
   * @param objects Drag targets.
   * @returns True when applied.
   */
  private applyRotateNumeric(value: number, axis: TransformModalAxis, objects: THREE.Object3D[]): boolean {
    const angleHolder = { radians: 0 };
    const ok =
      axis === TransformModalAxis.None
        ? this.applyRotateViewNumeric(value, objects, angleHolder)
        : transformModalApplyRotateNumeric(
            this.transformExecutor,
            objects,
            this.session.initialPositions,
            this.session.initialQuaternions,
            this.session.dragPivot,
            value,
            axis,
            this.transformGizmo.getOrientation(),
            angleHolder,
          );
    if (ok) {
      this.session.dragRotationAngle = angleHolder.radians;
      if (axis !== TransformModalAxis.None) {
        this.session.activeAxis = transformModalAxisToGizmoAxis(axis);
      }
      this.callbacks?.rebakeTextures(objects, true, false);
    }
    return ok;
  }

  /**
   * Applies typed free rotation about the active camera forward axis.
   *
   * @param value Typed degrees.
   * @param objects Drag targets.
   * @param angleHolder Holder for applied radians.
   * @returns True when applied.
   */
  private applyRotateViewNumeric(value: number, objects: THREE.Object3D[], angleHolder: { radians: number }): boolean {
    const camera = this.session.dragCamera;
    if (!camera) {
      return false;
    }
    return transformModalApplyRotateViewNumeric(
      this.transformExecutor,
      objects,
      this.session.initialPositions,
      this.session.initialQuaternions,
      this.session.dragPivot,
      value,
      camera,
      angleHolder,
    );
  }

  /**
   * Applies typed scale factor on a locked axis or free uniform/planar scale.
   *
   * @param value Typed factor.
   * @param axis Effective axis, or None for free scale.
   * @param objects Drag targets.
   * @returns True when applied.
   */
  private applyScaleNumeric(value: number, axis: TransformModalAxis, objects: THREE.Object3D[]): boolean {
    const factorHolder = { factor: 1 };
    const ok =
      axis === TransformModalAxis.None
        ? transformModalApplyScaleFreeNumeric(
            this.transformExecutor,
            objects,
            this.session.initialPositions,
            this.session.initialScales,
            this.session.dragPivot,
            value,
            this.session.dragCamera,
            this.session.isSingleUseDrag,
            factorHolder,
          )
        : transformModalApplyScaleNumeric(
            this.transformExecutor,
            objects,
            this.session.initialPositions,
            this.session.initialScales,
            this.session.dragPivot,
            value,
            axis,
            this.transformGizmo.getOrientation(),
            factorHolder,
          );
    if (ok) {
      this.session.dragScaleFactor = factorHolder.factor;
      if (axis !== TransformModalAxis.None) {
        this.session.activeAxis = transformModalAxisToGizmoAxis(axis);
      }
      this.callbacks?.rebakeTextures(objects, false, true);
    }
    return ok;
  }

  /**
   * Applies typed bounds move or resize.
   *
   * @param value Typed distance.
   * @param axis Effective axis.
   * @param objects Drag targets.
   * @returns True when applied.
   */
  private applyBoundsNumeric(value: number, axis: TransformModalAxis, objects: THREE.Object3D[]): boolean {
    if (this.session.isBoundsResize && this.session.activeBoundsFace && this.session.startBounds) {
      const gridSnap = this.transformExecutor.getGridSnap();
      const minHalfExtent = resolveMinimumBoundsHalfExtent(gridSnap.isEnabled(), gridSnap.getInterval());
      const ok = transformModalApplyBoundsResizeNumeric(
        objects,
        this.session.initialPositions,
        this.session.initialScales,
        this.session.startBounds,
        this.session.activeBoundsFace,
        value,
        minHalfExtent,
      );
      if (ok) {
        this.session.boundsDeltaAlongNormal = value;
        this.callbacks?.rebakeTextures(objects, false, true);
      }
      return ok;
    }
    const ok = transformModalApplyBoundsMoveNumeric(
      objects,
      this.session.initialPositions,
      value,
      axis,
      this.transformGizmo.getOrientation(),
      this.session.dragDeltaAccumulator,
    );
    if (ok) {
      this.callbacks?.rebakeTextures(objects, true, false);
    }
    return ok;
  }

  /** Parents the constraint line under the master gizmo handle group. */
  private attachConstraintLineToGizmo(): void {
    this.transformGizmo.getHandleGroup().add(this.constraintLine.getObject());
  }

  /**
   * Re-applies the last pointer translation sample with the current modal lock.
   *
   * @param objects Drag targets.
   */
  reapplyLastPointerTranslation(objects: THREE.Object3D[]): void {
    const constrained = this.constrainTranslationDelta(this.session.lastPointerWorldDelta);
    this.session.dragDeltaAccumulator.copy(constrained);
    this.transformExecutor.applyAbsoluteTranslation(objects, this.session.initialPositions, constrained);
    this.callbacks?.rebakeTextures(objects, true, false);
  }

  /**
   * Re-applies the last pointer rotation about the effective modal/handle axis.
   *
   * @param objects Drag targets.
   */
  reapplyLastPointerRotation(objects: THREE.Object3D[]): void {
    const axis = this.resolveRotationAxisWorld();
    if (!axis) {
      return;
    }
    const angle = this.session.lastPointerRotationAngle;
    this.session.dragRotationAngle = angle;
    this.transformExecutor.applyAbsoluteRotation(
      objects,
      this.session.initialPositions,
      this.session.initialQuaternions,
      this.session.dragPivot,
      axis,
      angle,
    );
    this.callbacks?.rebakeTextures(objects, true, false);
  }

  /**
   * Re-applies the last pointer scale factor (uniform free or
   * axis-constrained).
   *
   * @param objects Drag targets.
   */
  reapplyLastPointerScale(objects: THREE.Object3D[]): void {
    const factor = this.session.lastPointerScaleFactor;
    this.session.dragScaleFactor = factor;
    if (this.shouldReapplyUniformScale()) {
      this.reapplyFreeScaleFromLastPointer(objects, factor);
      return;
    }
    const axis = this.resolveRotationAxisWorld();
    const gizmoAxis = this.resolveScaleGizmoAxis();
    if (!axis || !gizmoAxis) {
      return;
    }
    this.transformExecutor.applyAbsoluteScale(
      objects,
      this.session.initialPositions,
      this.session.initialScales,
      this.session.dragPivot,
      axis,
      factor,
      gizmoAxis,
    );
    this.callbacks?.rebakeTextures(objects, false, true);
  }

  /**
   * Returns true when the last pointer scale was free uniform (no axis lock).
   *
   * @returns True for single-use free S or VIEW scale without modal lock.
   */
  private shouldReapplyUniformScale(): boolean {
    if (this.controller.getAxis() !== TransformModalAxis.None) {
      return false;
    }
    if (this.session.isSingleUseDrag) {
      return true;
    }
    if (!this.session.activeAxis || this.session.activeAxis === GizmoAxis.VIEW) {
      return true;
    }
    return false;
  }

  /**
   * Re-applies free scale from the last pointer sample (3D uniform or 2D
   * planar).
   *
   * @param objects Drag targets.
   * @param factor Radial scale factor.
   */
  private reapplyFreeScaleFromLastPointer(objects: THREE.Object3D[], factor: number): void {
    const axisFactors = freeScaleAxisFactors(factor, this.session.dragCamera, this.session.isSingleUseDrag);
    this.transformExecutor.applyAbsoluteFreeScale(
      objects,
      this.session.initialPositions,
      this.session.initialScales,
      this.session.dragPivot,
      axisFactors,
    );
    this.callbacks?.rebakeTextures(objects, false, true);
  }

  /**
   * Resolves the world axis for rotation/scale re-apply from modal lock or
   * handle.
   *
   * @returns Unit world axis, or null.
   */
  private resolveRotationAxisWorld(): THREE.Vector3 | null {
    const modalGizmo = this.resolveScaleGizmoAxis();
    if (!modalGizmo) {
      return null;
    }
    if (modalGizmo === GizmoAxis.X) {
      return transformModalAxisWorldVector(TransformModalAxis.X, this.transformGizmo.getOrientation());
    }
    if (modalGizmo === GizmoAxis.Y) {
      return transformModalAxisWorldVector(TransformModalAxis.Y, this.transformGizmo.getOrientation());
    }
    if (modalGizmo === GizmoAxis.Z) {
      return transformModalAxisWorldVector(TransformModalAxis.Z, this.transformGizmo.getOrientation());
    }
    return null;
  }

  /**
   * Resolves the gizmo axis enum for scale re-apply.
   *
   * @returns Single-axis gizmo axis, or null.
   */
  private resolveScaleGizmoAxis(): GizmoAxis | null {
    const modal = this.controller.getAxis();
    if (modal !== TransformModalAxis.None) {
      return transformModalAxisToGizmoAxis(modal);
    }
    const handle = this.session.activeAxis;
    if (handle === GizmoAxis.X || handle === GizmoAxis.Y || handle === GizmoAxis.Z) {
      return handle;
    }
    return null;
  }
}
