import * as THREE from 'three';
import { GizmoAxis, TransformMode } from '@/types/transform_mode.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { CommandStack } from '@/commands/command_stack.js';
import { TransformProjectionMath } from '@/transform/core/transform_projection_math.js';
import { transformModalConstrainTranslationDelta } from '@/transform/modal/transform_modal_delta_constrain.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';
import { TransformModalController } from '@/transform/modal/transform_modal_controller.js';
import type { TransformModalApplyHost } from '@/transform/modal/transform_modal_apply_host.js';
import { freeScaleAxisFactors } from '@/transform/core/free_scale_axis_factors.js';
import { resolveKeyboardAxisOrientation } from '@/transform/modal/transform_modal_axis_orientation.js';
import { transformModalAxisWorldVector } from '@/transform/modal/transform_modal_axis_vector.js';
import type { ComponentTransformVertex } from './component_transform_vertex.js';
import {
  applyComponentRotationDelta,
  applyComponentScaleDelta,
  applyComponentScaleDeltaInBasis,
  applyComponentTranslationDelta,
  restoreComponentTransformVertices,
} from './component_transform_apply.js';
import { CommandComponentPositions } from './command_component_positions.js';
import {
  applyComponentModalNumericValue,
  componentModalLockedScaleFactors,
} from './component_transform_modal_apply.js';
import type { SnapDragController } from '@/snap/session/snap_drag_controller.js';

/**
 * Drag session for Edit Mode component transforms. Reuses GridSnap and Blender
 * modal X/Y/Z + numeric typing for single-use G/R/S (same keyboard path as
 * object single-use tools).
 */
export class HandlerComponentTransform implements TransformModalApplyHost {
  private readonly gridSnap: GridSnap;
  private readonly commandStack: CommandStack | null;
  private readonly modalController: TransformModalController;
  private dragActive: boolean;
  private singleUse: boolean;
  private mode: TransformMode;
  private activeAxis: GizmoAxis;
  private orientation: THREE.Quaternion;
  private readonly scratchKeyboardOrientation: THREE.Quaternion;
  private vertices: ComponentTransformVertex[];
  private pivot: THREE.Vector3;
  private initialMouseWorld: THREE.Vector3 | null;
  private initialDistanceAlongAxis: number;
  private dragCamera: THREE.Camera | null;
  private dragPickElement: HTMLElement | null;
  private startClientX: number;
  private startClientY: number;
  private lastPointerWorldDelta: THREE.Vector3;
  private lastPointerRotationAngle: number;
  private lastPointerScaleFactor: number;
  private afterCommit: (() => void) | null;
  private afterLive: (() => void) | null;
  private statusCallback: ((text: string) => void) | null;
  private snapDrag: SnapDragController | null;
  private lastSampleClientX: number;
  private lastSampleClientY: number;

  /**
   * Creates a component transform handler.
   *
   * @param gridSnap Shared grid snap.
   * @param commandStack Undo stack, or null.
   */
  constructor(gridSnap: GridSnap, commandStack: CommandStack | null = null) {
    this.gridSnap = gridSnap;
    this.commandStack = commandStack;
    this.modalController = new TransformModalController();
    this.modalController.setHost(this);
    this.dragActive = false;
    this.singleUse = true;
    this.mode = TransformMode.TRANSLATE;
    this.activeAxis = GizmoAxis.VIEW;
    this.orientation = new THREE.Quaternion();
    this.scratchKeyboardOrientation = new THREE.Quaternion();
    this.vertices = [];
    this.pivot = new THREE.Vector3();
    this.initialMouseWorld = null;
    this.initialDistanceAlongAxis = 0;
    this.dragCamera = null;
    this.dragPickElement = null;
    this.startClientX = 0;
    this.startClientY = 0;
    this.lastPointerWorldDelta = new THREE.Vector3();
    this.lastPointerRotationAngle = 0;
    this.lastPointerScaleFactor = 1;
    this.afterCommit = null;
    this.afterLive = null;
    this.statusCallback = null;
    this.snapDrag = null;
    this.lastSampleClientX = 0;
    this.lastSampleClientY = 0;
  }

  /**
   * Attaches geometry snap used during component translation drags.
   *
   * @param snapDrag Drag snap controller, or null to clear.
   */
  setSnapDrag(snapDrag: SnapDragController | null): void {
    this.snapDrag = snapDrag;
  }

  /**
   * Sets a callback after successful commit for overlay refresh.
   *
   * @param callback Refresh callback.
   */
  setAfterCommitCallback(callback: (() => void) | null): void {
    this.afterCommit = callback;
  }

  /**
   * Sets a callback after each live pointer sample.
   *
   * @param callback Live refresh callback.
   */
  setAfterLiveCallback(callback: (() => void) | null): void {
    this.afterLive = callback;
  }

  /**
   * Sets a status-text publisher for modal axis/numeric feedback.
   *
   * @param callback Status callback, or null.
   */
  setStatusCallback(callback: ((text: string) => void) | null): void {
    this.statusCallback = callback;
  }

  /**
   * Routes Blender modal keys (X/Y/Z, digits, Enter, Escape) during a drag.
   *
   * @param event Browser keyboard event.
   * @returns True when consumed.
   */
  handleModalKeyDown(event: KeyboardEvent): boolean {
    return this.modalController.handleKeyDown(event);
  }

  /** @inheritdoc */
  isDragging(): boolean {
    return this.dragActive;
  }

  /**
   * Returns whether the active drag is a permanent gizmo handle session.
   *
   * @returns True for widget-driven handle drags.
   */
  isPermanentDrag(): boolean {
    return this.dragActive && !this.singleUse;
  }

  /** @inheritdoc */
  isSingleUseDrag(): boolean {
    return this.dragActive && this.singleUse;
  }

  /** @inheritdoc */
  getMode(): TransformMode {
    return this.mode;
  }

  /** @inheritdoc */
  getActiveAxis(): GizmoAxis | null {
    return this.activeAxis;
  }

  /** @inheritdoc */
  getOrientation(): THREE.Quaternion {
    return this.orientation.clone();
  }

  /** @inheritdoc */
  getDragObjects(): THREE.Object3D[] {
    return [];
  }

  /** @inheritdoc */
  getDragPivot(): THREE.Vector3 {
    return this.pivot.clone();
  }

  /** @inheritdoc */
  reapplyMouseDrivenTransform(): void {
    if (!this.dragActive) {
      return;
    }
    if (this.mode === TransformMode.TRANSLATE) {
      this.reapplyLastPointerTranslation();
      this.afterLive?.();
      return;
    }
    if (this.mode === TransformMode.ROTATE) {
      this.reapplyLastPointerRotation();
      this.afterLive?.();
      return;
    }
    this.reapplyLastPointerScale();
    this.afterLive?.();
  }

  /** @inheritdoc */
  applyNumericValue(value: number, axis: TransformModalAxis): boolean {
    if (!this.dragActive || this.vertices.length === 0) {
      return false;
    }
    const wasEnabled = this.gridSnap.isEnabled();
    this.gridSnap.setEnabled(false);
    try {
      const applied = applyComponentModalNumericValue(
        this.mode,
        this.vertices,
        this.pivot,
        value,
        axis,
        this.copyKeyboardAxisOrientation(),
        this.dragCamera,
      );
      if (applied) {
        this.afterLive?.();
      }
      return applied;
    } finally {
      this.gridSnap.setEnabled(wasEnabled);
    }
  }

  /** @inheritdoc */
  commitDrag(): void {
    this.commitIfNeeded();
  }

  /** @inheritdoc */
  cancelDrag(): void {
    this.cancelIfNeeded();
  }

  /** @inheritdoc */
  setConstraintLineAxis(_axis: TransformModalAxis): void {
    void _axis;
  }

  /** @inheritdoc */
  setStatusText(text: string): void {
    this.statusCallback?.(text);
  }

  /**
   * Begins a single-use component drag (G/R/S).
   *
   * @param mode Transform mode.
   * @param vertices Movable component vertices.
   * @param pivot World pivot.
   * @param camera Active camera.
   * @param pickElement Pick element.
   * @param clientX Start pointer X.
   * @param clientY Start pointer Y.
   * @returns True when started.
   */
  beginSingleUseDrag(
    mode: TransformMode,
    vertices: readonly ComponentTransformVertex[],
    pivot: THREE.Vector3,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    clientX: number,
    clientY: number,
  ): boolean {
    return this.beginDragSession(
      mode,
      GizmoAxis.VIEW,
      new THREE.Quaternion(),
      vertices,
      pivot,
      camera,
      pickElement,
      clientX,
      clientY,
      true,
    );
  }

  /**
   * Begins a permanent gizmo handle drag for the current component selection.
   *
   * @param mode Transform mode.
   * @param axis Picked gizmo axis.
   * @param orientation Gizmo world orientation.
   * @param vertices Movable component vertices.
   * @param pivot World pivot.
   * @param camera Active camera.
   * @param pickElement Pick element.
   * @param clientX Start pointer X.
   * @param clientY Start pointer Y.
   * @returns True when started.
   */
  beginGizmoHandleDrag(
    mode: TransformMode,
    axis: GizmoAxis,
    orientation: THREE.Quaternion,
    vertices: readonly ComponentTransformVertex[],
    pivot: THREE.Vector3,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    clientX: number,
    clientY: number,
  ): boolean {
    if (mode === TransformMode.BOUNDS) {
      return false;
    }
    return this.beginDragSession(
      mode,
      axis,
      orientation,
      vertices,
      pivot,
      camera,
      pickElement,
      clientX,
      clientY,
      false,
    );
  }

  /**
   * Applies pointer motion during a component drag.
   *
   * @param clientX Pointer X.
   * @param clientY Pointer Y.
   */
  applyPointerMove(clientX: number, clientY: number): void {
    if (!this.dragActive || !this.dragCamera || !this.dragPickElement) {
      return;
    }
    if (this.modalController.hasTypedValue()) {
      return;
    }
    if (this.mode === TransformMode.TRANSLATE) {
      this.applyTranslationPointer(clientX, clientY);
      this.afterLive?.();
      return;
    }
    if (this.mode === TransformMode.ROTATE) {
      this.applyRotationPointer(clientX, clientY);
      this.afterLive?.();
      return;
    }
    this.applyScalePointer(clientX, clientY);
    this.afterLive?.();
  }

  /** Commits the active drag into undo history. */
  commitIfNeeded(): void {
    if (!this.dragActive) {
      return;
    }
    if (this.commandStack && this.vertices.length > 0) {
      this.commandStack.recordExecuted(new CommandComponentPositions(this.vertices, this.afterCommit));
    }
    this.clearDragSession();
    this.afterCommit?.();
  }

  /** Cancels the active drag and restores initial positions. */
  cancelIfNeeded(): void {
    if (!this.dragActive) {
      return;
    }
    restoreComponentTransformVertices(this.vertices);
    this.clearDragSession();
    this.afterCommit?.();
  }

  /**
   * Starts a shared drag session for single-use or permanent handle paths.
   *
   * @param mode Transform mode.
   * @param axis Active axis.
   * @param orientation Gizmo orientation.
   * @param vertices Movable vertices.
   * @param pivot World pivot.
   * @param camera Camera.
   * @param pickElement Pick element.
   * @param clientX Pointer X.
   * @param clientY Pointer Y.
   * @param singleUse Whether this is G/R/S single-use.
   * @returns True when started.
   */
  private beginDragSession(
    mode: TransformMode,
    axis: GizmoAxis,
    orientation: THREE.Quaternion,
    vertices: readonly ComponentTransformVertex[],
    pivot: THREE.Vector3,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    clientX: number,
    clientY: number,
    singleUse: boolean,
  ): boolean {
    if (vertices.length === 0) {
      return false;
    }
    this.commitIfNeeded();
    this.dragActive = true;
    this.singleUse = singleUse;
    this.mode = mode;
    this.activeAxis = axis;
    this.orientation.copy(orientation);
    this.vertices = vertices.map((vertex) => ({
      ...vertex,
      initialLocal: vertex.initialLocal.clone(),
    }));
    this.pivot.copy(pivot);
    this.dragCamera = camera;
    this.dragPickElement = pickElement;
    this.startClientX = clientX;
    this.startClientY = clientY;
    this.lastSampleClientX = clientX;
    this.lastSampleClientY = clientY;
    this.lastPointerWorldDelta.set(0, 0, 0);
    this.lastPointerRotationAngle = 0;
    this.lastPointerScaleFactor = 1;
    this.captureInitialMouseSample(clientX, clientY);
    this.modalController.beginDrag();
    this.beginGeometrySnap(mode, camera, pickElement, clientX, clientY);
    return true;
  }

  /**
   * Captures the initial world mouse sample for absolute deltas.
   *
   * @param clientX Pointer X.
   * @param clientY Pointer Y.
   */
  private captureInitialMouseSample(clientX: number, clientY: number): void {
    const camera = this.dragCamera;
    const pickElement = this.dragPickElement;
    if (!camera || !pickElement) {
      this.initialMouseWorld = null;
      this.initialDistanceAlongAxis = 0;
      return;
    }
    const hit = projectClientToPivotPlane(camera, pickElement, clientX, clientY, this.pivot);
    this.initialMouseWorld = hit;
    this.initialDistanceAlongAxis = hit.distanceTo(this.pivot);
  }

  /** Clears drag bookkeeping after commit or cancel. */
  private clearDragSession(): void {
    this.snapDrag?.endTranslation();
    this.modalController.endDrag();
    this.dragActive = false;
    this.singleUse = true;
    this.vertices = [];
    this.initialMouseWorld = null;
    this.dragCamera = null;
    this.dragPickElement = null;
    this.activeAxis = GizmoAxis.VIEW;
    this.lastPointerWorldDelta.set(0, 0, 0);
    this.lastPointerRotationAngle = 0;
    this.lastPointerScaleFactor = 1;
    this.statusCallback?.('');
  }

  /**
   * Applies translation from pointer sample with modal/handle axis constraint.
   *
   * @param clientX Pointer X.
   * @param clientY Pointer Y.
   */
  private applyTranslationPointer(clientX: number, clientY: number): void {
    const camera = this.dragCamera;
    const pickElement = this.dragPickElement;
    if (!camera || !pickElement || !this.initialMouseWorld) {
      return;
    }
    const current = projectClientToPivotPlane(camera, pickElement, clientX, clientY, this.pivot);
    this.lastPointerWorldDelta.copy(current).sub(this.initialMouseWorld);
    this.lastSampleClientX = clientX;
    this.lastSampleClientY = clientY;
    this.applyConstrainedComponentTranslation(this.lastPointerWorldDelta);
  }

  /** Re-applies the last pointer translation with the current modal axis lock. */
  private reapplyLastPointerTranslation(): void {
    this.applyConstrainedComponentTranslation(this.lastPointerWorldDelta);
  }

  /**
   * Constrains a translation delta and writes it onto the component vertices.
   *
   * @param delta Unsnapped world delta. Not modified.
   */
  private applyConstrainedComponentTranslation(delta: THREE.Vector3): void {
    const constrained = this.constrainComponentTranslation(delta);
    const geometryDelta = this.resolveGeometryTranslation();
    if (geometryDelta) {
      applyComponentTranslationDelta(this.vertices, geometryDelta);
      return;
    }
    this.snapComponentTranslation(constrained);
    applyComponentTranslationDelta(this.vertices, constrained);
  }

  /**
   * Locks a component snap source when a translation drag starts.
   *
   * @param mode Drag mode.
   * @param camera Camera.
   * @param pickElement Viewport element.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   */
  private beginGeometrySnap(
    mode: TransformMode,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    clientX: number,
    clientY: number,
  ): void {
    if (mode !== TransformMode.TRANSLATE) {
      return;
    }
    this.snapDrag?.beginComponentTranslation(this.vertices, camera, pickElement, clientX, clientY);
  }

  /**
   * Resolves a geometry snap delta from the last pointer sample.
   *
   * @returns Geometry delta, or null when increment snap should run.
   */
  private resolveGeometryTranslation(): THREE.Vector3 | null {
    const camera = this.dragCamera;
    const pickElement = this.dragPickElement;
    if (!this.snapDrag || !camera || !pickElement) {
      return null;
    }
    return this.snapDrag.resolveTranslation({
      camera,
      pickElement,
      clientX: this.lastSampleClientX,
      clientY: this.lastSampleClientY,
      modalAxis: this.modalController.getAxis(),
      handleAxis: this.activeAxis,
      handleOrientation: this.orientation,
      keyboardOrientation: this.keyboardOrientationForLock(),
    });
  }

  /**
   * Projects a translation delta onto the keyboard lock or the active handle.
   *
   * @param delta Unsnapped world delta.
   * @returns Constrained world delta.
   */
  private constrainComponentTranslation(delta: THREE.Vector3): THREE.Vector3 {
    return transformModalConstrainTranslationDelta(
      delta,
      this.modalController.getAxis(),
      this.activeAxis,
      this.orientation,
      this.keyboardOrientationForLock(),
    );
  }

  /**
   * Returns the stored orientation when no keyboard lock is active.
   *
   * @returns Keyboard basis during a lock, otherwise the drag orientation.
   */
  private keyboardOrientationForLock(): THREE.Quaternion {
    if (this.modalController.getAxis() === TransformModalAxis.None) {
      return this.orientation;
    }
    return this.copyKeyboardAxisOrientation();
  }

  /**
   * Snaps a translation delta in place when snapping is enabled.
   *
   * @param delta World delta modified in place.
   */
  private snapComponentTranslation(delta: THREE.Vector3): void {
    if (this.gridSnap.isEnabled()) {
      this.gridSnap.snapVector3(delta);
    }
  }

  /**
   * Copies the quaternion keyboard X/Y/Z locks should use.
   *
   * @returns Scratch quaternion holding the keyboard basis.
   */
  private copyKeyboardAxisOrientation(): THREE.Quaternion {
    return resolveKeyboardAxisOrientation(this.gridSnap, this.orientation, this.scratchKeyboardOrientation);
  }

  /**
   * Applies rotation from pointer motion around the active or modal axis.
   *
   * @param clientX Pointer X.
   * @param clientY Pointer Y.
   */
  private applyRotationPointer(clientX: number, clientY: number): void {
    const camera = this.dragCamera;
    if (!camera) {
      return;
    }
    const axis = this.resolveEffectiveRotationAxisWorld(camera);
    let angle = this.computeRotationAngle(clientX, clientY, camera, axis);
    if (this.gridSnap.isEnabled()) {
      angle = this.gridSnap.snapAngleRadians(angle);
    }
    this.lastPointerRotationAngle = angle;
    applyComponentRotationDelta(this.vertices, this.pivot, axis, angle);
  }

  /** Re-applies the last pointer rotation with the current modal axis lock. */
  private reapplyLastPointerRotation(): void {
    const camera = this.dragCamera;
    if (!camera) {
      return;
    }
    const axis = this.resolveEffectiveRotationAxisWorld(camera);
    let angle = this.lastPointerRotationAngle;
    if (this.gridSnap.isEnabled()) {
      angle = this.gridSnap.snapAngleRadians(angle);
    }
    applyComponentRotationDelta(this.vertices, this.pivot, axis, angle);
  }

  /**
   * Applies scale from radial pointer motion about the pivot.
   *
   * @param clientX Pointer X.
   * @param clientY Pointer Y.
   */
  private applyScalePointer(clientX: number, clientY: number): void {
    const camera = this.dragCamera;
    const pickElement = this.dragPickElement;
    if (!camera || !pickElement) {
      return;
    }
    const factor = this.computeScaleFactor(clientX, clientY, camera, pickElement);
    this.lastPointerScaleFactor = factor;
    this.applyResolvedScale(factor, camera);
  }

  /** Re-applies the last pointer scale with the current modal axis lock. */
  private reapplyLastPointerScale(): void {
    const camera = this.dragCamera;
    if (!camera) {
      return;
    }
    let factor = this.lastPointerScaleFactor;
    if (this.gridSnap.isEnabled()) {
      factor = this.gridSnap.snapScaleFactor(factor);
    }
    this.applyResolvedScale(factor, camera);
  }

  /**
   * Resolves the world rotation axis from modal lock or free/handle axis.
   *
   * @param camera Active camera.
   * @returns Unit world axis.
   */
  private resolveEffectiveRotationAxisWorld(camera: THREE.Camera): THREE.Vector3 {
    const modalAxis = this.modalController.getAxis();
    if (modalAxis !== TransformModalAxis.None) {
      const locked = transformModalAxisWorldVector(modalAxis, this.copyKeyboardAxisOrientation());
      if (locked) {
        return locked;
      }
    }
    return this.resolveRotationAxisWorld(camera);
  }

  /**
   * Resolves the world rotation axis for the active handle or free rotate.
   *
   * @param camera Active camera.
   * @returns Unit world axis.
   */
  private resolveRotationAxisWorld(camera: THREE.Camera): THREE.Vector3 {
    if (this.activeAxis === GizmoAxis.VIEW) {
      return TransformProjectionMath.getCameraForwardDirection(camera);
    }
    if (this.activeAxis === GizmoAxis.X || this.activeAxis === GizmoAxis.Y || this.activeAxis === GizmoAxis.Z) {
      return TransformProjectionMath.axisToWorldVector(this.activeAxis, this.orientation);
    }
    return TransformProjectionMath.getCameraForwardDirection(camera);
  }

  /**
   * Computes a signed rotation angle from the drag start sample.
   *
   * @param clientX Pointer X.
   * @param clientY Pointer Y.
   * @param camera Camera.
   * @param axis Rotation axis.
   * @returns Angle in radians.
   */
  private computeRotationAngle(clientX: number, clientY: number, camera: THREE.Camera, axis: THREE.Vector3): number {
    if (this.activeAxis === GizmoAxis.VIEW || TransformProjectionMath.isAxisEdgeOn(camera, axis)) {
      const dx = clientX - this.startClientX;
      return dx * 0.01;
    }
    const pickElement = this.dragPickElement;
    if (!pickElement || !this.initialMouseWorld) {
      return 0;
    }
    const current = projectClientToPivotPlane(camera, pickElement, clientX, clientY, this.pivot);
    const initialDir = this.initialMouseWorld.clone().sub(this.pivot);
    const currentDir = current.clone().sub(this.pivot);
    if (initialDir.lengthSq() < 1e-8 || currentDir.lengthSq() < 1e-8) {
      return 0;
    }
    return signedAngleAroundAxis(initialDir.normalize(), currentDir.normalize(), axis);
  }

  /**
   * Computes a scale factor from radial distance ratio about the pivot.
   *
   * @param clientX Pointer X.
   * @param clientY Pointer Y.
   * @param camera Camera.
   * @param pickElement Pick element.
   * @returns Scale factor.
   */
  private computeScaleFactor(clientX: number, clientY: number, camera: THREE.Camera, pickElement: HTMLElement): number {
    if (this.initialDistanceAlongAxis < 1e-12) {
      const dy = this.startClientY - clientY;
      let factor = 1 + dy * 0.01;
      if (this.gridSnap.isEnabled()) {
        factor = this.gridSnap.snapScaleFactor(factor);
      }
      return Math.max(0.01, factor);
    }
    const hit = projectClientToPivotPlane(camera, pickElement, clientX, clientY, this.pivot);
    let factor = hit.distanceTo(this.pivot) / this.initialDistanceAlongAxis;
    if (this.gridSnap.isEnabled()) {
      factor = this.gridSnap.snapScaleFactor(factor);
    }
    return Math.max(0.01, factor);
  }

  /**
   * Applies free, modal-locked, or handle scale to the component vertices.
   *
   * @param factor Primary scale factor.
   * @param camera Camera for free-scale fallback.
   */
  private applyResolvedScale(factor: number, camera: THREE.Camera): void {
    const modalAxis = this.modalController.getAxis();
    if (modalAxis !== TransformModalAxis.None) {
      this.applyModalLockedScale(factor, modalAxis);
      return;
    }
    const scaleFactors = this.resolveHandleScaleFactors(factor, camera);
    applyComponentScaleDelta(this.vertices, this.pivot, scaleFactors);
  }

  /**
   * Scales vertices along the keyboard axis basis.
   *
   * @param factor Primary scale factor.
   * @param axis Locked modal axis.
   */
  private applyModalLockedScale(factor: number, axis: TransformModalAxis): void {
    const scaleFactors = componentModalLockedScaleFactors(factor, axis);
    const orientation = this.copyKeyboardAxisOrientation();
    applyComponentScaleDeltaInBasis(this.vertices, this.pivot, scaleFactors, orientation);
  }

  /**
   * Builds axis scale factors for handle or free scale.
   *
   * @param factor Primary scale factor.
   * @param camera Camera for free-scale fallback.
   * @returns Per-axis scale factors in world components.
   */
  private resolveHandleScaleFactors(factor: number, camera: THREE.Camera): THREE.Vector3 {
    if (this.activeAxis === GizmoAxis.X) {
      return new THREE.Vector3(factor, 1, 1);
    }
    if (this.activeAxis === GizmoAxis.Y) {
      return new THREE.Vector3(1, factor, 1);
    }
    if (this.activeAxis === GizmoAxis.Z) {
      return new THREE.Vector3(1, 1, factor);
    }
    return freeScaleAxisFactors(factor, camera, this.singleUse || this.activeAxis === GizmoAxis.VIEW);
  }
}

/**
 * Projects a client pointer onto the camera-facing plane through the pivot.
 *
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param clientX Client X.
 * @param clientY Client Y.
 * @param pivot Pivot on the plane.
 * @returns World point on the plane.
 */
function projectClientToPivotPlane(
  camera: THREE.Camera,
  pickElement: HTMLElement,
  clientX: number,
  clientY: number,
  pivot: THREE.Vector3,
): THREE.Vector3 {
  const rect = pickElement.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const plane = TransformProjectionMath.buildCameraPlane(camera, pivot);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, hit)) {
    return pivot.clone();
  }
  return hit;
}

/**
 * Returns the signed angle from initial to current around an axis.
 *
 * @param initialDir Normalized initial direction.
 * @param currentDir Normalized current direction.
 * @param axis Rotation axis.
 * @returns Signed angle in radians.
 */
function signedAngleAroundAxis(initialDir: THREE.Vector3, currentDir: THREE.Vector3, axis: THREE.Vector3): number {
  const cross = new THREE.Vector3().crossVectors(initialDir, currentDir);
  const sign = Math.sign(cross.dot(axis));
  const angle = Math.acos(Math.max(-1, Math.min(1, initialDir.dot(currentDir))));
  return angle * sign;
}
