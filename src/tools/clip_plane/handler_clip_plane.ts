import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { CommandMeshClip } from '@/tools/clip_plane/commands/command_mesh_clip.js';
import { CommandMeshSplit } from '@/tools/clip_plane/commands/command_mesh_split.js';
import { CommandSolidBrushClip } from '@/solid/commands/brush/command_solid_brush_clip.js';
import { CommandSolidBrushSplit } from '@/solid/commands/brush/command_solid_brush_split.js';
import { CsgPlaneSplit } from '@/csg/csg_plane_split.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { ToolClipPlane } from './tool_clip_plane.js';
import { ClipPlanePointPicker } from './clip_plane_point_picker.js';
import { ClipPlanePointDrag } from './clip_plane_point_drag.js';
import { ClipPlanePreview, CLIP_PREVIEW_USERDATA_KEY } from './clip_plane_preview.js';
import { createClipPlanePlacementHint } from './clip_plane_depth_axis.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { RegistryModalToolSession } from '@/tools/session/registry_modal_tool_session.js';

/** Dependencies for running clip/split operations from the clip tool. */
export interface HandlerClipPlaneDependencies {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: ManagerSelection;
  gridSnap: GridSnap;
  clipPlaneTool: ToolClipPlane;
  modalToolSessionRegistry: RegistryModalToolSession;
  showStatusMessage: (message: string) => void;
  syncPrimitivesToViewports: () => void;
  refreshOutliner: () => void;
  updateShadingMeshes: () => void;
  onToolStateChanged: () => void;
}

/** Coordinates clip plane point picking, preview, drag, and commit operations. */
export class HandlerClipPlane {
  private deps: HandlerClipPlaneDependencies;
  private pointPicker: ClipPlanePointPicker;
  private pointDrag: ClipPlanePointDrag;
  private preview: ClipPlanePreview;
  private planeSplit: CsgPlaneSplit;
  private draggingPointIndex: number;
  private dragPlane: THREE.Plane | null;
  private dragCamera: THREE.Camera | null;
  private dragRenderer: HTMLElement | null;
  private boundDragMove: ((event: PointerEvent) => void) | null;
  private boundDragUp: ((event: PointerEvent) => void) | null;

  /**
   * Creates a clip plane handler.
   *
   * @param deps Shared editor systems.
   */
  constructor(deps: HandlerClipPlaneDependencies) {
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
    deps.selectionManager.onSelectionChanged(() => this.onSelectionChangedWhileClipActive());
  }

  /**
   * Returns the clip-plane preview instance.
   *
   * @returns Clip plane preview.
   */
  getPreview(): ClipPlanePreview {
    return this.preview;
  }

  /**
   * Re-parents the preview under the world root when needed and rebuilds
   * visuals.
   */
  reattachPreviewToWorld(): void {
    const previewRoot = this.preview.getRoot();
    if (previewRoot.parent !== this.deps.worldObject) {
      this.deps.worldObject.add(previewRoot);
    }
    this.syncPreviewFromTool();
  }

  /**
   * Scales placement markers for distance-based sizing with the given camera.
   *
   * @param camera Camera used for distance-based marker sizing.
   */
  updatePreviewScales(camera: THREE.Camera): void {
    if (!this.deps.clipPlaneTool.isActive()) return;
    this.preview.updateMarkerScalesForCamera(camera);
  }

  /**
   * Handles a viewport pointer-down while the clip tool is active. Grabs
   * existing markers first; otherwise places a new point.
   *
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param pickElement Viewport pickElement.
   * @returns True when the event was consumed.
   */
  onPointerDown(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement): boolean {
    if (!this.deps.clipPlaneTool.isActive()) return false;
    if (this.tryBeginMarkerDrag(event, camera, pickElement)) return true;
    return this.placeNewPoint(event, camera, pickElement);
  }

  /**
   * Returns whether a placement marker is currently being dragged.
   *
   * @returns True while a marker drag session is live.
   */
  isMarkerDragging(): boolean {
    return this.draggingPointIndex >= 0;
  }

  /**
   * Continues an active marker drag for the given pointer position.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param shiftKey True when shift is held (disables snap).
   */
  onEditorPointerMove(clientX: number, clientY: number, shiftKey: boolean): void {
    if (this.draggingPointIndex < 0) {
      return;
    }
    if (!this.dragPlane || !this.dragCamera || !this.dragRenderer) {
      return;
    }
    const synthetic = this.createSyntheticMouseEvent(clientX, clientY, shiftKey);
    const applySnap = !shiftKey;
    const point = this.pointDrag.projectOntoDragPlane(
      synthetic,
      this.dragCamera,
      this.dragRenderer,
      this.dragPlane,
      applySnap,
    );
    if (!point) {
      return;
    }
    this.deps.clipPlaneTool.setPoint(this.draggingPointIndex, point);
  }

  /**
   * Ends an active marker drag.
   *
   * @param syncViewports Whether to refresh viewport selectables and selection
   *   visuals.
   */
  onEditorPointerUp(syncViewports: boolean = true): void {
    this.endMarkerDrag(syncViewports);
  }

  /**
   * Builds a minimal mouse event carrying client coordinates and shift state.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param shiftKey Shift modifier.
   * @returns Synthetic mouse event.
   */
  createSyntheticMouseEvent(clientX: number, clientY: number, shiftKey: boolean = false): MouseEvent {
    return {
      clientX,
      clientY,
      shiftKey,
      button: 0,
      buttons: 1,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as MouseEvent;
  }

  /** Flips the keep side of the active plane. */
  flipPlane(): void {
    if (!this.deps.clipPlaneTool.isActive()) return;
    this.deps.clipPlaneTool.flipKeepSide();
    this.deps.showStatusMessage(
      this.deps.clipPlaneTool.getKeepFront() ? 'Keep front half-space' : 'Keep back half-space',
    );
  }

  /** Commits a one-sided clip on all selected meshes and solid brushes. */
  commitClip(): void {
    const plane = this.requireReadyPlane();
    if (!plane) return;
    const targets = this.requireTargets();
    if (!targets) return;
    const results: THREE.Mesh[] = [];
    let clippedCount = 0;
    const keepFront = this.deps.clipPlaneTool.getKeepFront();
    targets.forEach((mesh) => {
      clippedCount += this.clipOneTarget(mesh, plane, keepFront, results) ? 1 : 0;
    });
    this.finishCommit(results, clippedCount, targets.length, 'Clipped');
  }

  /** Commits a split into two solids for each selected mesh or brush. */
  commitSplit(): void {
    const plane = this.requireReadyPlane();
    if (!plane) return;
    const targets = this.requireTargets();
    if (!targets) return;
    const results: THREE.Mesh[] = [];
    let splitCount = 0;
    targets.forEach((mesh) => {
      splitCount += this.splitOneTarget(mesh, plane, results) ? 1 : 0;
    });
    this.finishCommit(results, splitCount, targets.length, 'Split');
  }

  /**
   * Clips one mesh or solid brush into the keep half-space.
   *
   * @param mesh Selected mesh target.
   * @param plane Clip plane.
   * @param keepFront Whether to keep the front half-space.
   * @param results Accumulator for result meshes.
   * @returns True when a clip was applied.
   */
  private clipOneTarget(mesh: THREE.Mesh, plane: THREE.Plane, keepFront: boolean, results: THREE.Mesh[]): boolean {
    const brushResult = this.clipSolidBrushTarget(mesh, plane, keepFront);
    if (brushResult) {
      results.push(brushResult);
      return true;
    }
    if (SolidBrushVisual.isBrushObject(mesh)) return false;
    const result = this.planeSplit.clipMeshToPlane(mesh, plane, keepFront);
    if (!result) return false;
    this.deps.commandStack.push(new CommandMeshClip(mesh, result, this.deps.worldObject));
    results.push(result);
    return true;
  }

  /**
   * Splits one mesh or solid brush into two halves.
   *
   * @param mesh Selected mesh target.
   * @param plane Split plane.
   * @param results Accumulator for result meshes.
   * @returns True when a split was applied.
   */
  private splitOneTarget(mesh: THREE.Mesh, plane: THREE.Plane, results: THREE.Mesh[]): boolean {
    const brushResults = this.splitSolidBrushTarget(mesh, plane);
    if (brushResults) {
      results.push(...brushResults);
      return true;
    }
    if (SolidBrushVisual.isBrushObject(mesh)) return false;
    const split = this.planeSplit.splitMeshByPlane(mesh, plane);
    if (!split) return false;
    this.deps.commandStack.push(new CommandMeshSplit(mesh, split.frontMesh, split.backMesh, this.deps.worldObject));
    results.push(split.frontMesh, split.backMesh);
    return true;
  }

  /**
   * Clips a solid brush target when the mesh belongs to a solid model.
   *
   * @param mesh Selected mesh.
   * @param plane World clip plane.
   * @param keepFront Keep front half-space.
   * @returns Updated brush mesh, or null when not a brush / clip failed.
   */
  private clipSolidBrushTarget(mesh: THREE.Mesh, plane: THREE.Plane, keepFront: boolean): THREE.Mesh | null {
    if (!SolidBrushVisual.isBrushObject(mesh)) return null;
    const model = SolidModel.fromObject(mesh);
    const brush = model?.findBrushByMesh(mesh);
    if (!model || !brush) return null;
    const command = new CommandSolidBrushClip(model, brush.id, plane, keepFront);
    command.execute();
    if (!command.didClip()) return null;
    this.deps.commandStack.recordExecuted(command);
    const updated = model.findBrush(brush.id);
    return updated?.mesh ?? null;
  }

  /**
   * Splits a solid brush target into two brush pieces.
   *
   * @param mesh Selected mesh.
   * @param plane World split plane.
   * @returns Result meshes, or null when not a brush / split failed.
   */
  private splitSolidBrushTarget(mesh: THREE.Mesh, plane: THREE.Plane): THREE.Mesh[] | null {
    if (!SolidBrushVisual.isBrushObject(mesh)) return null;
    const model = SolidModel.fromObject(mesh);
    const brush = model?.findBrushByMesh(mesh);
    if (!model || !brush) return null;
    const command = new CommandSolidBrushSplit(model, brush.id, plane);
    command.execute();
    if (!command.didSplit()) return null;
    this.deps.commandStack.recordExecuted(command);
    return command.getResultMeshes();
  }

  /** Cancels placement and deactivates the tool. */
  cancel(): void {
    this.endMarkerDrag(false);
    this.deps.clipPlaneTool.deactivate();
    this.deps.showStatusMessage('Clip tool cancelled');
  }

  /**
   * Starts dragging a placement marker when the pointer is over one.
   *
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param pickElement Viewport pickElement.
   * @returns True when a drag started.
   */
  private tryBeginMarkerDrag(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement): boolean {
    const points = this.deps.clipPlaneTool.getPoints();
    const index = this.pointDrag.pickMarkerIndex(event, camera, pickElement, points);
    if (index === null) return false;
    this.beginMarkerDrag(index, points[index]!, camera, pickElement);
    return true;
  }

  /**
   * Begins a marker drag session for one placement point.
   *
   * @param index Placement point index.
   * @param point Starting world position.
   * @param camera Viewport camera.
   * @param pickElement Viewport pickElement.
   */
  private beginMarkerDrag(index: number, point: THREE.Vector3, camera: THREE.Camera, pickElement: HTMLElement): void {
    this.endMarkerDrag(false);
    this.draggingPointIndex = index;
    this.dragPlane = this.pointDrag.createDragPlane(point, camera);
    this.dragCamera = camera;
    this.dragRenderer = pickElement;
    this.deps.showStatusMessage(`Dragging clip point ${index + 1}`);
  }

  /**
   * Ends an active marker drag and optionally refreshes viewport visuals.
   *
   * @param syncViewports Whether to refresh viewport selectables and selection
   *   visuals.
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
   *
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param pickElement Viewport pickElement.
   * @returns True (event always consumed while tool is active).
   */
  private placeNewPoint(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement): boolean {
    const meshes = this.collectWorldMeshes();
    const pick = this.pointPicker.pickPoint(event, camera, pickElement, meshes);
    if (!pick) {
      this.deps.showStatusMessage('Click a mesh or the ground plane');
      return true;
    }
    const placementHint = createClipPlanePlacementHint(camera, pick.surfaceNormal);
    this.deps.clipPlaneTool.addPoint(pick.point, placementHint);
    this.deps.showStatusMessage(this.deps.clipPlaneTool.getStatusMessage());
    return true;
  }

  /** Syncs preview visuals after tool state changes. */
  private onToolChanged(): void {
    this.syncPreviewFromTool();
    this.deps.onToolStateChanged();
    if (this.draggingPointIndex < 0) {
      this.deps.syncPrimitivesToViewports();
    }
  }

  /**
   * Syncs the clip preview when the tool is active; returns immediately when
   * inactive.
   */
  private onSelectionChangedWhileClipActive(): void {
    if (!this.deps.clipPlaneTool.isActive()) return;
    this.syncPreviewFromTool();
  }

  /**
   * Rebuilds clip preview markers, guide line, and cut silhouettes from the
   * tool and the current selected mesh targets.
   */
  private syncPreviewFromTool(): void {
    this.preview.syncFromTool(this.deps.clipPlaneTool, this.collectClipPreviewTargets());
  }

  /**
   * Returns selected meshes that are not clip-plane preview objects.
   *
   * @returns Selected mesh targets.
   */
  private collectClipPreviewTargets(): THREE.Mesh[] {
    return this.deps.selectionManager.getAllSelectedObjectsAsArray().filter((object) => {
      return object instanceof THREE.Mesh && !this.isClipPreviewObject(object);
    });
  }

  /**
   * Returns a ready plane or shows status and null.
   *
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
   *
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
   * Finalizes selection, viewport sync, outliner refresh, shading update, and
   * status after a successful commit batch. Resets plane placement for another
   * cut without deactivating the tool.
   *
   * @param results Created or updated meshes.
   * @param successCount Meshes that produced results.
   * @param totalCount Attempted targets.
   * @param verb Status verb (Clipped / Split).
   */
  private finishCommit(results: THREE.Mesh[], successCount: number, totalCount: number, verb: string): void {
    if (successCount === 0) {
      this.deps.showStatusMessage('Plane does not cut the selection');
      return;
    }
    this.deps.modalToolSessionRegistry.runWithSelectionEndSuppressed(() => {
      this.selectCommitResults(results);
    });
    this.deps.clipPlaneTool.resetPlacementForNextCut();
    this.deps.syncPrimitivesToViewports();
    this.deps.refreshOutliner();
    this.deps.updateShadingMeshes();
    this.deps.showStatusMessage(`${verb} ${successCount}/${totalCount} · place points to cut again`);
  }

  /**
   * Selects the meshes produced by a clip or split commit.
   *
   * @param results Candidate result meshes (nullish entries ignored).
   */
  private selectCommitResults(results: THREE.Mesh[]): void {
    const selectable = results.filter((mesh) => mesh instanceof THREE.Mesh && mesh.parent !== null);
    if (selectable.length === 0) return;
    this.deps.selectionManager.setSelection(selectable);
  }

  /**
   * Collects mesh children of the world object, excluding clip-plane preview
   * objects.
   *
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
   * Returns whether the object or any ancestor carries clip-plane preview
   * userdata.
   *
   * @param object Candidate object to test.
   * @returns True when clip-plane preview userdata is found on the object or an
   *   ancestor.
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
