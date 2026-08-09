import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis } from '@/types/transform_mode.js';
import { BoundsFace, BOUNDS_FACE_USERDATA_KEY } from '@/types/bounds_face.js';
import { GizmoHandle } from '@/transform/gizmo/gizmo_handle.js';
import { getAllBoundsFaces, getBoundsFaceLocalNormal, DataOrientedBounds } from './builder_oriented_bounds.js';
import { BoundsGuideLines } from './bounds_guide_lines.js';
import {
  applyBoundsFaceEdgeHighlight,
  BOUNDS_FACE_EDGE_HIGHLIGHT_KEY,
  createUnitFaceEdgeHighlightGeometry,
  type BoundsFaceHighlightMode,
} from './bounds_face_highlight.js';
import {
  BOUNDS_HANDLE_FACE_HALF_KEY,
  BOUNDS_HANDLE_IS_EAR_KEY,
  BOUNDS_HANDLE_WORLD_SIZE_KEY,
  createCadResizeCubeGeometry,
} from './bounds_cad_flap.js';
import { getHiddenBoundsAxesForViewPlane, type CadViewPlane } from '@/rulers/view/cad_view_plane.js';
import {
  applyGizmoFrontRenderOrder,
  createGizmoFrontMaterial,
  createGizmoOccludedMesh,
  GizmoVisualStyle,
} from '@/transform/gizmo/gizmo_visual_style.js';
import {
  BOUNDS_ARROW_VISUAL_GROUP_KEY,
  BOUNDS_CUBE_PICK_KEY,
  BOUNDS_CUBE_VISUAL_KEY,
  BOUNDS_FACE_AXIS_USERDATA_KEY,
} from './gizmo_bounds_keys.js';
import { GizmoBoundsScreenStyle } from './gizmo_bounds_screen_style.js';

export {
  BOUNDS_ARROW_VISUAL_GROUP_KEY,
  BOUNDS_CUBE_PICK_KEY,
  BOUNDS_CUBE_VISUAL_KEY,
  BOUNDS_EAR_BASE_COLOR_KEY,
  BOUNDS_FACE_AXIS_USERDATA_KEY,
} from './gizmo_bounds_keys.js';

/**
 * CAD-style bounds gizmo: cyan wire OBB, axis-tinted resize arrows in 3D,
 * screen-space ears in 2D, full-face pick planes for move, and edge outlines
 * for resize (orange) or 3D body-move (white) hover.
 */
export class GizmoBounds {
  private theme: typeof Theme;
  private handles: GizmoHandle[];
  private rootGroup: THREE.Group;
  private wireframe: THREE.LineSegments | null;
  private handleMeshes: Map<BoundsFace, THREE.Mesh>;
  private facePickMeshes: Map<BoundsFace, THREE.Mesh>;
  private edgeHighlightMeshes: Map<BoundsFace, THREE.LineSegments>;
  private guideLines: BoundsGuideLines | null;
  private currentBounds: DataOrientedBounds | null;
  private cubePickWorldSize: number;
  private cubeVisualWorldSize: number;
  private earWorldSize: number;
  private guideLinesWanted: boolean;
  private resizeHandlesWanted: boolean;
  private highlightedFace: BoundsFace | null;
  private highlightMode: BoundsFaceHighlightMode;
  private readonly screenStyle: GizmoBoundsScreenStyle;

  /**
   * Creates a bounds gizmo builder.
   *
   * @param theme Theme colors for wireframe and handles.
   */
  constructor(theme: typeof Theme) {
    this.theme = theme;
    this.handles = [];
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'gizmo_bounds';
    this.wireframe = null;
    this.handleMeshes = new Map();
    this.facePickMeshes = new Map();
    this.edgeHighlightMeshes = new Map();
    this.guideLines = null;
    this.currentBounds = null;
    this.cubePickWorldSize = 0.18;
    this.cubeVisualWorldSize = 0.12;
    this.earWorldSize = 0.18;
    this.guideLinesWanted = false;
    this.resizeHandlesWanted = true;
    this.highlightedFace = null;
    this.highlightMode = 'resize';
    this.screenStyle = new GizmoBoundsScreenStyle({
      getCurrentBounds: () => this.currentBounds,
      areResizeHandlesWanted: () => this.resizeHandlesWanted,
      getHighlightedFace: () => this.highlightedFace,
      getHighlightMode: () => this.highlightMode,
      getTheme: () => this.theme,
      subtleAxisTintColor: (face) => this.subtleAxisTintColor(face),
      getEarWorldSize: () => this.earWorldSize,
    });
  }

  /**
   * Builds wireframe, face picks, mid-face resize handles, edge highlights, and
   * guide lines.
   *
   * @returns Gizmo handles for raycast id matching.
   */
  createHandles(): GizmoHandle[] {
    this.disposeInternalResources();
    this.handles = [];
    this.highlightedFace = null;
    this.highlightMode = 'resize';
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'gizmo_bounds';
    this.createWireframe();
    this.createFacePickMeshes();
    this.createResizeHandles();
    this.createEdgeHighlightMeshes();
    this.createGuideLines();
    this.showInteractiveParts();
    return this.handles;
  }

  /**
   * Returns scene objects to parent under the transform gizmo group.
   *
   * @returns An array containing the bounds root group.
   */
  getAllSceneObjects(): THREE.Object3D[] {
    return [this.rootGroup];
  }

  /**
   * Returns the current handle list.
   *
   * @returns Active gizmo handles.
   */
  getHandles(): GizmoHandle[] {
    return this.handles;
  }

  /**
   * Updates gizmo pose and size from oriented bounds data.
   *
   * @param bounds The OBB to display, or null to hide contents.
   * @param cubePickWorldSize World edge length for 3D pick volumes.
   * @param earWorldSize Fallback world base size for 2D ears (screen path
   *   preferred).
   * @param cubeVisualWorldSize World length for visible 3D arrows.
   */
  updateFromBounds(
    bounds: DataOrientedBounds | null,
    cubePickWorldSize: number = 0.18,
    earWorldSize: number = 0.18,
    cubeVisualWorldSize: number = cubePickWorldSize * 0.7,
  ): void {
    this.currentBounds = bounds;
    this.cubePickWorldSize = Math.max(1e-6, cubePickWorldSize);
    this.cubeVisualWorldSize = Math.max(1e-6, Math.min(cubeVisualWorldSize, this.cubePickWorldSize));
    this.earWorldSize = Math.max(0.08, earWorldSize);
    if (!bounds) {
      this.rootGroup.visible = false;
      this.guideLines?.setVisible(false);
      return;
    }
    this.rootGroup.visible = true;
    this.rootGroup.position.copy(bounds.center);
    this.rootGroup.quaternion.copy(bounds.quaternion);
    this.rootGroup.scale.set(1, 1, 1);
    this.updateWireframeGeometry(bounds.halfExtents);
    this.updateHandlePositions(bounds.halfExtents);
    this.updateFacePickGeometry(bounds.halfExtents);
    this.updateEdgeHighlightGeometry(bounds.halfExtents);
    this.updateGuideLines(bounds.halfExtents);
    this.showInteractiveParts();
    this.applyHighlightedFace();
  }

  /**
   * Highlights a bounds face via edge outline (orange resize or white move).
   *
   * @param face Face to outline, or null to clear.
   * @param mode Resize vs body-move hover styling.
   */
  setHighlightedFace(face: BoundsFace | null, mode: BoundsFaceHighlightMode = 'resize'): void {
    this.highlightedFace = face;
    this.highlightMode = face ? mode : 'resize';
    this.applyHighlightedFace();
  }

  /**
   * Returns the face currently highlighted for hover.
   *
   * @returns Highlighted face, or null.
   */
  getHighlightedFace(): BoundsFace | null {
    return this.highlightedFace;
  }

  /**
   * Returns whether the active outline is resize or body-move.
   *
   * @returns Highlight mode.
   */
  getHighlightMode(): BoundsFaceHighlightMode {
    return this.highlightMode;
  }

  /**
   * Re-applies edge-outline highlight on an arbitrary gizmo root.
   *
   * @param root Group tree containing bounds edge highlight objects.
   * @param allowMoveHighlight When false, white move outlines are suppressed
   *   (2D).
   */
  applyHighlightToRoot(root: THREE.Object3D, allowMoveHighlight: boolean = true): void {
    applyBoundsFaceEdgeHighlight(root, this.highlightedFace, this.highlightMode, this.theme, allowMoveHighlight);
    this.screenStyle.applyEarHighlightColors(root);
  }

  /** Applies the stored edge highlight on the master root. */
  private applyHighlightedFace(): void {
    this.applyHighlightToRoot(this.rootGroup, true);
  }

  /**
   * Shows or hides RGB corner guide lines (used while dragging bounds).
   *
   * @param visible Whether guide lines should be drawn.
   */
  setGuideLinesVisible(visible: boolean): void {
    this.guideLinesWanted = visible;
    if (!this.guideLines) return;
    this.guideLines.setVisible(visible && this.currentBounds !== null);
  }

  /**
   * Returns whether guide lines are requested to be shown.
   *
   * @returns True when guide lines should be visible during bounds drag.
   */
  areGuideLinesVisible(): boolean {
    return this.guideLinesWanted && (this.guideLines?.isVisible() ?? false);
  }

  /**
   * Shows or hides mid-face resize grips (2D CAD ears and 3D face arrows).
   * Hidden during bounds body-move (position) drags where extents do not
   * change; kept visible during resize so the active grip stays on the face.
   * Face pick planes stay so the drag can continue.
   *
   * @param visible Whether resize grips should be drawn.
   */
  setResizeHandlesVisible(visible: boolean): void {
    this.resizeHandlesWanted = visible;
    this.applyResizeHandleVisibility();
  }

  /**
   * Returns whether resize grips are requested to be shown.
   *
   * @returns True when 2D ears / 3D arrows should draw.
   */
  areResizeHandlesVisible(): boolean {
    return this.resizeHandlesWanted;
  }

  /**
   * Returns the last bounds applied to this gizmo.
   *
   * @returns Oriented bounds data, or null.
   */
  getCurrentBounds(): DataOrientedBounds | null {
    return this.currentBounds;
  }

  /** Disposes geometries and materials created by this gizmo. */
  dispose(): void {
    this.disposeInternalResources();
    this.handles = [];
  }

  /** Creates RGB corner guide lines (hidden until a bounds drag begins). */
  private createGuideLines(): void {
    this.guideLines = new BoundsGuideLines(this.theme);
    this.guideLines.setVisible(false);
    this.rootGroup.add(this.guideLines.getObject());
  }

  /**
   * Rebuilds guide-line geometry for the current half extents.
   *
   * @param halfExtents Local half extents of the OBB.
   */
  private updateGuideLines(halfExtents: THREE.Vector3): void {
    if (!this.guideLines) return;
    this.guideLines.updateFromHalfExtents(halfExtents);
    this.guideLines.setVisible(this.guideLinesWanted);
  }

  /** Creates the unit wire box that will be scaled to half extents. */
  private createWireframe(): void {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const edges = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    const material = new THREE.LineBasicMaterial({
      color: this.theme.boundsWireColor,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
    });
    this.wireframe = new THREE.LineSegments(edges, material);
    this.wireframe.renderOrder = 999;
    this.wireframe.name = 'bounds_wireframe';
    this.rootGroup.add(this.wireframe);
  }

  /** Creates six full-face pick planes for move (interior drag). */
  private createFacePickMeshes(): void {
    getAllBoundsFaces().forEach((face) => {
      const mesh = this.createFacePickMesh(face);
      this.facePickMeshes.set(face, mesh);
      this.rootGroup.add(mesh);
    });
  }

  /**
   * Creates one nearly-invisible pick plane for a bounds face.
   *
   * @param face The face this plane represents.
   * @returns A configured mesh.
   */
  private createFacePickMesh(face: BoundsFace): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(2, 2);
    // Invisible to the renderer (material.visible false) but still raycastable.
    // Never join the transparent sort list with opacity 0.001 quads — that path
    // scales poorly with thousands of transparent brush edges in large maps.
    const material = new THREE.MeshBasicMaterial({
      color: this.theme.boundsWireColor,
      transparent: false,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      colorWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    material.visible = false;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData[BOUNDS_FACE_USERDATA_KEY] = face;
    mesh.userData['isBoundsFacePick'] = true;
    mesh.name = `bounds_face_pick_${face}`;
    mesh.renderOrder = 998;
    this.orientFaceMesh(mesh, face);
    return mesh;
  }

  /**
   * Creates six 3D resize arrow grips (perspective default). Orthographic
   * clones restyle them into CAD ears via {@link styleCloneForViewPlane}.
   */
  private createResizeHandles(): void {
    getAllBoundsFaces().forEach((face) => {
      const mesh = this.createArrowHandleMesh(face);
      const tint = this.subtleAxisTintColor(face);
      const handle = new GizmoHandle(this.axisForFace(face), tint, mesh);
      handle.setHoverColorValue(this.theme.boundsHandleHoverColor);
      const handleId = handle.getHandleId();
      mesh.userData['handleId'] = handleId;
      mesh.userData[BOUNDS_FACE_USERDATA_KEY] = face;
      mesh.userData[BOUNDS_FACE_AXIS_USERDATA_KEY] = this.axisLetterForFace(face);
      mesh.userData[BOUNDS_HANDLE_IS_EAR_KEY] = false;
      this.tagHandleIdOnDescendants(mesh, handleId, face);
      this.handleMeshes.set(face, mesh);
      this.rootGroup.add(mesh);
      this.handles.push(handle);
    });
  }

  /**
   * Copies handle id and face onto every mesh under a 3D grip so raycasts that
   * hit the visible arrow match the same GizmoHandle as the pick volume.
   *
   * @param root Handle root (pick mesh).
   * @param handleId Shared handle identifier.
   * @param face Bounds face for this grip.
   */
  private tagHandleIdOnDescendants(root: THREE.Object3D, handleId: number, face: BoundsFace): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.userData['handleId'] = handleId;
      child.userData[BOUNDS_FACE_USERDATA_KEY] = face;
      child.userData[BOUNDS_FACE_AXIS_USERDATA_KEY] = this.axisLetterForFace(face);
    });
  }

  /**
   * Builds an invisible pick volume with a depth-aware resize arrow (front and
   * occluded ghost) pointing along the face outward normal.
   *
   * @param face The bounds face.
   * @returns The pick mesh (handle root).
   */
  private createArrowHandleMesh(face: BoundsFace): THREE.Mesh {
    const pickGeometry = createCadResizeCubeGeometry();
    // Pick volume only: skip transparent draw so large maps do not sort these
    // with every brush edge each frame. Raycasts still hit Object3D.visible meshes.
    const pickMaterial = new THREE.MeshBasicMaterial({
      color: this.theme.boundsHandleColor,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      opacity: 1,
      colorWrite: false,
      toneMapped: false,
    });
    pickMaterial.visible = false;
    const pickMesh = new THREE.Mesh(pickGeometry, pickMaterial);
    pickMesh.name = `bounds_handle_${face}`;
    pickMesh.renderOrder = GizmoVisualStyle.frontRenderOrder;
    pickMesh.userData[BOUNDS_CUBE_PICK_KEY] = true;
    const tint = this.subtleAxisTintColor(face);
    this.addArrowVisuals(pickMesh, tint);
    return pickMesh;
  }

  /**
   * Adds a visual group with front and occluded stem/head arrow parts. Scaling
   * the group keeps cone and cylinder attached at every camera distance. Local
   * +Y is the pull direction (aligned to the face normal later).
   *
   * @param pickMesh Handle root.
   * @param color Subtle axis-tinted fill color.
   */
  private addArrowVisuals(pickMesh: THREE.Mesh, color: number): void {
    const visualGroup = new THREE.Group();
    visualGroup.name = 'bounds_handle_arrow_visual';
    visualGroup.userData[BOUNDS_ARROW_VISUAL_GROUP_KEY] = true;
    const stemLength = 0.62;
    const headLength = 0.38;
    const stemGeometry = new THREE.CylinderGeometry(0.12, 0.12, stemLength, 10);
    const headGeometry = new THREE.ConeGeometry(0.22, headLength, 10);
    const stemFront = new THREE.Mesh(stemGeometry, createGizmoFrontMaterial(color));
    applyGizmoFrontRenderOrder(stemFront);
    stemFront.position.set(0, stemLength * 0.5, 0);
    stemFront.userData[BOUNDS_CUBE_VISUAL_KEY] = true;
    stemFront.name = 'bounds_handle_arrow_stem';
    const headFront = new THREE.Mesh(headGeometry, createGizmoFrontMaterial(color));
    applyGizmoFrontRenderOrder(headFront);
    headFront.position.set(0, stemLength + headLength * 0.5, 0);
    headFront.userData[BOUNDS_CUBE_VISUAL_KEY] = true;
    headFront.name = 'bounds_handle_arrow_head';
    const stemGhost = createGizmoOccludedMesh(stemGeometry, color);
    stemGhost.position.copy(stemFront.position);
    stemGhost.userData[BOUNDS_CUBE_VISUAL_KEY] = true;
    const headGhost = createGizmoOccludedMesh(headGeometry, color);
    headGhost.position.copy(headFront.position);
    headGhost.userData[BOUNDS_CUBE_VISUAL_KEY] = true;
    visualGroup.add(stemGhost, headGhost, stemFront, headFront);
    pickMesh.add(visualGroup);
  }

  /**
   * Mixes a hint of axis RGB into the steel bounds handle color.
   *
   * @param face Bounds face determining the axis.
   * @returns Hex color with a light axis tint.
   */
  private subtleAxisTintColor(face: BoundsFace): number {
    const letter = this.axisLetterForFace(face);
    const axisHex =
      letter === 'x'
        ? this.theme.gizmoXAxisColor
        : letter === 'y'
          ? this.theme.gizmoYAxisColor
          : this.theme.gizmoZAxisColor;
    const base = new THREE.Color(this.theme.boundsHandleColor);
    const axis = new THREE.Color(axisHex);
    base.lerp(axis, 0.28);
    return base.getHex();
  }

  /**
   * Styles a viewport gizmo clone for its view plane: arrows stay in 3D; 2D
   * panes get flat CAD ears on in-plane faces and hide depth-axis resize grips.
   * Face pick planes remain so body-drag still works.
   *
   * @param root Viewport gizmo clone root.
   * @param viewPlane Plane for this viewport (`xyz` = perspective).
   */
  styleCloneForViewPlane(root: THREE.Object3D, viewPlane: CadViewPlane): void {
    if (viewPlane === 'xyz') return;
    this.screenStyle.styleCloneForViewPlane(root, viewPlane, getHiddenBoundsAxesForViewPlane(viewPlane));
  }

  /**
   * Applies per-frame screen-space sizing for a viewport bounds clone (2D ears
   * constant on screen; 3D pick versus visual arrow sizes).
   *
   * @param root Viewport gizmo clone.
   * @param viewPlane Plane for this viewport.
   * @param camera Active viewport camera.
   * @param viewportHeightPx Drawable pane height in CSS pixels.
   */
  applyScreenSpaceStyleToClone(
    root: THREE.Object3D,
    viewPlane: CadViewPlane,
    camera: THREE.Camera,
    viewportHeightPx: number,
  ): void {
    this.screenStyle.applyScreenSpaceStyleToClone(root, viewPlane, camera, viewportHeightPx);
  }

  /** Creates per-face orange edge outlines used for resize hover. */
  private createEdgeHighlightMeshes(): void {
    getAllBoundsFaces().forEach((face) => {
      const geometry = createUnitFaceEdgeHighlightGeometry();
      const material = new THREE.LineBasicMaterial({
        color: this.theme.selectionColor,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
      });
      const lines = new THREE.LineSegments(geometry, material);
      lines.name = `bounds_face_edge_highlight_${face}`;
      lines.userData[BOUNDS_FACE_USERDATA_KEY] = face;
      lines.userData[BOUNDS_FACE_AXIS_USERDATA_KEY] = this.axisLetterForFace(face);
      lines.userData[BOUNDS_FACE_EDGE_HIGHLIGHT_KEY] = true;
      lines.visible = false;
      lines.renderOrder = 1001;
      this.orientFaceMesh(lines, face);
      this.edgeHighlightMeshes.set(face, lines);
      this.rootGroup.add(lines);
    });
  }

  /**
   * Scales the wireframe box to match half extents.
   *
   * @param halfExtents Local half extents of the OBB.
   */
  private updateWireframeGeometry(halfExtents: THREE.Vector3): void {
    if (!this.wireframe) return;
    this.wireframe.scale.set(
      Math.max(halfExtents.x, 0.001),
      Math.max(halfExtents.y, 0.001),
      Math.max(halfExtents.z, 0.001),
    );
  }

  /**
   * Places 3D arrow grips just outside each face center. Orthographic clones
   * restyle these into CAD ears via {@link styleCloneForViewPlane}.
   *
   * @param halfExtents Local half extents of the OBB.
   */
  private updateHandlePositions(halfExtents: THREE.Vector3): void {
    const pickSize = this.cubePickWorldSize;
    const visualSize = this.cubeVisualWorldSize;
    this.handleMeshes.forEach((mesh, face) => {
      const half = this.halfExtentForFace(halfExtents, face);
      mesh.userData[BOUNDS_HANDLE_WORLD_SIZE_KEY] = this.earWorldSize;
      mesh.userData[BOUNDS_HANDLE_FACE_HALF_KEY] = half;
      mesh.userData[BOUNDS_HANDLE_IS_EAR_KEY] = false;
      mesh.userData[BOUNDS_CUBE_PICK_KEY] = true;
      this.screenStyle.scaleArrowPickAndVisual(mesh, pickSize, visualSize);
    });
  }

  /**
   * Sizes and places face pick planes on each OBB face.
   *
   * @param halfExtents Local half extents of the OBB.
   */
  private updateFacePickGeometry(halfExtents: THREE.Vector3): void {
    this.facePickMeshes.forEach((mesh, face) => {
      this.placeAndScaleFaceOverlay(mesh, face, halfExtents);
    });
  }

  /**
   * Sizes and places edge highlight loops on each OBB face.
   *
   * @param halfExtents Local half extents of the OBB.
   */
  private updateEdgeHighlightGeometry(halfExtents: THREE.Vector3): void {
    this.edgeHighlightMeshes.forEach((lines, face) => {
      this.placeAndScaleFaceOverlay(lines, face, halfExtents);
    });
  }

  /**
   * Positions and scales a face-aligned overlay (pick plane or edge loop).
   *
   * @param object Face-aligned object.
   * @param face Bounds face.
   * @param halfExtents OBB half extents.
   */
  private placeAndScaleFaceOverlay(object: THREE.Object3D, face: BoundsFace, halfExtents: THREE.Vector3): void {
    this.orientFaceMesh(object, face);
    const localNormal = getBoundsFaceLocalNormal(face);
    const half = this.halfExtentForFace(halfExtents, face);
    object.position.copy(localNormal.multiplyScalar(half));
    this.scaleFaceOverlay(object, face, halfExtents);
  }

  /**
   * Scales a face overlay to the face rectangle (unit geometry spans ±1).
   *
   * @param object Face-aligned object.
   * @param face The face being covered.
   * @param halfExtents OBB half extents.
   */
  private scaleFaceOverlay(object: THREE.Object3D, face: BoundsFace, halfExtents: THREE.Vector3): void {
    if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
      object.scale.set(halfExtents.z, halfExtents.y, 1);
      return;
    }
    if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
      object.scale.set(halfExtents.x, halfExtents.z, 1);
      return;
    }
    object.scale.set(halfExtents.x, halfExtents.y, 1);
  }

  /**
   * Orients an object so local +Z matches the bounds face normal.
   *
   * @param object The plane or edge object.
   * @param face The target face.
   */
  private orientFaceMesh(object: THREE.Object3D, face: BoundsFace): void {
    const normal = getBoundsFaceLocalNormal(face);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    object.quaternion.copy(quaternion);
  }

  /** Shows face picks and applies the current resize-grip visibility policy. */
  private showInteractiveParts(): void {
    this.applyResizeHandleVisibility();
    this.facePickMeshes.forEach((mesh) => {
      mesh.visible = true;
    });
  }

  /**
   * Applies {@link resizeHandlesWanted} to every mid-face resize grip root
   * (including nested 3D arrow visuals).
   */
  private applyResizeHandleVisibility(): void {
    this.handleMeshes.forEach((mesh) => {
      mesh.visible = this.resizeHandlesWanted;
    });
  }

  /**
   * Maps a face to a gizmo axis for handle storage.
   *
   * @param face The bounds face.
   * @returns The related GizmoAxis.
   */
  private axisForFace(face: BoundsFace): GizmoAxis {
    if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) return GizmoAxis.X;
    if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) return GizmoAxis.Y;
    return GizmoAxis.Z;
  }

  /**
   * Maps a face to an axis letter for orthographic depth filtering.
   *
   * @param face The bounds face.
   * @returns Axis letter.
   */
  private axisLetterForFace(face: BoundsFace): 'x' | 'y' | 'z' {
    if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) return 'x';
    if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) return 'y';
    return 'z';
  }

  /**
   * Reads half extent for a face axis.
   *
   * @param halfExtents Full half extent vector.
   * @param face The face.
   * @returns Half size along the face axis.
   */
  private halfExtentForFace(halfExtents: THREE.Vector3, face: BoundsFace): number {
    if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) return halfExtents.x;
    if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) return halfExtents.y;
    return halfExtents.z;
  }

  /** Clears and disposes internal meshes without dropping the class instance. */
  private disposeInternalResources(): void {
    if (this.guideLines) {
      this.rootGroup.remove(this.guideLines.getObject());
      this.guideLines.dispose();
      this.guideLines = null;
    }
    this.disposeObjectTree(this.rootGroup);
    this.wireframe = null;
    this.handleMeshes.clear();
    this.facePickMeshes.clear();
    this.edgeHighlightMeshes.clear();
    this.currentBounds = null;
    this.guideLinesWanted = false;
    this.resizeHandlesWanted = true;
    this.highlightedFace = null;
  }

  /**
   * Disposes geometries and materials under a root object.
   *
   * @param root The object tree to dispose.
   */
  private disposeObjectTree(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
        this.disposeMaterial(child.material);
      }
    });
    while (root.children.length > 0) {
      root.remove(root.children[0]!);
    }
  }

  /**
   * Disposes a material or material array.
   *
   * @param material The material(s) to dispose.
   */
  private disposeMaterial(material: THREE.Material | THREE.Material[]): void {
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
      return;
    }
    material.dispose();
  }
}
