import * as THREE from 'three';
import { CommandStack } from '../commands/command_stack.js';
import { ClipMeshCommand } from '../commands/clip_mesh_command.js';
import { SplitMeshCommand } from '../commands/split_mesh_command.js';
import { ClipSolidBrushCommand } from '../commands/clip_solid_brush_command.js';
import { SplitSolidBrushCommand } from '../commands/split_solid_brush_command.js';
import { CsgPlaneSplit } from '../csg/csg_plane_split.js';
import { SelectionManager } from './selection_manager.js';
import { ClipPlaneTool } from './clip_plane_tool.js';
import { ClipPlanePointPicker } from './clip_plane_point_picker.js';
import { ClipPlanePointDrag } from './clip_plane_point_drag.js';
import {
  ClipPlanePreview,
  CLIP_PREVIEW_USERDATA_KEY
} from './clip_plane_preview.js';
import { GridSnap } from '../transform/grid_snap.js';
import { SolidBrushVisual } from '../solid/model/solid_brush_visual.js';
import { SolidModel } from '../solid/model/solid_model.js';

/**
 * Dependencies for running clip/split operations from the clip tool.
 */
export interface ClipPlaneHandlerDependencies {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: SelectionManager;
  gridSnap: GridSnap;
  clipPlaneTool: ClipPlaneTool;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  refreshOutliner: () => void;
  updateShadingMeshes: () => void;
  onToolStateChanged: () => void;
}

/**
 * Coordinates clip plane point picking, preview, drag, and commit operations.
 */
export class ClipPlaneHandler {
  private deps: ClipPlaneHandlerDependencies;
  private pointPicker: ClipPlanePointPicker;
  private pointDrag: ClipPlanePointDrag;
  private preview: ClipPlanePreview;
  private planeSplit: CsgPlaneSplit;
  private draggingPointIndex: number;
  private dragPlane: THREE.Plane | null;
  private dragCamera: THREE.Camera | null;
  private dragRenderer: THREE.WebGLRenderer | null;
  private boundDragMove: ((event: PointerEvent) => void) | null;
  private boundDragUp: ((event: PointerEvent) => void) | null;

  /**
   * Creates a clip plane handler.
   * @param deps Shared editor systems.
   */
  constructor(deps: ClipPlaneHandlerDependencies) {
    this.deps = deps;
    this.pointPicker = new ClipPlanePointPicker(deps.gridSnap);
    this.pointDrag = new ClipPlanePointDrag(deps.gridSnap);
    this.preview = new ClipPlanePreview();
    this.planeSplit = new CsgPlaneSplit();
    this.draggingPointIndex = -1;
    this.dragPlane = null;
    this.dragCamera = null;
    this.dragRenderer = null;
    this.boundDragMove = null;
    this.boundDragUp = null;
    deps.worldObject.add(this.preview.getRoot());
    deps.clipPlaneTool.setChangeCallback(() => this.onToolChanged());
  }

  /**
   * Returns the preview root for scene management.
   * @returns Preview group.
   */
  getPreview(): ClipPlanePreview {
    return this.preview;
  }

  /**
   * Re-parents the preview under the world root and rebuilds visuals.
   * Call after scene load or any operation that may clear world children.
   */
  reattachPreviewToWorld(): void {
    const previewRoot = this.preview.getRoot();
    if (previewRoot.parent !== this.deps.worldObject) {
      this.deps.worldObject.add(previewRoot);
    }
    this.preview.syncFromTool(this.deps.clipPlaneTool);
  }

  /**
   * Scales placement markers for the active camera (call from the render loop).
   * @param camera Camera used for distance-based marker sizing.
   */
  updatePreviewScales(camera: THREE.Camera): void {
    if (!this.deps.clipPlaneTool.isActive()) return;
    this.preview.updateMarkerScalesForCamera(camera);
  }

  /**
   * Handles a viewport pointer-down while the clip tool is active.
   * Grabs existing markers first; otherwise places a new point.
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param renderer Viewport renderer.
   * @returns True when the event was consumed.
   */
  onPointerDown(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ): boolean {
    if (!this.deps.clipPlaneTool.isActive()) return false;
    if (this.tryBeginMarkerDrag(event, camera, renderer)) return true;
    return this.placeNewPoint(event, camera, renderer);
  }

  /**
   * Flips the keep side of the active plane.
   */
  flipPlane(): void {
    if (!this.deps.clipPlaneTool.isActive()) return;
    this.deps.clipPlaneTool.flipKeepSide();
    this.deps.showStatusMessage(
      this.deps.clipPlaneTool.getKeepFront()
        ? 'Keep front half-space'
        : 'Keep back half-space'
    );
  }

  /**
   * Commits a one-sided clip on all selected meshes and solid brushes.
   */
  commitClip(): void {
    const plane = this.requireReadyPlane();
    if (!plane) return;
    const targets = this.requireTargets();
    if (!targets) return;
    const results: THREE.Mesh[] = [];
    let clippedCount = 0;
    const keepFront = this.deps.clipPlaneTool.getKeepFront();
    targets.forEach((mesh) => {
      const brushResult = this.clipSolidBrushTarget(mesh, plane, keepFront);
      if (brushResult) {
        results.push(brushResult);
        clippedCount += 1;
        return;
      }
      if (SolidBrushVisual.isBrushObject(mesh)) return;
      const result = this.planeSplit.clipMeshToPlane(mesh, plane, keepFront);
      if (!result) return;
      const command = new ClipMeshCommand(mesh, result, this.deps.worldObject);
      this.deps.commandStack.push(command);
      results.push(result);
      clippedCount += 1;
    });
    this.finishCommit(results, clippedCount, targets.length, 'Clipped');
  }

  /**
   * Commits a split into two solids for each selected mesh or brush.
   */
  commitSplit(): void {
    const plane = this.requireReadyPlane();
    if (!plane) return;
    const targets = this.requireTargets();
    if (!targets) return;
    const results: THREE.Mesh[] = [];
    let splitCount = 0;
    targets.forEach((mesh) => {
      const brushResults = this.splitSolidBrushTarget(mesh, plane);
      if (brushResults) {
        results.push(...brushResults);
        splitCount += 1;
        return;
      }
      if (SolidBrushVisual.isBrushObject(mesh)) return;
      const split = this.planeSplit.splitMeshByPlane(mesh, plane);
      if (!split) return;
      const command = new SplitMeshCommand(
        mesh,
        split.frontMesh,
        split.backMesh,
        this.deps.worldObject
      );
      this.deps.commandStack.push(command);
      results.push(split.frontMesh, split.backMesh);
      splitCount += 1;
    });
    this.finishCommit(results, splitCount, targets.length, 'Split');
  }

  /**
   * Clips a solid brush target when the mesh belongs to a solid model.
   * @param mesh Selected mesh.
   * @param plane World clip plane.
   * @param keepFront Keep front half-space.
   * @returns Updated brush mesh, or null when not a brush / clip failed.
   */
  private clipSolidBrushTarget(
    mesh: THREE.Mesh,
    plane: THREE.Plane,
    keepFront: boolean
  ): THREE.Mesh | null {
    if (!SolidBrushVisual.isBrushObject(mesh)) return null;
    const model = SolidModel.fromObject(mesh);
    const brush = model?.findBrushByMesh(mesh);
    if (!model || !brush) return null;
    const command = new ClipSolidBrushCommand(
      model,
      brush.id,
      plane,
      keepFront
    );
    command.execute();
    if (!command.didClip()) return null;
    this.deps.commandStack.recordExecuted(command);
    const updated = model.findBrush(brush.id);
    return updated?.mesh ?? null;
  }

  /**
   * Splits a solid brush target into two brush pieces.
   * @param mesh Selected mesh.
   * @param plane World split plane.
   * @returns Result meshes, or null when not a brush / split failed.
   */
  private splitSolidBrushTarget(
    mesh: THREE.Mesh,
    plane: THREE.Plane
  ): THREE.Mesh[] | null {
    if (!SolidBrushVisual.isBrushObject(mesh)) return null;
    const model = SolidModel.fromObject(mesh);
    const brush = model?.findBrushByMesh(mesh);
    if (!model || !brush) return null;
    const command = new SplitSolidBrushCommand(model, brush.id, plane);
    command.execute();
    if (!command.didSplit()) return null;
    this.deps.commandStack.recordExecuted(command);
    return command.getResultMeshes();
  }

  /**
   * Cancels placement and deactivates the tool.
   */
  cancel(): void {
    this.endMarkerDrag(false);
    this.deps.clipPlaneTool.deactivate();
    this.deps.showStatusMessage('Clip tool cancelled');
  }

  /**
   * Starts dragging a placement marker when the pointer is over one.
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param renderer Viewport renderer.
   * @returns True when a drag started.
   */
  private tryBeginMarkerDrag(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ): boolean {
    const points = this.deps.clipPlaneTool.getPoints();
    const index = this.pointDrag.pickMarkerIndex(
      event,
      camera,
      renderer,
      points
    );
    if (index === null) return false;
    this.beginMarkerDrag(index, points[index], camera, renderer);
    return true;
  }

  /**
   * Begins a marker drag session with window-level move/up listeners.
   * @param index Placement point index.
   * @param point Starting world position.
   * @param camera Viewport camera.
   * @param renderer Viewport renderer.
   */
  private beginMarkerDrag(
    index: number,
    point: THREE.Vector3,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ): void {
    this.endMarkerDrag(false);
    this.draggingPointIndex = index;
    this.dragPlane = this.pointDrag.createDragPlane(point, camera);
    this.dragCamera = camera;
    this.dragRenderer = renderer;
    this.boundDragMove = (moveEvent) => this.onMarkerDragMove(moveEvent);
    this.boundDragUp = () => this.endMarkerDrag(true);
    window.addEventListener('pointermove', this.boundDragMove);
    window.addEventListener('pointerup', this.boundDragUp);
    this.deps.showStatusMessage(`Dragging clip point ${index + 1}`);
  }

  /**
   * Updates the dragged point from the pointer position.
   * @param event Pointer move event.
   */
  private onMarkerDragMove(event: PointerEvent): void {
    if (this.draggingPointIndex < 0) return;
    if (!this.dragPlane || !this.dragCamera || !this.dragRenderer) return;
    const point = this.pointDrag.projectOntoDragPlane(
      event,
      this.dragCamera,
      this.dragRenderer,
      this.dragPlane
    );
    if (!point) return;
    this.deps.clipPlaneTool.setPoint(this.draggingPointIndex, point);
  }

  /**
   * Ends an active marker drag and optionally syncs 2D clones.
   * @param syncViewports Whether to refresh 2D viewport clones.
   */
  private endMarkerDrag(syncViewports: boolean): void {
    if (this.boundDragMove) {
      window.removeEventListener('pointermove', this.boundDragMove);
    }
    if (this.boundDragUp) {
      window.removeEventListener('pointerup', this.boundDragUp);
    }
    const wasDragging = this.draggingPointIndex >= 0;
    this.boundDragMove = null;
    this.boundDragUp = null;
    this.draggingPointIndex = -1;
    this.dragPlane = null;
    this.dragCamera = null;
    this.dragRenderer = null;
    if (wasDragging && syncViewports) {
      this.deps.syncPrimitivesToViewports();
      this.deps.showStatusMessage(this.deps.clipPlaneTool.getStatusMessage());
    }
  }

  /**
   * Places a new clip point from a mesh or ground hit.
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param renderer Viewport renderer.
   * @returns True (event always consumed while tool is active).
   */
  private placeNewPoint(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ): boolean {
    const meshes = this.collectWorldMeshes();
    const point = this.pointPicker.pickPoint(event, camera, renderer, meshes);
    if (!point) {
      this.deps.showStatusMessage('Click a mesh or the ground plane');
      return true;
    }
    this.deps.clipPlaneTool.addPoint(point);
    this.deps.showStatusMessage(this.deps.clipPlaneTool.getStatusMessage());
    return true;
  }

  /**
   * Syncs preview visuals after tool state changes.
   */
  private onToolChanged(): void {
    this.preview.syncFromTool(this.deps.clipPlaneTool);
    this.deps.onToolStateChanged();
    if (this.draggingPointIndex < 0) {
      this.deps.syncPrimitivesToViewports();
    }
  }

  /**
   * Returns a ready plane or shows status and null.
   * @returns Plane or null.
   */
  private requireReadyPlane(): THREE.Plane | null {
    const plane = this.deps.clipPlaneTool.getPlane();
    if (!plane) {
      this.deps.showStatusMessage('Place at least two points first');
      return null;
    }
    return plane;
  }

  /**
   * Returns selected meshes or shows status and null.
   * @returns Selected meshes or null.
   */
  private requireTargets(): THREE.Mesh[] | null {
    const targets = this.deps.selectionManager.getAllSelectedObjectsAsArray();
    if (targets.length === 0) {
      this.deps.showStatusMessage('Select a mesh to clip');
      return null;
    }
    return targets;
  }

  /**
   * Finalizes selection, sync, and status after a successful commit batch.
   * @param results Created meshes.
   * @param successCount Meshes that produced results.
   * @param totalCount Attempted targets.
   * @param verb Status verb (Clipped / Split).
   */
  private finishCommit(
    results: THREE.Mesh[],
    successCount: number,
    totalCount: number,
    verb: string
  ): void {
    if (successCount === 0) {
      this.deps.showStatusMessage('Plane does not cut the selection');
      return;
    }
    this.deps.selectionManager.setSelection(results);
    this.deps.clipPlaneTool.deactivate();
    this.deps.syncPrimitivesToViewports();
    this.deps.refreshOutliner();
    this.deps.updateShadingMeshes();
    this.deps.showStatusMessage(
      `${verb} ${successCount}/${totalCount} mesh(es)`
    );
  }

  /**
   * Collects world meshes for surface picking.
   * @returns Mesh list.
   */
  private collectWorldMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this.deps.worldObject.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (this.isClipPreviewObject(child)) return;
      meshes.push(child);
    });
    return meshes;
  }

  /**
   * Returns true for clip plane preview helpers that must not be pick targets.
   * @param object Candidate object.
   * @returns True when the object is part of the clip preview.
   */
  private isClipPreviewObject(object: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current.userData[CLIP_PREVIEW_USERDATA_KEY] === true) return true;
      current = current.parent;
    }
    return false;
  }
}
