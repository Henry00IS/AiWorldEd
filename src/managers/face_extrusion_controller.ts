import * as THREE from 'three';
import { SelectionMode } from '../types/selection_mode.js';
import { FaceSelection, FaceSelectionManager } from '../selection/face_selection_manager.js';
import { FaceSelectionRaycaster, FacePickResult } from '../selection/face_selection_raycaster.js';
import { FaceSelectionHighlight } from '../selection/face_selection_highlight.js';
import { CommandStack } from '../commands/command_stack.js';
import { ExtrudeFacesCommand } from '../commands/extrude_faces_command.js';
import { createConvexPrismFromFace } from '../transform/convex_face_prism.js';
import { groupSelectionsIntoFaceRegions } from '../selection/face_region_grouper.js';
import { GridSnap } from '../transform/grid_snap.js';

/**
 * Callback for selection mode changes.
 * @param mode The new selection mode.
 */
export type SelectionModeCallback = (mode: SelectionMode) => void;

/**
 * Callback for face selection set changes.
 * @param faces The current face selection entries.
 */
export type FaceSelectionChangedListener = (faces: FaceSelection[]) => void;

/**
 * Central controller for face selection and extrusion operations.
 * Extrusion creates a new convex prism object; source meshes stay unchanged.
 */
export class FaceExtrusionController {
  private selectionManager: FaceSelectionManager;
  private raycaster: FaceSelectionRaycaster;
  private highlight: FaceSelectionHighlight | null;
  private commandStack: CommandStack;
  private gridSnap: GridSnap;
  private worldRoot: THREE.Object3D;
  private currentMode: SelectionMode;
  private modeChangedCallback: SelectionModeCallback | null;
  private faceSelectionChangedCallback: FaceSelectionChangedListener | null;
  private availableMeshes: THREE.Mesh[];
  private extrudeCounter: number;
  private lastCreatedMeshes: THREE.Mesh[];

  /**
   * Creates a new face extrusion controller.
   * @param scene The Three.js scene for highlight rendering.
   * @param commandStack The command stack for undo/redo.
   * @param gridSnap The grid snap configuration for snapping extrusion distances.
   * @param worldRoot The parent group for newly created extrusion meshes.
   */
  constructor(
    scene: THREE.Scene,
    commandStack: CommandStack,
    gridSnap: GridSnap,
    worldRoot: THREE.Object3D
  ) {
    this.selectionManager = new FaceSelectionManager();
    this.raycaster = new FaceSelectionRaycaster();
    this.highlight = new FaceSelectionHighlight(scene);
    this.commandStack = commandStack;
    this.gridSnap = gridSnap;
    this.worldRoot = worldRoot;
    this.currentMode = SelectionMode.OBJECT;
    this.modeChangedCallback = null;
    this.faceSelectionChangedCallback = null;
    this.availableMeshes = [];
    this.extrudeCounter = 0;
    this.lastCreatedMeshes = [];
    this.bindSelectionChangeCallback();
  }

  /**
   * Binds the internal selection change callback to update highlights.
   */
  private bindSelectionChangeCallback(): void {
    this.selectionManager.setSelectionChangedCallback(
      (faces) => this.onFaceSelectionChanged(faces)
    );
  }

  /**
   * Registers a listener for face selection changes (highlights stay internal).
   * @param callback Invoked with the current face list, or null to clear.
   */
  setFaceSelectionChangedCallback(
    callback: FaceSelectionChangedListener | null
  ): void {
    this.faceSelectionChangedCallback = callback;
  }

  /**
   * Handles face selection changes by updating visual highlights.
   * @param faces The new set of selected faces.
   */
  private onFaceSelectionChanged(faces: FaceSelection[]): void {
    if (this.highlight) {
      this.highlight.setSelectedFaces(faces);
    }
    if (this.faceSelectionChangedCallback) {
      this.faceSelectionChangedCallback(faces);
    }
  }

  /**
   * Sets the current selection mode.
   * @param mode The selection mode to activate.
   */
  setSelectionMode(mode: SelectionMode): void {
    if (mode === this.currentMode) return;
    if (mode === SelectionMode.OBJECT) {
      this.selectionManager.deselectAll();
    }
    this.currentMode = mode;
    this.notifyModeChange();
  }

  /**
   * Returns the current selection mode.
   * @returns The active selection mode.
   */
  getSelectionMode(): SelectionMode {
    return this.currentMode;
  }

  /**
   * Registers a callback for selection mode changes.
   * @param callback The function to call when mode changes.
   */
  setModeChangedCallback(callback: SelectionModeCallback): void {
    this.modeChangedCallback = callback;
  }

  /**
   * Notifies the mode change callback of a mode transition.
   */
  private notifyModeChange(): void {
    if (this.modeChangedCallback) {
      this.modeChangedCallback(this.currentMode);
    }
  }

  /**
   * Updates the available meshes for face picking.
   * @param meshes The meshes in the scene.
   */
  setAvailableMeshes(meshes: THREE.Mesh[]): void {
    this.availableMeshes = meshes;
  }

  /**
   * Processes a pointer down event for face selection.
   * @param event The pointer event.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @returns True if the event was consumed.
   */
  onPointerDown(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ): boolean {
    if (this.currentMode !== SelectionMode.FACE) return false;
    const result = this.raycaster.pickFace(event, camera, renderer, this.availableMeshes);
    if (!result) {
      this.selectionManager.deselectAll();
      return true;
    }
    this.handleFaceClick(result, event.shiftKey);
    return true;
  }

  /**
   * Handles a face click by selecting the coplanar face region.
   * @param result The raycast pick result.
   * @param addToSelection Whether to add to existing selection.
   */
  private handleFaceClick(result: FacePickResult, addToSelection: boolean): void {
    this.selectionManager.selectFace(
      result.mesh,
      result.faceIndex,
      addToSelection
    );
  }

  /**
   * Returns the current set of selected faces.
   * @returns The face selection array.
   */
  getSelectedFaces(): FaceSelection[] {
    return this.selectionManager.getSelectedFaces();
  }

  /**
   * Returns the count of selected faces.
   * @returns The number of selected faces.
   */
  getSelectedFaceCount(): number {
    return this.selectionManager.getSelectedFaceCount();
  }

  /**
   * Programmatically selects a face on a mesh. Useful for testing.
   * @param mesh The mesh containing the face.
   * @param faceIndex The triangle index to select.
   * @param addToSelection Whether to add to existing selection.
   */
  selectFace(mesh: THREE.Mesh, faceIndex: number, addToSelection: boolean): void {
    this.selectionManager.selectFace(mesh, faceIndex, addToSelection);
  }

  /**
   * Extrudes selected faces by the current snap interval (or 1.0 if snap is off).
   * @returns Newly created convex prism meshes (one per face region).
   */
  extrudeSelectedFacesByDefaultDistance(): THREE.Mesh[] {
    const distance = this.resolveDefaultExtrudeDistance();
    return this.extrudeSelectedFaces(distance);
  }

  /**
   * Chooses a sensible default extrude distance from snap settings.
   * @returns Positive extrude distance.
   */
  private resolveDefaultExtrudeDistance(): number {
    if (this.gridSnap.isEnabled()) {
      return Math.max(this.gridSnap.getInterval(), 0.01);
    }
    return 1.0;
  }

  /**
   * Creates one new convex prism per distinct selected face region.
   * Source meshes are never modified.
   * @param displacement The extrusion distance along each face normal.
   * @returns The new meshes (empty if nothing could be extruded).
   */
  extrudeSelectedFaces(displacement: number): THREE.Mesh[] {
    const faces = this.selectionManager.getSelectedFaces();
    if (faces.length === 0) return [];
    const regions = groupSelectionsIntoFaceRegions(faces);
    if (regions.length === 0) return [];
    const safeDistance = this.resolveSafeDistance(displacement);
    const createdMeshes: THREE.Mesh[] = [];
    regions.forEach((region) => {
      this.extrudeCounter += 1;
      const objectName = `Extrude${String(this.extrudeCounter).padStart(3, '0')}`;
      const prism = createConvexPrismFromFace(
        region.mesh,
        region.faceIndices,
        safeDistance,
        objectName
      );
      if (prism) {
        createdMeshes.push(prism);
      }
    });
    if (createdMeshes.length === 0) return [];
    const command = new ExtrudeFacesCommand(createdMeshes, this.worldRoot);
    this.commandStack.push(command);
    this.lastCreatedMeshes = createdMeshes;
    this.selectionManager.deselectAll();
    return createdMeshes;
  }

  /**
   * Returns meshes created by the most recent extrude.
   * @returns The last extruded meshes.
   */
  getLastCreatedMeshes(): THREE.Mesh[] {
    return this.lastCreatedMeshes.slice();
  }

  /**
   * Returns the first mesh from the most recent extrude, if any.
   * @returns The first extruded mesh, or null.
   */
  getLastCreatedMesh(): THREE.Mesh | null {
    return this.lastCreatedMeshes.length > 0 ? this.lastCreatedMeshes[0] : null;
  }

  /**
   * Resolves a usable extrude distance from the requested value and snap state.
   * @param displacement Requested displacement.
   * @returns Non-zero extrude distance.
   */
  private resolveSafeDistance(displacement: number): number {
    const snappedDisplacement = this.gridSnap.isEnabled()
      ? this.gridSnap.snapValue(displacement)
      : displacement;
    if (Math.abs(snappedDisplacement) < 1e-8) {
      return this.resolveDefaultExtrudeDistance();
    }
    return snappedDisplacement;
  }

  /**
   * Clears face selection and recent extrude bookkeeping.
   * Safe to call when the scene graph is replaced (load) or reset.
   */
  clearFaceSelection(): void {
    this.selectionManager.deselectAll();
    this.lastCreatedMeshes = [];
  }

  /**
   * Disposes all internal resources.
   */
  dispose(): void {
    this.highlight?.dispose();
    this.highlight = null;
    this.raycaster.dispose();
    this.selectionManager.clear();
    this.availableMeshes = [];
    this.lastCreatedMeshes = [];
  }
}
