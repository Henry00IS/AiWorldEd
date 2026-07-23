import * as THREE from 'three';
import { Viewport3D } from '../viewports/viewport_3d.js';
import { Viewport2D } from '../viewports/viewport_2d.js';
import { SelectionManager } from './selection_manager.js';
import { FaceExtrusionController } from './face_extrusion_controller.js';
import { KeyboardShortcutHandler } from './keyboard_shortcut_handler.js';
import { StatusBar } from '../ui/status_bar.js';
import { SelectionMode } from '../types/selection_mode.js';
import { CommandStack } from '../commands/command_stack.js';
import { GridSnap } from '../transform/grid_snap.js';
import { UvSmearController } from './uv_smear_controller.js';
import { SolidBrushVisual } from '../solid/model/solid_brush_visual.js';

/** Keyboard code that enables continuous UV smear while held. */
const UV_SMEAR_KEY_CODE = 'KeyG';

/**
 * Dependencies required to coordinate face selection and extrusion UI.
 */
export interface FaceModeCoordinatorDependencies {
  viewport3D: Viewport3D;
  viewport2DTop: Viewport2D;
  viewport2DFront: Viewport2D;
  viewport2DSide: Viewport2D;
  commandStack: CommandStack;
  gridSnap: GridSnap;
  worldObject: THREE.Group;
  selectionManager: SelectionManager;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: KeyboardShortcutHandler;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  updateShadingMeshes: () => void;
  refreshOutliner: () => void;
  onSelectionModeUiChanged?: (mode: SelectionMode) => void;
}

/**
 * Coordinates face selection mode, drag-paint, UV smear, and extrusion UI.
 */
export class FaceModeCoordinator {
  private deps: FaceModeCoordinatorDependencies;
  private faceExtrusionController: FaceExtrusionController;
  private uvSmearController: UvSmearController;
  private selectionMode: SelectionMode;
  private activeDragViewport: Viewport3D | Viewport2D | null;
  private windowPointerMoveListener: ((event: PointerEvent) => void) | null;
  private windowPointerUpListener: ((event: PointerEvent) => void) | null;
  private isSmearStrokeLive: boolean;

  /**
   * Creates a face mode coordinator and wires viewport/face callbacks.
   * @param deps Shared editor systems used by face mode.
   */
  constructor(deps: FaceModeCoordinatorDependencies) {
    this.deps = deps;
    this.selectionMode = SelectionMode.OBJECT;
    this.faceExtrusionController = this.createFaceExtrusionController();
    this.uvSmearController = new UvSmearController(deps.commandStack);
    this.activeDragViewport = null;
    this.windowPointerMoveListener = null;
    this.windowPointerUpListener = null;
    this.isSmearStrokeLive = false;
    this.bindFaceSelectionCallbacks();
    this.bindViewportFaceCallbacks();
    this.updateSelectionModeStatus();
  }

  /**
   * Returns the face extrusion controller owned by this coordinator.
   * @returns The FaceExtrusionController instance.
   */
  getFaceExtrusionController(): FaceExtrusionController {
    return this.faceExtrusionController;
  }

  /**
   * Returns the current selection mode.
   * @returns The active SelectionMode value.
   */
  getSelectionMode(): SelectionMode {
    return this.selectionMode;
  }

  /**
   * Extrudes currently selected faces by the default snap distance.
   * Switches to face mode feedback when nothing is selected.
   */
  onExtrudeFaces(): void {
    if (this.faceExtrusionController.getSelectionMode() !== SelectionMode.FACE) {
      this.faceExtrusionController.setSelectionMode(SelectionMode.FACE);
      this.deps.showStatusMessage(
        'Face mode: drag faces to select, hold G to smear UVs, Extrude (Shift+E)'
      );
      return;
    }
    if (this.faceExtrusionController.getSelectedFaceCount() === 0) {
      this.deps.showStatusMessage(
        'Select a face first, then Extrude (Shift+E)'
      );
      return;
    }
    const createdMeshes =
      this.faceExtrusionController.extrudeSelectedFacesByDefaultDistance();
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
    const label = createdMeshes.length === 1
      ? `Created convex solid ${createdMeshes[0].name}`
      : `Created ${createdMeshes.length} convex solids`;
    this.deps.showStatusMessage(label);
  }

  /**
   * Updates the available meshes for face selection from the world object.
   * Solid brush volume helpers are excluded so only CSG result (and regular)
   * surfaces can be face-selected; invisible subtractive hulls never block picks.
   */
  updateFaceSelectionMeshes(): void {
    const meshes: THREE.Mesh[] = [];
    this.deps.worldObject.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (SolidBrushVisual.shouldSkipFacePick(child)) return;
      meshes.push(child);
    });
    this.faceExtrusionController.setAvailableMeshes(meshes);
  }

  /**
   * Returns meshes currently allowed for face picking (for tests).
   * @returns Face-pickable mesh list.
   */
  getFacePickableMeshesForTesting(): THREE.Mesh[] {
    return this.faceExtrusionController.getAvailableMeshesForTesting();
  }

  /**
   * Creates a new face extrusion controller for the 3D viewport.
   * @returns A configured FaceExtrusionController instance.
   */
  private createFaceExtrusionController(): FaceExtrusionController {
    return new FaceExtrusionController(
      this.deps.viewport3D.getScene(),
      this.deps.commandStack,
      this.deps.gridSnap,
      this.deps.worldObject
    );
  }

  /**
   * Binds callbacks between the face controller and keyboard shortcuts.
   */
  private bindFaceSelectionCallbacks(): void {
    this.faceExtrusionController.setModeChangedCallback(
      (mode) => this.onSelectionModeChanged(mode)
    );
    this.deps.keyboardShortcutHandler.setOnSelectionModeToggle(
      (mode) => this.onSelectionModeToggle(mode)
    );
    this.deps.keyboardShortcutHandler.setOnExtrudeFaces(() => this.onExtrudeFaces());
  }

  /**
   * Wires face selection callbacks to all viewports.
   */
  private bindViewportFaceCallbacks(): void {
    const viewports = [
      this.deps.viewport3D,
      this.deps.viewport2DTop,
      this.deps.viewport2DFront,
      this.deps.viewport2DSide
    ];
    viewports.forEach((viewport) => {
      viewport.setFaceSelectionCallback(
        (event) => this.onViewportFacePointerDown(event, viewport)
      );
    });
  }

  /**
   * Handles face selection pointer down events from any viewport.
   * Starts window-level drag listeners for multi-face paint and UV smear.
   * @param event The pointer event.
   * @param viewport The viewport that received the event.
   * @returns True if the event was consumed by face selection.
   */
  private onViewportFacePointerDown(
    event: MouseEvent,
    viewport: Viewport3D | Viewport2D
  ): boolean {
    if (this.faceExtrusionController.getSelectionMode() !== SelectionMode.FACE) {
      return false;
    }
    const smearHeld = this.isUvSmearKeyHeld();
    const camera = viewport.getCamera();
    const renderer = viewport.getRenderer();
    this.faceExtrusionController.onPointerDown(event, camera, renderer);
    if (smearHeld) {
      const pick = this.faceExtrusionController.pickFaceAtPointer(
        event,
        camera,
        renderer
      );
      if (pick) {
        this.uvSmearController.beginStroke(pick.mesh, pick.faceIndex);
        this.isSmearStrokeLive = true;
        this.deps.updateShadingMeshes();
        this.deps.showStatusMessage(
          'Smearing UVs — drag across faces, release to finish'
        );
      }
    }
    this.beginWindowDragTracking(viewport);
    this.updateSelectionModeStatus();
    return true;
  }

  /**
   * Registers window listeners so face drag continues outside the canvas.
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
    window.addEventListener('pointermove', this.windowPointerMoveListener);
    window.addEventListener('pointerup', this.windowPointerUpListener);
    window.addEventListener('pointercancel', this.windowPointerUpListener);
  }

  /**
   * Removes window drag listeners.
   */
  private endWindowDragTracking(): void {
    if (this.windowPointerMoveListener) {
      window.removeEventListener('pointermove', this.windowPointerMoveListener);
      this.windowPointerMoveListener = null;
    }
    if (this.windowPointerUpListener) {
      window.removeEventListener('pointerup', this.windowPointerUpListener);
      window.removeEventListener('pointercancel', this.windowPointerUpListener);
      this.windowPointerUpListener = null;
    }
    this.activeDragViewport = null;
  }

  /**
   * Continues face selection drag and optional UV smear while the button is held.
   * @param event Window pointer move event.
   */
  private onWindowPointerMove(event: PointerEvent): void {
    const viewport = this.activeDragViewport;
    if (!viewport) return;
    if ((event.buttons & 1) === 0) {
      this.onWindowPointerUp();
      return;
    }
    const camera = viewport.getCamera();
    const renderer = viewport.getRenderer();
    if (this.isSmearStrokeLive || this.isUvSmearKeyHeld()) {
      const pick = this.faceExtrusionController.pickFaceAtPointer(
        event,
        camera,
        renderer
      );
      if (pick) {
        if (!this.isSmearStrokeLive) {
          this.uvSmearController.beginStroke(pick.mesh, pick.faceIndex);
          this.isSmearStrokeLive = true;
        } else {
          this.uvSmearController.continueStroke(pick.mesh, pick.faceIndex);
        }
        this.faceExtrusionController.selectFace(pick.mesh, pick.faceIndex, true);
        this.deps.updateShadingMeshes();
      }
    }
    this.faceExtrusionController.onPointerMove(event, camera, renderer);
    this.updateSelectionModeStatus();
  }

  /**
   * Ends face drag-paint and commits any UV smear stroke.
   */
  private onWindowPointerUp(): void {
    this.faceExtrusionController.onPointerUp();
    if (this.isSmearStrokeLive) {
      this.uvSmearController.endStroke();
      this.isSmearStrokeLive = false;
      this.deps.updateShadingMeshes();
      this.deps.showStatusMessage('UV smear stroke finished');
    }
    this.endWindowDragTracking();
    this.updateSelectionModeStatus();
  }

  /**
   * Returns whether the UV smear modifier key is currently held.
   * @returns True while KeyG is down.
   */
  private isUvSmearKeyHeld(): boolean {
    return this.deps.keyboardShortcutHandler.isKeyDown(UV_SMEAR_KEY_CODE);
  }

  /**
   * Handles selection mode toggle from keyboard shortcut or tools palette.
   * @param mode The new selection mode to activate.
   */
  private onSelectionModeToggle(mode: SelectionMode): void {
    this.faceExtrusionController.setSelectionMode(mode);
  }

  /**
   * Handles selection mode change notifications from the controller.
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
   * Activates face-only picking: clears object selection so transform tools
   * (bounds/move/rotate/scale) deactivate, then shows face-mode guidance.
   * Face pick works on any mesh, so object selection is not needed here.
   */
  private enterFaceSelectionMode(): void {
    this.deps.selectionManager.clearSelection();
    this.updateFaceSelectionMeshes();
    this.deps.showStatusMessage(
      'Face mode: drag to select faces · hold G and drag to smear UVs · Extrude / Shift+E'
    );
  }

  /**
   * Updates the status bar to reflect the current selection mode.
   */
  private updateSelectionModeStatus(): void {
    if (!this.deps.statusBar) return;
    const mode = this.faceExtrusionController.getSelectionMode();
    const count = this.faceExtrusionController.getSelectedFaceCount();
    this.deps.statusBar.setSelectionModeInfo(
      this.formatSelectionMode(mode), count
    );
  }

  /**
   * Converts a selection mode enum value to its display string.
   * @param mode The selection mode to format.
   * @returns The display name of the selection mode.
   */
  private formatSelectionMode(mode: SelectionMode): string {
    if (mode === SelectionMode.FACE) return 'Face';
    return 'Object';
  }
}
