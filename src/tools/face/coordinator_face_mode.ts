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
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { findPickSurfaceAtClientPoint } from '@/utils/pointer_client_hit.js';

/** Keyboard code that enables continuous UV smear while held. */
const UV_SMEAR_KEY_CODE = 'KeyG';

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
}

/** Coordinates face selection mode, drag-paint, UV smear, and extrusion UI. */
export class CoordinatorFaceMode {
  private deps: FaceModeCoordinatorDependencies;
  private faceExtrusionController: ControllerFaceExtrusion;
  private uvSmearController: ControllerUvSmear;
  private selectionMode: SelectionMode;
  private activeDragViewport: Viewport3D | Viewport2D | null;
  private dragOwnerWindow: Window | null;
  private windowPointerMoveListener: ((event: PointerEvent) => void) | null;
  private windowPointerUpListener: ((event: PointerEvent) => void) | null;
  private isSmearStrokeLive: boolean;
  private lastStatusFaceCount: number;
  private dragPickFrame: number;
  private pendingDragEvent: PointerEvent | null;

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
    this.activeDragViewport = null;
    this.dragOwnerWindow = null;
    this.windowPointerMoveListener = null;
    this.windowPointerUpListener = null;
    this.isSmearStrokeLive = false;
    this.lastStatusFaceCount = -1;
    this.dragPickFrame = 0;
    this.pendingDragEvent = null;
    this.bindFaceSelectionCallbacks();
    this.updateSelectionModeStatus();
  }

  /** Enters face selection mode. */
  enterFaceSelectionModeFromTool(): void {
    this.faceExtrusionController.setSelectionMode(SelectionMode.FACE);
  }

  /** Leaves face selection mode and returns to object selection mode. */
  leaveFaceSelectionModeFromTool(): void {
    this.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
  }

  /**
   * Starts face pick or paint at a client point.
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
   * Continues face paint or UV smear while the pointer moves.
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

  /** Ends face paint or UV smear. */
  endFaceSelectPointerUp(): void {
    this.onWindowPointerUp();
  }

  /**
   * Returns whether a face paint or UV smear stroke is live.
   *
   * @returns True while stroke tracking is active.
   */
  isFaceSelectStrokeActive(): boolean {
    return this.activeDragViewport !== null || this.isSmearStrokeLive;
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
   * Extrudes currently selected faces by the default snap distance, or shows
   * guidance when face mode is inactive or no faces are selected.
   */
  onExtrudeFaces(): void {
    if (this.faceExtrusionController.getSelectionMode() !== SelectionMode.FACE) {
      this.faceExtrusionController.setSelectionMode(SelectionMode.FACE);
      this.deps.showStatusMessage('Face mode: drag faces to select, hold G to smear UVs, Extrude (Shift+E)');
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
    // Select after leaving face mode and syncing viewports so object gizmos show.
    this.deps.selectionManager.setSelection(createdMeshes);
    this.updateSelectionModeStatus();
    this.deps.showStatusMessage(this.buildExtrudeStatusLabel(createdMeshes));
  }

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
   * Handles face selection pointer down. Starts window-level drag listeners for
   * multi-face paint and UV smear.
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
    const smearHeld = this.isUvSmearKeyHeld();
    const camera = viewport.getCamera();
    const pickElement = viewport.getContentElement();
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
   * Continues face selection drag and optional UV smear while the button is
   * held. Coalesces to one pick per animation frame so high-frequency mouse
   * events cannot stack expensive work.
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

  /** Ends face drag-paint and commits any UV smear stroke. */
  private onWindowPointerUp(): void {
    if (this.dragPickFrame !== 0) {
      cancelAnimationFrame(this.dragPickFrame);
      this.dragPickFrame = 0;
    }
    this.pendingDragEvent = null;
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

  /**
   * Returns whether the UV smear modifier key is currently held.
   *
   * @returns True while KeyG is down.
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
    this.deps.showStatusMessage('Face mode: drag to select faces · hold G and drag to smear UVs · Extrude / Shift+E');
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
}
