import * as THREE from 'three';
import { Theme } from '../../theme.js';
import { GizmoAxis } from '../../types/transform_mode.js';
import { BoundsFace, BOUNDS_FACE_USERDATA_KEY } from '../../types/bounds_face.js';
import { GizmoHandle } from '../gizmo/gizmo_handle.js';
import { getAllBoundsFaces, getBoundsFaceLocalNormal, OrientedBoundsData } from './oriented_bounds.js';
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
  createCadResizeFlapGeometry,
  getViewPlaneDepthDirection,
  quaternionForViewPlaneEar,
} from './bounds_cad_flap.js';
import { getHiddenBoundsAxesForViewPlane, type CadViewPlane } from '../../rulers/cad_view_plane.js';
import {
  BOUNDS_EAR_ALONG_PIXELS,
  BOUNDS_EAR_MIN_ALONG_PIXELS,
  computeBoundsCubeVisualWorldSize,
  computeBoundsCubeWorldSize,
  computeBoundsEarScreenLayout,
} from './bounds_handle_screen_size.js';
import {
  applyGizmoFrontRenderOrder,
  createGizmoFrontMaterial,
  createGizmoOccludedMesh,
  GizmoVisualStyle,
} from '../gizmo/gizmo_visual_style.js';

/** UserData key storing the axis letter of a bounds resize grip. */
export const BOUNDS_FACE_AXIS_USERDATA_KEY = 'boundsFaceAxis';

/** UserData flag for the invisible fat pick volume (3D). */
export const BOUNDS_CUBE_PICK_KEY = 'boundsCubePick';

/** UserData flag for visible 3D arrow parts (front meshes). */
export const BOUNDS_CUBE_VISUAL_KEY = 'boundsCubeVisual';

/** UserData flag for the scaled visual group holding the 3D arrow. */
export const BOUNDS_ARROW_VISUAL_GROUP_KEY = 'boundsArrowVisualGroup';

/** UserData key for the idle (non-hover) tint color of a 2D ear. */
export const BOUNDS_EAR_BASE_COLOR_KEY = 'boundsEarBaseColor';

/**
 * CAD-style bounds gizmo: cyan wire OBB, axis-tinted resize arrows in 3D,
 * screen-space ears in 2D, full-face pick planes for move, and edge outlines
 * for resize (orange) or 3D body-move (white) hover.
 */
export class BoundsGizmo {
  private theme: typeof Theme;
  private handles: GizmoHandle[];
  private rootGroup: THREE.Group;
  private wireframe: THREE.LineSegments | null;
  private handleMeshes: Map<BoundsFace, THREE.Mesh>;
  private facePickMeshes: Map<BoundsFace, THREE.Mesh>;
  private edgeHighlightMeshes: Map<BoundsFace, THREE.LineSegments>;
  private guideLines: BoundsGuideLines | null;
  private currentBounds: OrientedBoundsData | null;
  private cubePickWorldSize: number;
  private cubeVisualWorldSize: number;
  private earWorldSize: number;
  private guideLinesWanted: boolean;
  private highlightedFace: BoundsFace | null;
  private highlightMode: BoundsFaceHighlightMode;

  /**
   * Creates a bounds gizmo builder.
   *
   * @param theme Theme colors for wireframe and handles.
   */
  constructor(theme: typeof Theme) {
    this.theme = theme;
    this.handles = [];
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'bounds_gizmo';
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
    this.highlightedFace = null;
    this.highlightMode = 'resize';
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
    this.rootGroup.name = 'bounds_gizmo';
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
    bounds: OrientedBoundsData | null,
    cubePickWorldSize: number = 0.18,
    earWorldSize: number = 0.18,
    cubeVisualWorldSize: number = cubePickWorldSize * 0.7,
  ): void {
    this.currentBounds = bounds;
    this.cubePickWorldSize = Math.max(0.05, cubePickWorldSize);
    this.cubeVisualWorldSize = Math.max(0.03, cubeVisualWorldSize);
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
    this.applyEarHighlightColors(root);
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
   * Returns the last bounds applied to this gizmo.
   *
   * @returns Oriented bounds data, or null.
   */
  getCurrentBounds(): OrientedBoundsData | null {
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
    const material = new THREE.MeshBasicMaterial({
      color: this.theme.boundsWireColor,
      transparent: true,
      opacity: 0.001,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
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
    const pickMaterial = new THREE.MeshBasicMaterial({
      color: this.theme.boundsHandleColor,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.001,
      toneMapped: false,
    });
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
    const hiddenAxes = getHiddenBoundsAxesForViewPlane(viewPlane);
    root.traverse((child) => {
      this.styleCloneChildForViewPlane(child, viewPlane, hiddenAxes);
    });
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
    if (viewPlane === 'xyz') {
      this.applyPerspectiveArrowScreenStyle(root, camera);
      return;
    }
    this.applyOrthographicEarScreenStyle(root, viewPlane, camera, viewportHeightPx);
  }

  /**
   * Updates 3D arrow pick and visual scales from the perspective camera
   * distance. Only pick-root meshes are laid out; stem and cone share handleId
   * for picking but are scaled via the visual group.
   *
   * @param root Perspective gizmo clone.
   * @param camera Perspective camera.
   */
  private applyPerspectiveArrowScreenStyle(root: THREE.Object3D, camera: THREE.Camera): void {
    const bounds = this.currentBounds;
    if (!bounds) return;
    const pickSize = computeBoundsCubeWorldSize(bounds, camera);
    const visualSize = computeBoundsCubeVisualWorldSize(bounds, camera);
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData[BOUNDS_CUBE_PICK_KEY] !== true) return;
      if (child.userData[BOUNDS_HANDLE_IS_EAR_KEY] === true) return;
      this.scaleArrowPickAndVisual(child, pickSize, visualSize);
    });
  }

  /**
   * Updates 2D ear meshes to a constant screen-space size for the ortho zoom,
   * clamped to half the bounds side length. Hides ears shorter than the minimum
   * readable pixel length.
   *
   * @param root Orthographic gizmo clone.
   * @param viewPlane Orthographic plane.
   * @param camera Orthographic camera.
   * @param viewportHeightPx Drawable height in CSS pixels.
   */
  private applyOrthographicEarScreenStyle(
    root: THREE.Object3D,
    viewPlane: CadViewPlane,
    camera: THREE.Camera,
    viewportHeightPx: number,
  ): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (typeof child.userData['handleId'] !== 'number') return;
      if (child.userData[BOUNDS_HANDLE_IS_EAR_KEY] !== true) return;
      const face = child.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
      if (!face) return;
      const orientation = quaternionForViewPlaneEar(face, viewPlane);
      if (!orientation) return;
      const sideLength = this.earSideLengthWorld(face, viewPlane);
      const layout = computeBoundsEarScreenLayout(camera, viewportHeightPx, sideLength);
      this.placeEarOnFace(child, face, orientation, layout);
      child.visible = this.isEarAlongEdgeLongEnough(layout.alongEdge, camera, viewportHeightPx);
    });
    this.applyEarHighlightColors(root);
  }

  /**
   * Returns whether an ear's along-edge world length is at least the minimum
   * readable length in CSS pixels for the current ortho zoom.
   *
   * @param alongEdgeWorld Along-edge length in world units.
   * @param camera Orthographic camera.
   * @param viewportHeightPx Drawable height in CSS pixels.
   * @returns True when the ear should be drawn.
   */
  private isEarAlongEdgeLongEnough(alongEdgeWorld: number, camera: THREE.Camera, viewportHeightPx: number): boolean {
    const unitsPerPixel =
      camera instanceof THREE.OrthographicCamera
        ? Math.abs(camera.top - camera.bottom) / Math.max(1, viewportHeightPx)
        : alongEdgeWorld / Math.max(1, BOUNDS_EAR_ALONG_PIXELS);
    if (unitsPerPixel <= 1e-12) return false;
    const alongPixels = alongEdgeWorld / unitsPerPixel;
    return alongPixels >= BOUNDS_EAR_MIN_ALONG_PIXELS - 1e-6;
  }

  /**
   * Full world length of the bounds side the ear runs along in this view.
   *
   * @param face Bounds face for the ear.
   * @param viewPlane Orthographic view plane.
   * @returns Edge length in world units, or undefined when unavailable.
   */
  private earSideLengthWorld(face: BoundsFace, viewPlane: CadViewPlane): number | undefined {
    if (!this.currentBounds) return undefined;
    const depth = getViewPlaneDepthDirection(viewPlane);
    if (!depth) return undefined;
    const outward = getBoundsFaceLocalNormal(face);
    const along = new THREE.Vector3().crossVectors(depth, outward);
    if (along.lengthSq() < 1e-10) return undefined;
    along.normalize();
    const half = this.currentBounds.halfExtents;
    const halfAlong = Math.abs(along.x) * half.x + Math.abs(along.y) * half.y + Math.abs(along.z) * half.z;
    return halfAlong * 2;
  }

  /**
   * Applies 2D ear styling or depth hiding to one object under a viewport
   * clone.
   *
   * @param child Scene object in the clone tree.
   * @param viewPlane Orthographic view plane.
   * @param hiddenAxes Depth axes to hide for resize grips only.
   */
  private styleCloneChildForViewPlane(
    child: THREE.Object3D,
    viewPlane: CadViewPlane,
    hiddenAxes: ReadonlyArray<'x' | 'y' | 'z'>,
  ): void {
    if (child.userData['isBoundsFacePick'] === true) return;
    const axis = this.resolveObjectAxis(child);
    if (!axis) return;
    const isHandle = typeof child.userData['handleId'] === 'number';
    const isEdgeHighlight = child.userData[BOUNDS_FACE_EDGE_HIGHLIGHT_KEY] === true;
    if (!isHandle && !isEdgeHighlight) return;
    if (hiddenAxes.includes(axis)) {
      child.visible = false;
      return;
    }
    if (!isHandle || !(child instanceof THREE.Mesh)) return;
    const face = child.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
    if (!face) return;
    this.styleHandleMeshAsEar(child, face, viewPlane);
  }

  /**
   * Converts a cloned 3D arrow handle into a view-plane CAD line-handle ear.
   *
   * @param mesh Cloned handle mesh.
   * @param face Bounds face for this ear.
   * @param viewPlane Orthographic view plane.
   */
  private styleHandleMeshAsEar(mesh: THREE.Mesh, face: BoundsFace, viewPlane: CadViewPlane): void {
    const orientation = quaternionForViewPlaneEar(face, viewPlane);
    if (!orientation) {
      mesh.visible = false;
      return;
    }
    this.ensureEarGeometry(mesh);
    const fallbackLayout = {
      alongEdge: this.earWorldSize * 2.4,
      thickness: this.earWorldSize * 0.55,
      offset: this.earWorldSize * 0.28,
    };
    this.placeEarOnFace(mesh, face, orientation, fallbackLayout);
    mesh.visible = true;
  }

  /**
   * Swaps arrow geometry for a stadium ear, removes arrow children, and applies
   * ear material.
   *
   * @param mesh Handle mesh being converted to an ear.
   */
  private ensureEarGeometry(mesh: THREE.Mesh): void {
    if (mesh.userData[BOUNDS_HANDLE_IS_EAR_KEY] === true) return;
    while (mesh.children.length > 0) {
      mesh.remove(mesh.children[0]!);
    }
    mesh.geometry = createCadResizeFlapGeometry();
    mesh.userData[BOUNDS_HANDLE_IS_EAR_KEY] = true;
    mesh.userData[BOUNDS_CUBE_PICK_KEY] = false;
    this.applyEarMaterial(mesh);
  }

  /**
   * Replaces the handle material with a double-sided ear material using the
   * same subtle axis tint as 3D arrows.
   *
   * @param mesh Ear mesh whose material should be ear-specific.
   */
  private applyEarMaterial(mesh: THREE.Mesh): void {
    const face = mesh.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
    const tint = face ? this.subtleAxisTintColor(face) : this.theme.boundsHandleColor;
    mesh.userData[BOUNDS_EAR_BASE_COLOR_KEY] = tint;
    const material = new THREE.MeshBasicMaterial({
      color: tint,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    mesh.material = material;
  }

  /**
   * Tints 2D ears orange when their face is under resize hover (edge or ear).
   *
   * @param root Gizmo root (master or clone).
   */
  private applyEarHighlightColors(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData[BOUNDS_HANDLE_IS_EAR_KEY] !== true) return;
      const material = child.material;
      if (!(material instanceof THREE.MeshBasicMaterial)) return;
      const face = child.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
      const base = (child.userData[BOUNDS_EAR_BASE_COLOR_KEY] as number | undefined) ?? this.theme.boundsHandleColor;
      const isResizeHover =
        this.highlightMode === 'resize' && this.highlightedFace !== null && face === this.highlightedFace;
      material.color.setHex(isResizeHover ? this.theme.boundsHandleHoverColor : base);
      material.opacity = isResizeHover ? 0.95 : 0.9;
      material.needsUpdate = true;
    });
  }

  /**
   * Positions and scales a stadium ear slightly outside its bounds face.
   *
   * @param mesh Ear mesh.
   * @param face Bounds face.
   * @param orientation View-plane ear quaternion.
   * @param layout Along-edge, thickness, and offset in world units.
   */
  private placeEarOnFace(
    mesh: THREE.Mesh,
    face: BoundsFace,
    orientation: THREE.Quaternion,
    layout: { alongEdge: number; thickness: number; offset: number },
  ): void {
    const faceHalf = (mesh.userData[BOUNDS_HANDLE_FACE_HALF_KEY] as number | undefined) ?? 0.5;
    mesh.quaternion.copy(orientation);
    const localNormal = getBoundsFaceLocalNormal(face);
    mesh.position.copy(localNormal.multiplyScalar(faceHalf + layout.offset));
    const earShapeUnitHeight = 0.17;
    mesh.scale.set(layout.alongEdge, layout.thickness / earShapeUnitHeight, 1);
  }

  /**
   * Scales a 3D arrow pick root and its visual group. The visual group scales
   * as a unit so stem and cone stay attached at every camera distance.
   *
   * @param pickMesh Handle root mesh (pick volume).
   * @param pickSize World edge length for picking.
   * @param visualSize World length for the arrow graphic.
   */
  private scaleArrowPickAndVisual(pickMesh: THREE.Mesh, pickSize: number, visualSize: number): void {
    const face = pickMesh.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
    const faceHalf = (pickMesh.userData[BOUNDS_HANDLE_FACE_HALF_KEY] as number | undefined) ?? 0.5;
    pickMesh.scale.set(pickSize, pickSize, pickSize);
    if (face) {
      this.orientHandleAlongFaceNormal(pickMesh, face);
      const localNormal = getBoundsFaceLocalNormal(face);
      const pickOffsetAlongNormal = pickSize * 0.35;
      pickMesh.position.copy(localNormal.multiplyScalar(faceHalf + pickOffsetAlongNormal));
    }
    const visualRatio = pickSize > 1e-8 ? visualSize / pickSize : 0.7;
    pickMesh.children.forEach((child) => {
      if (child.userData[BOUNDS_ARROW_VISUAL_GROUP_KEY] === true) {
        child.scale.set(visualRatio, visualRatio, visualRatio);
      }
    });
  }

  /**
   * Orients a handle so local +Y aligns with the face outward normal.
   *
   * @param mesh Handle root.
   * @param face Bounds face.
   */
  private orientHandleAlongFaceNormal(mesh: THREE.Object3D, face: BoundsFace): void {
    const outward = getBoundsFaceLocalNormal(face);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
    mesh.quaternion.copy(quaternion);
  }

  /**
   * Resolves the axis letter stored on a bounds grip or highlight object.
   *
   * @param object Scene object under a gizmo root.
   * @returns Axis letter, or undefined when not a bounds grip.
   */
  private resolveObjectAxis(object: THREE.Object3D): 'x' | 'y' | 'z' | undefined {
    const axis = object.userData[BOUNDS_FACE_AXIS_USERDATA_KEY] as 'x' | 'y' | 'z' | undefined;
    if (axis) return axis;
    const face = object.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
    return face ? this.axisLetterForFace(face) : undefined;
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
      this.scaleArrowPickAndVisual(mesh, pickSize, visualSize);
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

  /** Shows handles and face picks; edge highlights stay hover-driven. */
  private showInteractiveParts(): void {
    this.handleMeshes.forEach((mesh) => {
      mesh.visible = true;
    });
    this.facePickMeshes.forEach((mesh) => {
      mesh.visible = true;
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
