import * as THREE from 'three';
import type { Theme } from '@/theme.js';
import { BoundsFace, BOUNDS_FACE_USERDATA_KEY } from '@/types/bounds_face.js';
import { getBoundsFaceLocalNormal, type DataOrientedBounds } from './builder_oriented_bounds.js';
import { BOUNDS_FACE_EDGE_HIGHLIGHT_KEY } from './bounds_face_highlight.js';
import {
  BOUNDS_HANDLE_FACE_HALF_KEY,
  BOUNDS_HANDLE_IS_EAR_KEY,
  createCadResizeFlapGeometry,
  getViewPlaneDepthDirection,
  quaternionForViewPlaneEar,
} from './bounds_cad_flap.js';
import type { CadViewPlane } from '@/rulers/view/cad_view_plane.js';
import {
  BOUNDS_EAR_ALONG_PIXELS,
  BOUNDS_EAR_MIN_ALONG_PIXELS,
  computeBoundsCubeVisualWorldSize,
  computeBoundsCubeWorldSize,
  computeBoundsEarScreenLayout,
} from './bounds_handle_screen_size.js';
import {
  BOUNDS_ARROW_VISUAL_GROUP_KEY,
  BOUNDS_CUBE_PICK_KEY,
  BOUNDS_EAR_BASE_COLOR_KEY,
  BOUNDS_FACE_AXIS_USERDATA_KEY,
} from './gizmo_bounds_keys.js';

/** Host state needed for bounds gizmo screen-space styling. */
export interface GizmoBoundsScreenStyleHost {
  /**
   * Returns the current oriented bounds, if any.
   *
   * @returns Bounds data or null.
   */
  getCurrentBounds(): DataOrientedBounds | null;

  /**
   * Returns whether resize grips should be shown.
   *
   * @returns True when resize handles are wanted.
   */
  areResizeHandlesWanted(): boolean;

  /**
   * Returns the currently highlighted face.
   *
   * @returns Highlighted face or null.
   */
  getHighlightedFace(): BoundsFace | null;

  /**
   * Returns the current highlight mode string.
   *
   * @returns Highlight mode.
   */
  getHighlightMode(): string;

  /**
   * Returns the theme colors.
   *
   * @returns Theme object.
   */
  getTheme(): typeof Theme;

  /**
   * Returns a subtle axis tint for a bounds face.
   *
   * @param face Bounds face.
   * @returns Hex color.
   */
  subtleAxisTintColor(face: BoundsFace): number;

  /**
   * Returns the fallback ear world size when screen layout is not yet known.
   *
   * @returns Ear size in world units.
   */
  getEarWorldSize(): number;
}

/** Applies 2D ear and 3D arrow screen-space styling for bounds gizmo clones. */
export class GizmoBoundsScreenStyle {
  private readonly host: GizmoBoundsScreenStyleHost;

  /**
   * Creates a screen-style helper for a bounds gizmo.
   *
   * @param host Gizmo host providing bounds and theme state.
   */
  constructor(host: GizmoBoundsScreenStyleHost) {
    this.host = host;
  }

  /**
   * Styles a viewport gizmo clone for its view plane.
   *
   * @param root Viewport gizmo clone root.
   * @param viewPlane Plane for this viewport (`xyz` = perspective).
   * @param hiddenAxes Depth axes to hide for resize grips only.
   */
  styleCloneForViewPlane(
    root: THREE.Object3D,
    viewPlane: CadViewPlane,
    hiddenAxes: ReadonlyArray<'x' | 'y' | 'z'>,
  ): void {
    if (viewPlane === 'xyz') {
      return;
    }
    root.traverse((child) => {
      this.styleCloneChildForViewPlane(child, viewPlane, hiddenAxes);
    });
  }

  /**
   * Applies per-frame screen-space sizing for a viewport bounds clone.
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
   * distance.
   *
   * @param root Perspective gizmo clone.
   * @param camera Perspective camera.
   */
  private applyPerspectiveArrowScreenStyle(root: THREE.Object3D, camera: THREE.Camera): void {
    const bounds = this.host.getCurrentBounds();
    if (!bounds) {
      return;
    }
    const pickSize = computeBoundsCubeWorldSize(bounds, camera);
    const visualSize = computeBoundsCubeVisualWorldSize(bounds, camera);
    const resizeWanted = this.host.areResizeHandlesWanted();
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      if (child.userData[BOUNDS_CUBE_PICK_KEY] !== true) {
        return;
      }
      if (child.userData[BOUNDS_HANDLE_IS_EAR_KEY] === true) {
        return;
      }
      child.visible = resizeWanted;
      if (!resizeWanted) {
        return;
      }
      this.scaleArrowPickAndVisual(child, pickSize, visualSize);
    });
  }

  /**
   * Updates 2D ear meshes to a constant screen-space size for the ortho zoom.
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
    const resizeWanted = this.host.areResizeHandlesWanted();
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      if (typeof child.userData['handleId'] !== 'number') {
        return;
      }
      if (child.userData[BOUNDS_HANDLE_IS_EAR_KEY] !== true) {
        return;
      }
      const face = child.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
      if (!face) {
        return;
      }
      const orientation = quaternionForViewPlaneEar(face, viewPlane);
      if (!orientation) {
        return;
      }
      const sideLength = this.earSideLengthWorld(face, viewPlane);
      const layout = computeBoundsEarScreenLayout(camera, viewportHeightPx, sideLength);
      this.placeEarOnFace(child, face, orientation, layout);
      child.visible = resizeWanted && this.isEarAlongEdgeLongEnough(layout.alongEdge, camera, viewportHeightPx);
    });
    this.applyEarHighlightColors(root);
  }

  /**
   * Returns whether an ear's along-edge world length is readable in CSS pixels.
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
    if (unitsPerPixel <= 1e-12) {
      return false;
    }
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
    const bounds = this.host.getCurrentBounds();
    if (!bounds) {
      return undefined;
    }
    const depth = getViewPlaneDepthDirection(viewPlane);
    if (!depth) {
      return undefined;
    }
    const outward = getBoundsFaceLocalNormal(face);
    const along = new THREE.Vector3().crossVectors(depth, outward);
    if (along.lengthSq() < 1e-10) {
      return undefined;
    }
    along.normalize();
    const half = bounds.halfExtents;
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
    if (child.userData['isBoundsFacePick'] === true) {
      return;
    }
    const axis = this.resolveObjectAxis(child);
    if (!axis) {
      return;
    }
    const isHandle = typeof child.userData['handleId'] === 'number';
    const isEdgeHighlight = child.userData[BOUNDS_FACE_EDGE_HIGHLIGHT_KEY] === true;
    if (!isHandle && !isEdgeHighlight) {
      return;
    }
    if (isHandle && !this.host.areResizeHandlesWanted()) {
      child.visible = false;
      return;
    }
    if (hiddenAxes.includes(axis)) {
      child.visible = false;
      return;
    }
    if (!isHandle || !(child instanceof THREE.Mesh)) {
      return;
    }
    const face = child.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
    if (!face) {
      return;
    }
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
    const earWorldSize = this.host.getEarWorldSize();
    const fallbackLayout = {
      alongEdge: earWorldSize * 2.4,
      thickness: earWorldSize * 0.55,
      offset: earWorldSize * 0.28,
    };
    this.placeEarOnFace(mesh, face, orientation, fallbackLayout);
    mesh.visible = this.host.areResizeHandlesWanted();
  }

  /**
   * Swaps arrow geometry for a stadium ear, removes arrow children, and applies
   * ear material.
   *
   * @param mesh Handle mesh being converted to an ear.
   */
  private ensureEarGeometry(mesh: THREE.Mesh): void {
    if (mesh.userData[BOUNDS_HANDLE_IS_EAR_KEY] === true) {
      return;
    }
    while (mesh.children.length > 0) {
      mesh.remove(mesh.children[0]!);
    }
    mesh.geometry = createCadResizeFlapGeometry();
    mesh.userData[BOUNDS_HANDLE_IS_EAR_KEY] = true;
    mesh.userData[BOUNDS_CUBE_PICK_KEY] = false;
    this.applyEarMaterial(mesh);
  }

  /**
   * Replaces the handle material with a double-sided ear material.
   *
   * @param mesh Ear mesh whose material should be ear-specific.
   */
  private applyEarMaterial(mesh: THREE.Mesh): void {
    const face = mesh.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
    const theme = this.host.getTheme();
    const tint = face ? this.host.subtleAxisTintColor(face) : theme.boundsHandleColor;
    mesh.userData[BOUNDS_EAR_BASE_COLOR_KEY] = tint;
    mesh.material = new THREE.MeshBasicMaterial({
      color: tint,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  }

  /**
   * Tints 2D ears with the theme hover color when their face is under resize
   * hover.
   *
   * @param root Gizmo root whose ear meshes are recolored.
   */
  applyEarHighlightColors(root: THREE.Object3D): void {
    const theme = this.host.getTheme();
    const highlightMode = this.host.getHighlightMode();
    const highlightedFace = this.host.getHighlightedFace();
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      if (child.userData[BOUNDS_HANDLE_IS_EAR_KEY] !== true) {
        return;
      }
      const material = child.material;
      if (!(material instanceof THREE.MeshBasicMaterial)) {
        return;
      }
      const face = child.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
      const base = (child.userData[BOUNDS_EAR_BASE_COLOR_KEY] as number | undefined) ?? theme.boundsHandleColor;
      const isResizeHover = highlightMode === 'resize' && highlightedFace !== null && face === highlightedFace;
      material.color.setHex(isResizeHover ? theme.boundsHandleHoverColor : base);
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
   * Scales a 3D arrow pick root and its visual group.
   *
   * @param pickMesh Handle root mesh (pick volume).
   * @param pickSize World edge length for picking.
   * @param visualSize World length for the arrow graphic.
   */
  scaleArrowPickAndVisual(pickMesh: THREE.Mesh, pickSize: number, visualSize: number): void {
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
    if (axis) {
      return axis;
    }
    const face = object.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
    return face ? this.axisLetterForFace(face) : undefined;
  }

  /**
   * Maps a face to an axis letter.
   *
   * @param face The bounds face.
   * @returns Axis letter.
   */
  private axisLetterForFace(face: BoundsFace): 'x' | 'y' | 'z' {
    if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
      return 'x';
    }
    if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
      return 'y';
    }
    return 'z';
  }
}
