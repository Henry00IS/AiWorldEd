import * as THREE from 'three';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';
import { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { ControllerFaceExtrusion } from './controller_face_extrusion.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ControllerUvSmear } from '@/texture/controller/controller_uv_smear.js';
import { ControllerUvTransform } from '@/texture/interactive/controller_uv_transform.js';
import type { UvTransformMode } from '@/texture/interactive/uv_transform_mode.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { findPickSurfaceAtClientPoint } from '@/utils/pointer_client_hit.js';
import type { FacePickResult } from '@/selection/face/raycaster_face_selection.js';
import { computeRegionWorldNormal } from '@/texture/uv/planar_uv_projector.js';
import { expandFaceSelectionIndices } from '@/selection/face/solid_result_face_indices.js';

/** Keyboard code that enables continuous UV smear while held. */
const UV_SMEAR_KEY_CODE = 'KeyM';

/** Screen-space distance before an armed UV move becomes a drag. */
const UV_MOVE_DRAG_THRESHOLD_PX = 4;

/** Armed click that may become a UV move drag. */
interface ArmedUvMoveGesture {
  pick: FacePickResult;
  clientX: number;
  clientY: number;
  viewport: Viewport3D | Viewport2D;
}

/** Dependencies required to coordinate face selection and extrusion UI. */
export interface FaceModeCoordinatorDependencies {
  getViewports: () => Array<Viewport3D | Viewport2D>;
  getPrimaryScene: () => THREE.Scene;
  commandStack: CommandStack;
  gridSnap: GridSnap;
  worldObject: THREE.Group;
  selectionManager: ManagerSelection;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: HandlerKeyboardShortcut;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  updateShadingMeshes: () => void;
  refreshOutliner: () => void;
  onSelectionModeUiChanged?: (mode: SelectionMode) => void;
  /** Optional UV editor field refresh after interactive UV edits. */
  refreshUvEditorFromSelection?: () => void;
}

/** Coordinates face selection mode, drag-paint, UV smear, and UV transform. */
export class CoordinatorFaceMode {
  private deps: FaceModeCoordinatorDependencies;
  private faceExtrusionController: ControllerFaceExtrusion;
  private uvSmearController: ControllerUvSmear;
  private uvTransformController: ControllerUvTransform;
  private selectionMode: SelectionMode;
  private activeDragViewport: Viewport3D | Viewport2D | null;
  private dragOwnerWindow: Window | null;
  private windowPointerMoveListener: ((event: PointerEvent) => void) | null;
  private windowPointerUpListener: ((event: PointerEvent) => void) | null;
  private isSmearStrokeLive: boolean;
  private armedUvMove: ArmedUvMoveGesture | null;
  private lastStatusFaceCount: number;
  private dragPickFrame: number;
  private pendingDragEvent: PointerEvent | null;
  private userSnapEnabledAtSessionStart: boolean;
  private uvTransformOwnedByDrag: boolean;

  /**
   * Creates the coordinator, initializes controllers and drag state, and binds
   * selection callbacks.
   *
   * @param deps Dependencies required for face selection and extrusion.
   */
  constructor(deps: FaceModeCoordinatorDependencies) {
    this.deps = deps;
    this.selectionMode = SelectionMode.OBJECT;
    this.faceExtrusionController = this.createFaceExtrusionController();
    this.uvSmearController = new ControllerUvSmear(deps.commandStack);
    this.uvTransformController = new ControllerUvTransform(deps.commandStack, deps.gridSnap);
    this.activeDragViewport = null;
    this.dragOwnerWindow = null;
    this.windowPointerMoveListener = null;
    this.windowPointerUpListener = null;
    this.isSmearStrokeLive = false;
    this.armedUvMove = null;
    this.lastStatusFaceCount = -1;
    this.dragPickFrame = 0;
    this.pendingDragEvent = null;
    this.userSnapEnabledAtSessionStart = deps.gridSnap.isEnabled();
    this.uvTransformOwnedByDrag = false;
    this.bindFaceSelectionCallbacks();
    this.updateSelectionModeStatus();
  }

  /** Enters face selection mode. */
  enterFaceSelectionModeFromTool(): void {
    this.faceExtrusionController.setSelectionMode(SelectionMode.FACE);
  }

  /** Leaves face selection mode and returns to object selection mode. */
  leaveFaceSelectionModeFromTool(): void {
    this.cancelUvTransformIfActive();
    this.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
  }

  /**
   * Starts face pick, UV move arm, paint, or smear at a client point.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param isShiftPressed True for additive selection.
   * @param isCtrlPressed True for subtractive selection.
   * @param ownerDocument Document that owns the client coordinates, or null.
   * @returns True when face mode consumed the press.
   */
  beginFaceSelectPointerDown(
    clientX: number,
    clientY: number,
    isShiftPressed: boolean,
    isCtrlPressed: boolean,
    ownerDocument: Document | null = null,
  ): boolean {
    if (this.faceExtrusionController.getSelectionMode() !== SelectionMode.FACE) {
      return false;
    }
    const viewport = this.findViewportAtClientPoint(clientX, clientY, ownerDocument);
    if (!viewport) {
      return false;
    }
    const event = this.createSyntheticMouseEvent(clientX, clientY);
    return this.onViewportFacePointerDown(event, viewport, isShiftPressed, isCtrlPressed);
  }

  /**
   * Continues face paint, UV smear, or UV transform while the pointer moves.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param buttons PointerEvent.buttons bitfield.
   */
  continueFaceSelectPointerMove(clientX: number, clientY: number, buttons: number): void {
    if (!this.activeDragViewport) {
      return;
    }
    const event = this.createSyntheticPointerMove(clientX, clientY, buttons);
    this.onWindowPointerMove(event);
  }

  /** Ends face paint, UV smear, or UV transform. */
  endFaceSelectPointerUp(): void {
    this.onWindowPointerUp();
  }

  /**
   * Returns whether a face paint, UV smear, or drag-owned UV transform stroke
   * is live. Single-use G/R/S sessions are owned by the UV tool, not this busy
   * flag.
   *
   * @returns True while stroke tracking is active.
   */
  isFaceSelectStrokeActive(): boolean {
    const uvDragActive = this.uvTransformController.isActive() && this.uvTransformOwnedByDrag;
    return this.activeDragViewport !== null || this.isSmearStrokeLive || uvDragActive || this.armedUvMove !== null;
  }

  /**
   * Returns whether an interactive UV transform session is live.
   *
   * @returns True during UV move/rotate/scale.
   */
  isUvTransformActive(): boolean {
    return this.uvTransformController.isActive();
  }

  /**
   * Returns the face extrusion controller.
   *
   * @returns The ControllerFaceExtrusion instance.
   */
  getFaceExtrusionController(): ControllerFaceExtrusion {
    return this.faceExtrusionController;
  }

  /**
   * Returns the current selection mode.
   *
   * @returns The active SelectionMode value.
   */
  getSelectionMode(): SelectionMode {
    return this.selectionMode;
  }

  /**
   * Begins a single-use UV transform from the pointer (G/R/S).
   *
   * @param mode Move, rotate, or scale.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Active camera.
   * @param pickElement Pick element.
   * @returns True when the session started.
   */
  beginSingleUseUvTransform(
    mode: UvTransformMode,
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    pickElement: HTMLElement,
  ): boolean {
    const selections = this.faceExtrusionController.getSelectedFaces();
    if (selections.length === 0) {
      this.deps.showStatusMessage('Select faces first, then G/R/S to edit UVs');
      return false;
    }
    const start = this.resolveUvTransformStart(clientX, clientY, camera, pickElement);
    if (!start) {
      this.deps.showStatusMessage('Could not resolve a UV transform plane');
      return false;
    }
    this.userSnapEnabledAtSessionStart = this.deps.gridSnap.isEnabled();
    this.uvTransformOwnedByDrag = false;
    const started = this.uvTransformController.begin({
      mode,
      selections,
      worldStart: start.worldStart,
      planeNormal: start.planeNormal,
      snapEnabled: this.userSnapEnabledAtSessionStart,
      camera,
    });
    if (!started) {
      return false;
    }
    this.deps.showStatusMessage(this.describeUvTransformMode(mode));
    return true;
  }

  /**
   * Updates a live single-use UV transform from the pointer.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Active camera.
   * @param pickElement Pick element.
   * @param isShiftPressed When true, disables snap for this sample.
   */
  updateSingleUseUvTransform(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    isShiftPressed: boolean,
  ): void {
    if (!this.uvTransformController.isActive()) {
      return;
    }
    this.uvTransformController.setSnapEnabled(this.userSnapEnabledAtSessionStart && !isShiftPressed);
    if (this.uvTransformController.updateFromClientPoint(clientX, clientY, camera, pickElement)) {
      this.deps.updateShadingMeshes();
    }
  }

  /**
   * Commits a live single-use UV transform.
   *
   * @returns True when a command was pushed.
   */
  endSingleUseUvTransform(): boolean {
    if (!this.uvTransformController.isActive()) {
      return false;
    }
    const committed = this.uvTransformController.end();
    this.uvTransformOwnedByDrag = false;
    this.deps.updateShadingMeshes();
    this.deps.refreshUvEditorFromSelection?.();
    if (committed) {
      this.deps.showStatusMessage('UV transform applied');
    }
    return committed;
  }

  /** Cancels a live single-use or drag UV transform and restores state. */
  cancelUvTransformIfActive(): void {
    if (!this.uvTransformController.isActive()) {
      this.armedUvMove = null;
      this.uvTransformOwnedByDrag = false;
      return;
    }
    this.uvTransformController.cancel();
    this.armedUvMove = null;
    this.uvTransformOwnedByDrag = false;
    this.deps.updateShadingMeshes();
    this.deps.showStatusMessage('UV transform cancelled');
  }

  /**
   * Extrudes currently selected faces by the default snap distance, or shows
   * guidance when face mode is inactive or no faces are selected.
   */
  onExtrudeFaces(): void {
    if (this.faceExtrusionController.getSelectionMode() !== SelectionMode.FACE) {
      this.faceExtrusionController.setSelectionMode(SelectionMode.FACE);
      this.deps.showStatusMessage('Face mode: drag faces to select, G/R/S for UVs, Extrude (Shift+E)');
      return;
    }
    if (this.faceExtrusionController.getSelectedFaceCount() === 0) {
      this.deps.showStatusMessage('Select a face first, then Extrude (Shift+E)');
      return;
    }
    const createdMeshes = this.faceExtrusionController.extrudeSelectedFacesByDefaultDistance();
    if (createdMeshes.length === 0) {
      this.deps.showStatusMessage('Extrude failed — select one or more faces');
      return;
    }
    this.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.deps.syncPrimitivesToViewports();
    this.updateFaceSelectionMeshes();
    this.deps.updateShadingMeshes();
    this.deps.refreshOutliner();
    this.deps.selectionManager.setSelection(createdMeshes);
    this.updateSelectionModeStatus();
    this.deps.showStatusMessage(this.buildExtrudeStatusLabel(createdMeshes));
  }

  /**
   * Builds a status label describing extrude products (meshes and/or brushes).
   *
   * @param createdMeshes Meshes created by extrude.
   * @returns Status string.
   */
  /**
   * Builds a status label describing extrude products (meshes and/or brushes).
   *
   * @param createdMeshes Selectable meshes to describe in the label.
   * @returns Human-readable status string.
   */
  private buildExtrudeStatusLabel(createdMeshes: THREE.Mesh[]): string {
    if (createdMeshes.length === 1) {
      const mesh = createdMeshes[0]!;
      const kind = SolidBrushVisual.isBrushObject(mesh) ? 'brush' : 'mesh';
      return `Created ${kind} ${mesh.name}`;
    }
    const brushCount = createdMeshes.filter((mesh) => SolidBrushVisual.isBrushObject(mesh)).length;
    const meshCount = createdMeshes.length - brushCount;
    if (brushCount > 0 && meshCount > 0) {
      return `Created ${brushCount} brush(es) and ${meshCount} mesh(es)`;
    }
    if (brushCount > 0) {
      return `Created ${brushCount} brush(es)`;
    }
    return `Created ${createdMeshes.length} convex solids`;
  }

  /**
   * Updates the available meshes for face selection from the world object.
   * Object-mode face select only targets solid CSG results (brush surfaces).
   * Free content meshes are never face-selected here; mesh faces are selected
   * only in Edit Mode.
   */
  updateFaceSelectionMeshes(): void {
    const meshes: THREE.Mesh[] = [];
    this.deps.worldObject.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (SolidBrushVisual.shouldSkipFacePick(child)) return;
      if (!SolidModel.isResultMesh(child)) return;
      meshes.push(child);
    });
    this.faceExtrusionController.setAvailableMeshes(meshes);
  }

  /**
   * Maps an outliner hierarchy pick to face selection while face mode is
   * active. Plain click replaces, Shift adds, Ctrl removes.
   *
   * @param hierarchyObject Clicked outliner object.
   * @param isShiftPressed Additive when true.
   * @param isCtrlPressed Subtractive when true.
   * @returns True when face mode consumed the pick.
   */
  applyOutlinerHierarchyFaceSelection(
    hierarchyObject: THREE.Object3D,
    isShiftPressed: boolean,
    isCtrlPressed: boolean,
  ): boolean {
    return this.faceExtrusionController.applyOutlinerHierarchyFaceSelection(
      hierarchyObject,
      isShiftPressed,
      isCtrlPressed,
    );
  }

  /**
   * Returns meshes currently allowed for face picking.
   *
   * @returns Face-pickable mesh list.
   */
  getFacePickableMeshesForTesting(): THREE.Mesh[] {
    return this.faceExtrusionController.getAvailableMeshesForTesting();
  }

  /**
   * Creates a new face extrusion controller.
   *
   * @returns A configured ControllerFaceExtrusion instance.
   */
  private createFaceExtrusionController(): ControllerFaceExtrusion {
    return new ControllerFaceExtrusion(
      this.deps.getPrimaryScene(),
      this.deps.commandStack,
      this.deps.gridSnap,
      this.deps.worldObject,
    );
  }

  /** Binds callbacks between the face controller and keyboard shortcuts. */
  private bindFaceSelectionCallbacks(): void {
    this.faceExtrusionController.setModeChangedCallback((mode) => this.onSelectionModeChanged(mode));
    this.deps.keyboardShortcutHandler.setOnSelectionModeToggle((mode) => this.onSelectionModeToggle(mode));
    this.deps.keyboardShortcutHandler.setOnExtrudeFaces(() => this.onExtrudeFaces());
  }

  /** Placeholder that performs no work. */
  rebindViewportFaceCallbacks(): void {}

  /**
   * Handles face selection pointer down. Arms UV move on selected faces, or
   * starts paint / smear strokes.
   *
   * @param event The pointer event (coordinates only; modifiers are explicit).
   * @param viewport The viewport that received the event.
   * @param isShiftPressed True for additive selection.
   * @param isCtrlPressed True for subtractive selection.
   * @returns True if the event was consumed by face selection.
   */
  private onViewportFacePointerDown(
    event: MouseEvent,
    viewport: Viewport3D | Viewport2D,
    isShiftPressed: boolean,
    isCtrlPressed: boolean,
  ): boolean {
    if (this.faceExtrusionController.getSelectionMode() !== SelectionMode.FACE) {
      return false;
    }
    const camera = viewport.getCamera();
    const pickElement = viewport.getContentElement();
    if (this.tryArmUvMoveOnSelectedFace(event, viewport, camera, pickElement, isShiftPressed, isCtrlPressed)) {
      this.beginWindowDragTracking(viewport);
      return true;
    }
    return this.beginPaintOrSmearStroke(event, viewport, camera, pickElement, isShiftPressed, isCtrlPressed);
  }

  /**
   * Arms a UV move when the user presses on an already selected face without
   * selection modifiers.
   *
   * @param event Pointer event.
   * @param viewport Owning viewport.
   * @param camera Viewport camera.
   * @param pickElement Pick element.
   * @param isShiftPressed Additive modifier.
   * @param isCtrlPressed Subtractive modifier.
   * @returns True when UV move was armed.
   */
  private tryArmUvMoveOnSelectedFace(
    event: MouseEvent,
    viewport: Viewport3D | Viewport2D,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    isShiftPressed: boolean,
    isCtrlPressed: boolean,
  ): boolean {
    if (isShiftPressed || isCtrlPressed || this.isUvSmearKeyHeld()) {
      return false;
    }
    const pick = this.faceExtrusionController.pickFaceAtPointer(event, camera, pickElement);
    if (!pick) {
      return false;
    }
    if (!this.faceExtrusionController.isFaceSelected(pick.mesh, pick.faceIndex)) {
      return false;
    }
    this.armedUvMove = {
      pick,
      clientX: event.clientX,
      clientY: event.clientY,
      viewport,
    };
    return true;
  }

  /**
   * Starts face paint and optional UV smear on pointer down.
   *
   * @param event Pointer event.
   * @param viewport Owning viewport.
   * @param camera Viewport camera.
   * @param pickElement Pick element.
   * @param isShiftPressed Additive selection.
   * @param isCtrlPressed Subtractive selection.
   * @returns True when consumed.
   */
  private beginPaintOrSmearStroke(
    event: MouseEvent,
    viewport: Viewport3D | Viewport2D,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    isShiftPressed: boolean,
    isCtrlPressed: boolean,
  ): boolean {
    const smearHeld = this.isUvSmearKeyHeld();
    const pick = this.faceExtrusionController.onPointerDown(event, camera, pickElement, isShiftPressed, isCtrlPressed);
    if (smearHeld && pick) {
      this.uvSmearController.beginStroke(pick.mesh, pick.faceIndex);
      this.isSmearStrokeLive = true;
      this.deps.updateShadingMeshes();
      this.deps.showStatusMessage('Smearing UVs — drag across faces, release to finish');
    }
    this.beginWindowDragTracking(viewport);
    this.updateSelectionModeStatus();
    return true;
  }

  /**
   * Registers window listeners so face drag continues outside the canvas.
   *
   * @param viewport Viewport that started the drag.
   */
  private beginWindowDragTracking(viewport: Viewport3D | Viewport2D): void {
    this.endWindowDragTracking();
    this.activeDragViewport = viewport;
    this.windowPointerMoveListener = (event) => {
      this.onWindowPointerMove(event);
    };
    this.windowPointerUpListener = () => {
      this.onWindowPointerUp();
    };
    const content = viewport.getContentElement?.() as HTMLElement | undefined;
    const ownerWindow = content?.ownerDocument?.defaultView ?? window;
    this.dragOwnerWindow = ownerWindow;
    ownerWindow.addEventListener('pointermove', this.windowPointerMoveListener);
    ownerWindow.addEventListener('pointerup', this.windowPointerUpListener);
    ownerWindow.addEventListener('pointercancel', this.windowPointerUpListener);
  }

  /** Removes window drag listeners. */
  private endWindowDragTracking(): void {
    const ownerWindow = this.dragOwnerWindow ?? window;
    if (this.windowPointerMoveListener) {
      ownerWindow.removeEventListener('pointermove', this.windowPointerMoveListener);
      this.windowPointerMoveListener = null;
    }
    if (this.windowPointerUpListener) {
      ownerWindow.removeEventListener('pointerup', this.windowPointerUpListener);
      ownerWindow.removeEventListener('pointercancel', this.windowPointerUpListener);
      this.windowPointerUpListener = null;
    }
    this.dragOwnerWindow = null;
    this.activeDragViewport = null;
  }

  /**
   * Continues face selection drag, UV move, and optional UV smear while the
   * button is held. Coalesces to one pick per animation frame.
   *
   * @param event Window pointer move event.
   */
  private onWindowPointerMove(event: PointerEvent): void {
    if ((event.buttons & 1) === 0) {
      this.onWindowPointerUp();
      return;
    }
    this.pendingDragEvent = event;
    if (this.dragPickFrame !== 0) return;
    this.dragPickFrame = requestAnimationFrame(() => {
      this.dragPickFrame = 0;
      this.processPendingDragPick();
    });
  }

  /** Runs one coalesced face drag pick from the latest pointer sample. */
  private processPendingDragPick(): void {
    const viewport = this.activeDragViewport;
    const event = this.pendingDragEvent;
    this.pendingDragEvent = null;
    if (!viewport || !event) return;
    if ((event.buttons & 1) === 0) {
      this.onWindowPointerUp();
      return;
    }
    if (this.processArmedOrActiveUvMove(event, viewport)) {
      return;
    }
    this.processPaintOrSmearDrag(event, viewport);
  }

  /**
   * Advances an armed or active UV move from a pointer sample.
   *
   * @param event Pointer event.
   * @param viewport Active viewport.
   * @returns True when the sample was consumed by UV move.
   */
  private processArmedOrActiveUvMove(event: PointerEvent, viewport: Viewport3D | Viewport2D): boolean {
    if (this.uvTransformController.isActive()) {
      this.updateDragUvTransform(event, viewport);
      return true;
    }
    if (!this.armedUvMove) {
      return false;
    }
    if (!this.hasExceededUvMoveThreshold(event.clientX, event.clientY)) {
      return true;
    }
    this.beginArmedUvMoveSession();
    this.updateDragUvTransform(event, viewport);
    return true;
  }

  /**
   * Continues face paint or UV smear drag.
   *
   * @param event Pointer event.
   * @param viewport Active viewport.
   */
  private processPaintOrSmearDrag(event: PointerEvent, viewport: Viewport3D | Viewport2D): void {
    const camera = viewport.getCamera();
    const pickElement = viewport.getContentElement();
    const pick = this.faceExtrusionController.onPointerMove(event, camera, pickElement);
    if (pick && (this.isSmearStrokeLive || this.isUvSmearKeyHeld())) {
      if (!this.isSmearStrokeLive) {
        this.uvSmearController.beginStroke(pick.mesh, pick.faceIndex);
        this.isSmearStrokeLive = true;
      } else {
        this.uvSmearController.continueStroke(pick.mesh, pick.faceIndex);
      }
      this.deps.updateShadingMeshes();
    }
    this.updateSelectionModeStatus();
  }

  /**
   * Returns whether the pointer moved past the UV move drag threshold.
   *
   * @param clientX Current client X.
   * @param clientY Current client Y.
   * @returns True when drag should begin.
   */
  private hasExceededUvMoveThreshold(clientX: number, clientY: number): boolean {
    if (!this.armedUvMove) {
      return false;
    }
    const dx = clientX - this.armedUvMove.clientX;
    const dy = clientY - this.armedUvMove.clientY;
    return Math.hypot(dx, dy) >= UV_MOVE_DRAG_THRESHOLD_PX;
  }

  /** Starts a UV move session from the armed selected-face gesture. */
  private beginArmedUvMoveSession(): void {
    if (!this.armedUvMove) {
      return;
    }
    const { pick } = this.armedUvMove;
    this.userSnapEnabledAtSessionStart = this.deps.gridSnap.isEnabled();
    this.uvTransformOwnedByDrag = true;
    this.uvTransformController.begin({
      mode: 'move',
      selections: this.faceExtrusionController.getSelectedFaces(),
      worldStart: pick.hitPoint.clone(),
      planeNormal: pick.faceNormal.clone(),
      snapEnabled: this.userSnapEnabledAtSessionStart,
    });
    this.armedUvMove = null;
    this.deps.showStatusMessage('Sliding UVs — release to apply, Shift for free move');
  }

  /**
   * Updates a live UV transform during a mouse-button drag.
   *
   * @param event Pointer event.
   * @param viewport Active viewport.
   */
  private updateDragUvTransform(event: PointerEvent, viewport: Viewport3D | Viewport2D): void {
    const shiftHeld =
      this.deps.keyboardShortcutHandler.isKeyDown('ShiftLeft') ||
      this.deps.keyboardShortcutHandler.isKeyDown('ShiftRight');
    this.uvTransformController.setSnapEnabled(this.userSnapEnabledAtSessionStart && !shiftHeld);
    const camera = viewport.getCamera();
    const pickElement = viewport.getContentElement();
    if (this.uvTransformController.updateFromClientPoint(event.clientX, event.clientY, camera, pickElement)) {
      this.deps.updateShadingMeshes();
    }
  }

  /** Ends face drag-paint, UV move, and commits any UV smear stroke. */
  private onWindowPointerUp(): void {
    if (this.dragPickFrame !== 0) {
      cancelAnimationFrame(this.dragPickFrame);
      this.dragPickFrame = 0;
    }
    this.pendingDragEvent = null;
    this.finishArmedUvClickIfNeeded();
    this.finishUvTransformDragIfNeeded();
    this.faceExtrusionController.onPointerUp();
    if (this.isSmearStrokeLive) {
      this.uvSmearController.endStroke();
      this.isSmearStrokeLive = false;
      this.deps.updateShadingMeshes();
      this.deps.showStatusMessage('UV smear stroke finished');
    }
    this.endWindowDragTracking();
    this.updateSelectionModeStatus(true);
  }

  /** Applies a plain face click when an armed UV move never became a drag. */
  private finishArmedUvClickIfNeeded(): void {
    if (!this.armedUvMove) {
      return;
    }
    this.faceExtrusionController.applyPlainFaceClickSelection(this.armedUvMove.pick);
    this.armedUvMove = null;
  }

  /** Commits a button-drag UV transform session if one is active. */
  private finishUvTransformDragIfNeeded(): void {
    if (!this.uvTransformController.isActive() || !this.uvTransformOwnedByDrag) {
      return;
    }
    const committed = this.uvTransformController.end();
    this.uvTransformOwnedByDrag = false;
    this.deps.updateShadingMeshes();
    this.deps.refreshUvEditorFromSelection?.();
    if (committed) {
      this.deps.showStatusMessage('UV slide applied');
    }
  }

  /**
   * Resolves pivot and plane normal for a single-use UV transform start.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Camera.
   * @param pickElement Pick element.
   * @returns Start geometry, or null.
   */
  private resolveUvTransformStart(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    pickElement: HTMLElement,
  ): { worldStart: THREE.Vector3; planeNormal: THREE.Vector3 } | null {
    const event = this.createSyntheticMouseEvent(clientX, clientY);
    const pick = this.faceExtrusionController.pickFaceAtPointer(event, camera, pickElement);
    if (pick && this.faceExtrusionController.isFaceSelected(pick.mesh, pick.faceIndex)) {
      return { worldStart: pick.hitPoint.clone(), planeNormal: pick.faceNormal.clone() };
    }
    return this.resolveStartFromFirstSelectedFace();
  }

  /**
   * Falls back to the first selected face center and normal.
   *
   * @returns Start geometry, or null when selection is empty.
   */
  private resolveStartFromFirstSelectedFace(): {
    worldStart: THREE.Vector3;
    planeNormal: THREE.Vector3;
  } | null {
    const faces = this.faceExtrusionController.getSelectedFaces();
    const first = faces[0];
    if (!first) {
      return null;
    }
    const triangles = expandFaceSelectionIndices(first.mesh, first.faceIndex);
    const normal = computeRegionWorldNormal(first.mesh, triangles);
    const center = computeFaceRegionWorldCenter(first.mesh, triangles);
    return { worldStart: center, planeNormal: normal };
  }

  /**
   * Finds an interactive viewport under a client point. Client coordinates are
   * window-local; when ownerDocument is set only panes in that document match.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param ownerDocument Optional document that owns the client coordinates.
   * @returns Viewport, or null.
   */
  private findViewportAtClientPoint(
    clientX: number,
    clientY: number,
    ownerDocument: Document | null = null,
  ): Viewport3D | Viewport2D | null {
    return findPickSurfaceAtClientPoint(
      this.deps.getViewports(),
      (viewport) => viewport.getContentElement(),
      clientX,
      clientY,
      ownerDocument,
    );
  }

  /**
   * Builds a synthetic mouse event for face pick helpers.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @returns Synthetic mouse event.
   */
  private createSyntheticMouseEvent(clientX: number, clientY: number): MouseEvent {
    return {
      clientX,
      clientY,
      button: 0,
      buttons: 1,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as MouseEvent;
  }

  /**
   * Builds a synthetic pointer move for face drag paint.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param buttons Pointer buttons bitfield.
   * @returns Synthetic pointer event.
   */
  private createSyntheticPointerMove(clientX: number, clientY: number, buttons: number): PointerEvent {
    return {
      clientX,
      clientY,
      buttons,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as PointerEvent;
  }

  /**
   * Returns whether the UV smear modifier key is currently held.
   *
   * @returns True while KeyM is down.
   */
  private isUvSmearKeyHeld(): boolean {
    return this.deps.keyboardShortcutHandler.isKeyDown(UV_SMEAR_KEY_CODE);
  }

  /**
   * Applies the given selection mode.
   *
   * @param mode The new selection mode to activate.
   */
  private onSelectionModeToggle(mode: SelectionMode): void {
    this.faceExtrusionController.setSelectionMode(mode);
  }

  /**
   * Updates local state and UI when the selection mode changes.
   *
   * @param mode The new selection mode.
   */
  private onSelectionModeChanged(mode: SelectionMode): void {
    this.selectionMode = mode;
    this.updateSelectionModeStatus();
    this.updateFaceSelectionMeshes();
    if (mode === SelectionMode.FACE) {
      this.enterFaceSelectionMode();
    } else {
      this.cancelUvTransformIfActive();
      this.onWindowPointerUp();
    }
    this.deps.onSelectionModeUiChanged?.(mode);
  }

  /**
   * Clears object selection, refreshes face-pickable meshes, and shows
   * face-mode guidance.
   */
  private enterFaceSelectionMode(): void {
    this.deps.selectionManager.clearSelection();
    this.updateFaceSelectionMeshes();
    this.deps.showStatusMessage(
      'Face mode: drag to select · drag selected face to slide UVs · G/R/S UV transform · hold M to smear · Extrude / Shift+E',
    );
  }

  /**
   * Updates the status bar to reflect the current selection mode.
   *
   * @param force When true, writes even if the face count is unchanged.
   */
  private updateSelectionModeStatus(force: boolean = false): void {
    if (!this.deps.statusBar) return;
    const mode = this.faceExtrusionController.getSelectionMode();
    const count = this.faceExtrusionController.getSelectedFaceCount();
    if (!force && mode === SelectionMode.FACE && count === this.lastStatusFaceCount) {
      return;
    }
    this.lastStatusFaceCount = count;
    this.deps.statusBar.setSelectionModeInfo(this.formatSelectionMode(mode), count);
  }

  /**
   * Converts a selection mode enum value to its display string.
   *
   * @param mode The selection mode to format.
   * @returns The display name of the selection mode.
   */
  private formatSelectionMode(mode: SelectionMode): string {
    if (mode === SelectionMode.FACE) return 'Face';
    return 'Object';
  }

  /**
   * Builds a short status string for a UV transform mode.
   *
   * @param mode Transform mode.
   * @returns Status text.
   */
  private describeUvTransformMode(mode: UvTransformMode): string {
    if (mode === 'move') {
      return 'UV Move (single-use) — move mouse, click or Enter to confirm, Esc to cancel';
    }
    if (mode === 'rotate') {
      return 'UV Rotate (single-use) — drag away from pivot first, then orbit; click to confirm';
    }
    return 'UV Scale (single-use) — drag away from pivot first, then in/out; click to confirm';
  }
}

/**
 * Computes the average world-space center of a face region.
 *
 * @param mesh Mesh owner.
 * @param triangleIndices Region triangles.
 * @returns World-space center.
 */
function computeFaceRegionWorldCenter(mesh: THREE.Mesh, triangleIndices: number[]): THREE.Vector3 {
  mesh.updateMatrixWorld(true);
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const local = new THREE.Vector3();
  const sum = new THREE.Vector3();
  let count = 0;
  for (const faceIndex of triangleIndices) {
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = index ? index.getX(faceIndex * 3 + corner) : faceIndex * 3 + corner;
      local.fromBufferAttribute(position, vertexIndex);
      sum.add(local.clone().applyMatrix4(mesh.matrixWorld));
      count += 1;
    }
  }
  if (count === 0) {
    return new THREE.Vector3();
  }
  return sum.multiplyScalar(1 / count);
}
