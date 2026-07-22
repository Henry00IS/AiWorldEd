import * as THREE from 'three';
import { Viewport3D } from '../viewports/viewport_3d.js';
import { Viewport2D } from '../viewports/viewport_2d.js';
import { SelectionManager } from './selection_manager.js';
import { FaceExtrusionController } from './face_extrusion_controller.js';
import { KeyboardShortcutHandler } from './keyboard_shortcut_handler.js';
import { Toolbar } from '../ui/toolbar.js';
import { StatusBar } from '../ui/status_bar.js';
import { SelectionMode } from '../types/selection_mode.js';
import { CommandStack } from '../commands/command_stack.js';
import { GridSnap } from '../transform/grid_snap.js';

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
  toolbar: Toolbar;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: KeyboardShortcutHandler;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  updateShadingMeshes: () => void;
  refreshOutliner: () => void;
  onSelectionModeUiChanged?: (mode: SelectionMode) => void;
}

/**
 * Coordinates face selection mode, extrusion actions, and related UI feedback.
 */
export class FaceModeCoordinator {
  private deps: FaceModeCoordinatorDependencies;
  private faceExtrusionController: FaceExtrusionController;
  private selectionMode: SelectionMode;

  /**
   * Creates a face mode coordinator and wires viewport/face callbacks.
   * @param deps Shared editor systems used by face mode.
   */
  constructor(deps: FaceModeCoordinatorDependencies) {
    this.deps = deps;
    this.selectionMode = SelectionMode.OBJECT;
    this.faceExtrusionController = this.createFaceExtrusionController();
    this.bindFaceSelectionCallbacks();
    this.createSelectionModeButtons();
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
      this.deps.showStatusMessage('Face mode: click a face, then Extrude (E)');
      return;
    }
    if (this.faceExtrusionController.getSelectedFaceCount() === 0) {
      this.deps.showStatusMessage('Select a face first, then Extrude (E)');
      return;
    }
    const createdMeshes =
      this.faceExtrusionController.extrudeSelectedFacesByDefaultDistance();
    if (createdMeshes.length === 0) {
      this.deps.showStatusMessage('Extrude failed — select one or more faces');
      return;
    }
    this.deps.selectionManager.setSelection(createdMeshes);
    this.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.deps.syncPrimitivesToViewports();
    this.updateFaceSelectionMeshes();
    this.deps.updateShadingMeshes();
    this.deps.refreshOutliner();
    this.updateSelectionModeStatus();
    const label = createdMeshes.length === 1
      ? `Created convex solid ${createdMeshes[0].name}`
      : `Created ${createdMeshes.length} convex solids`;
    this.deps.showStatusMessage(label);
  }

  /**
   * Updates the available meshes for face selection from the world object.
   */
  updateFaceSelectionMeshes(): void {
    const meshes: THREE.Mesh[] = [];
    this.deps.worldObject.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshes.push(child);
      }
    });
    this.faceExtrusionController.setAvailableMeshes(meshes);
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
   * Creates toolbar buttons for toggling between object and face selection.
   */
  private createSelectionModeButtons(): void {
    this.deps.toolbar.addSeparator();
    this.deps.toolbar.addDropdown('Select', [
      { label: 'Object', onClick: () => this.onSetSelectionMode(SelectionMode.OBJECT) },
      { label: 'Face', onClick: () => this.onSetSelectionMode(SelectionMode.FACE) }
    ]);
    this.deps.toolbar.addButton('Extrude', () => this.onExtrudeFaces());
    this.updateSelectionModeButtons();
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
   * @param event The pointer event.
   * @param viewport The viewport that received the event.
   * @returns True if the event was consumed by face selection.
   */
  private onViewportFacePointerDown(
    event: MouseEvent,
    viewport: Viewport3D | Viewport2D
  ): boolean {
    const consumed = this.faceExtrusionController.onPointerDown(
      event, viewport.getCamera(), viewport.getRenderer()
    );
    if (consumed) {
      this.updateSelectionModeStatus();
    }
    return consumed;
  }

  /**
   * Handles explicit selection mode changes from toolbar buttons.
   * @param mode The selection mode to activate.
   */
  private onSetSelectionMode(mode: SelectionMode): void {
    this.faceExtrusionController.setSelectionMode(mode);
  }

  /**
   * Handles selection mode toggle from keyboard shortcut.
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
    this.updateSelectionModeButtons();
    this.updateSelectionModeStatus();
    this.updateFaceSelectionMeshes();
    if (mode === SelectionMode.FACE) {
      this.enterFaceSelectionMode();
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
    this.deps.showStatusMessage(
      'Face mode: click faces (Shift multi), Extrude or E'
    );
  }

  /**
   * Updates the active state of selection mode toolbar buttons.
   */
  private updateSelectionModeButtons(): void {
    const currentMode = this.faceExtrusionController.getSelectionMode();
    this.deps.toolbar.setButtonActiveByLabel(
      'Select',
      currentMode === SelectionMode.OBJECT || currentMode === SelectionMode.FACE
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
