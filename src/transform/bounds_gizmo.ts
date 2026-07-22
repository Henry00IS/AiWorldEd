import * as THREE from 'three';
import { Theme } from '../theme.js';
import { GizmoAxis } from '../types/transform_mode.js';
import { BoundsFace, BOUNDS_FACE_USERDATA_KEY } from '../types/bounds_face.js';
import { GizmoHandle } from './gizmo_handle.js';
import {
  getAllBoundsFaces,
  getBoundsFaceLocalNormal,
  OrientedBoundsData
} from './oriented_bounds.js';
import { BoundsGuideLines } from './bounds_guide_lines.js';

/**
 * Builds the unified Bounds tool visualization: an oriented wire box,
 * six face resize handles, and invisible face pick planes for sliding.
 * Both resize and face-move are available at once (handles win over faces).
 * RGB corner guide lines appear while dragging a brush bounds.
 */
export class BoundsGizmo {
  private theme: typeof Theme;
  private handles: GizmoHandle[];
  private rootGroup: THREE.Group;
  private wireframe: THREE.LineSegments | null;
  private handleMeshes: Map<BoundsFace, THREE.Mesh>;
  private facePickMeshes: Map<BoundsFace, THREE.Mesh>;
  private guideLines: BoundsGuideLines | null;
  private currentBounds: OrientedBoundsData | null;
  private handleScreenSize: number;
  private guideLinesWanted: boolean;

  /**
   * Creates a bounds gizmo builder.
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
    this.guideLines = null;
    this.currentBounds = null;
    this.handleScreenSize = 0.18;
    this.guideLinesWanted = false;
  }

  /**
   * Builds wireframe, face pick planes, six resize handles, and guide lines.
   * @returns Gizmo handles for raycast id matching.
   */
  createHandles(): GizmoHandle[] {
    this.disposeInternalResources();
    this.handles = [];
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'bounds_gizmo';
    this.createWireframe();
    this.createFacePickMeshes();
    this.createResizeHandles();
    this.createGuideLines();
    this.showAllInteractiveParts();
    return this.handles;
  }

  /**
   * Returns scene objects to parent under the transform gizmo group.
   * @returns An array containing the bounds root group.
   */
  getAllSceneObjects(): THREE.Object3D[] {
    return [this.rootGroup];
  }

  /**
   * Returns the current handle list.
   * @returns Active gizmo handles.
   */
  getHandles(): GizmoHandle[] {
    return this.handles;
  }

  /**
   * Updates gizmo pose and size from oriented bounds data.
   * @param bounds The OBB to display, or null to hide contents.
   * @param handleWorldSize Optional world size for handle cubes.
   */
  updateFromBounds(
    bounds: OrientedBoundsData | null,
    handleWorldSize: number = 0.18
  ): void {
    this.currentBounds = bounds;
    this.handleScreenSize = Math.max(0.08, handleWorldSize);
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
    this.updateGuideLines(bounds.halfExtents);
    this.showAllInteractiveParts();
  }

  /**
   * Shows or hides RGB corner guide lines (used while dragging bounds).
   * @param visible Whether guide lines should be drawn.
   */
  setGuideLinesVisible(visible: boolean): void {
    this.guideLinesWanted = visible;
    if (!this.guideLines) return;
    this.guideLines.setVisible(visible && this.currentBounds !== null);
  }

  /**
   * Returns whether guide lines are requested to be shown.
   * @returns True when guide lines should be visible during bounds drag.
   */
  areGuideLinesVisible(): boolean {
    return this.guideLinesWanted && (this.guideLines?.isVisible() ?? false);
  }

  /**
   * Returns the last bounds applied to this gizmo.
   * @returns Oriented bounds data, or null.
   */
  getCurrentBounds(): OrientedBoundsData | null {
    return this.currentBounds;
  }

  /**
   * Disposes geometries and materials created by this gizmo.
   */
  dispose(): void {
    this.disposeInternalResources();
    this.handles = [];
  }

  /**
   * Creates RGB corner guide lines (hidden until a bounds drag begins).
   */
  private createGuideLines(): void {
    this.guideLines = new BoundsGuideLines(this.theme);
    this.guideLines.setVisible(false);
    this.rootGroup.add(this.guideLines.getObject());
  }

  /**
   * Rebuilds guide-line geometry for the current half extents.
   * @param halfExtents Local half extents of the OBB.
   */
  private updateGuideLines(halfExtents: THREE.Vector3): void {
    if (!this.guideLines) return;
    this.guideLines.updateFromHalfExtents(halfExtents);
    this.guideLines.setVisible(this.guideLinesWanted);
  }

  /**
   * Creates the unit wire box that will be scaled to half extents.
   */
  private createWireframe(): void {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const edges = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    const material = new THREE.LineBasicMaterial({
      color: this.theme.boundsWireColor,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
      toneMapped: false
    });
    this.wireframe = new THREE.LineSegments(edges, material);
    this.wireframe.renderOrder = 999;
    this.wireframe.name = 'bounds_wireframe';
    this.rootGroup.add(this.wireframe);
  }

  /**
   * Creates six thin pick planes used in Move mode.
   */
  private createFacePickMeshes(): void {
    getAllBoundsFaces().forEach((face) => {
      const mesh = this.createFacePickMesh(face);
      this.facePickMeshes.set(face, mesh);
      this.rootGroup.add(mesh);
    });
  }

  /**
   * Creates one pick plane for a bounds face.
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
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData[BOUNDS_FACE_USERDATA_KEY] = face;
    mesh.userData.isBoundsFacePick = true;
    mesh.name = `bounds_face_pick_${face}`;
    this.orientFaceMesh(mesh, face);
    return mesh;
  }

  /**
   * Creates six small box handles at face centers for Resize mode.
   */
  private createResizeHandles(): void {
    getAllBoundsFaces().forEach((face) => {
      const color = this.colorForFace(face);
      const mesh = this.createHandleMesh(face, color);
      const axis = this.axisForFace(face);
      const handle = new GizmoHandle(axis, color, mesh);
      mesh.userData.handleId = handle.getHandleId();
      mesh.userData[BOUNDS_FACE_USERDATA_KEY] = face;
      this.handleMeshes.set(face, mesh);
      this.rootGroup.add(mesh);
      this.handles.push(handle);
    });
  }

  /**
   * Builds a small cube handle mesh for a face.
   * @param face The bounds face.
   * @param color Handle color.
   * @returns The handle mesh.
   */
  private createHandleMesh(face: BoundsFace, color: number): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `bounds_handle_${face}`;
    mesh.renderOrder = 1000;
    return mesh;
  }

  /**
   * Scales the wireframe box to match half extents.
   * @param halfExtents Local half extents of the OBB.
   */
  private updateWireframeGeometry(halfExtents: THREE.Vector3): void {
    if (!this.wireframe) return;
    this.wireframe.scale.set(
      Math.max(halfExtents.x, 0.001),
      Math.max(halfExtents.y, 0.001),
      Math.max(halfExtents.z, 0.001)
    );
  }

  /**
   * Places and sizes resize handles at each face center.
   * @param halfExtents Local half extents of the OBB.
   */
  private updateHandlePositions(halfExtents: THREE.Vector3): void {
    const size = this.handleScreenSize;
    this.handleMeshes.forEach((mesh, face) => {
      const localNormal = getBoundsFaceLocalNormal(face);
      const half = this.halfExtentForFace(halfExtents, face);
      mesh.position.copy(localNormal.multiplyScalar(half));
      mesh.scale.set(size, size, size);
    });
  }

  /**
   * Sizes and places face pick planes on each OBB face.
   * @param halfExtents Local half extents of the OBB.
   */
  private updateFacePickGeometry(halfExtents: THREE.Vector3): void {
    this.facePickMeshes.forEach((mesh, face) => {
      this.orientFaceMesh(mesh, face);
      const localNormal = getBoundsFaceLocalNormal(face);
      const half = this.halfExtentForFace(halfExtents, face);
      mesh.position.copy(localNormal.multiplyScalar(half));
      this.scaleFacePickMesh(mesh, face, halfExtents);
    });
  }

  /**
   * Scales a face pick plane to cover the face rectangle.
   * @param mesh The pick mesh.
   * @param face The face being covered.
   * @param halfExtents OBB half extents.
   */
  private scaleFacePickMesh(
    mesh: THREE.Mesh,
    face: BoundsFace,
    halfExtents: THREE.Vector3
  ): void {
    if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
      mesh.scale.set(halfExtents.z, halfExtents.y, 1);
      return;
    }
    if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
      mesh.scale.set(halfExtents.x, halfExtents.z, 1);
      return;
    }
    mesh.scale.set(halfExtents.x, halfExtents.y, 1);
  }

  /**
   * Orients a plane mesh so its normal matches the bounds face.
   * @param mesh The plane mesh.
   * @param face The target face.
   */
  private orientFaceMesh(mesh: THREE.Mesh, face: BoundsFace): void {
    const normal = getBoundsFaceLocalNormal(face);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    mesh.quaternion.copy(quaternion);
  }

  /**
   * Keeps resize handles and face pick planes available together.
   */
  private showAllInteractiveParts(): void {
    this.handleMeshes.forEach((mesh) => {
      mesh.visible = true;
    });
    this.facePickMeshes.forEach((mesh) => {
      mesh.visible = true;
    });
  }

  /**
   * Maps a face to a theme color by axis.
   * @param face The bounds face.
   * @returns Hex color.
   */
  private colorForFace(face: BoundsFace): number {
    if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
      return this.theme.gizmoXAxisColor;
    }
    if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
      return this.theme.gizmoYAxisColor;
    }
    return this.theme.gizmoZAxisColor;
  }

  /**
   * Maps a face to a gizmo axis for handle storage.
   * @param face The bounds face.
   * @returns The related GizmoAxis.
   */
  private axisForFace(face: BoundsFace): GizmoAxis {
    if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) return GizmoAxis.X;
    if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) return GizmoAxis.Y;
    return GizmoAxis.Z;
  }

  /**
   * Reads half extent for a face axis.
   * @param halfExtents Full half extent vector.
   * @param face The face.
   * @returns Half size along the face axis.
   */
  private halfExtentForFace(halfExtents: THREE.Vector3, face: BoundsFace): number {
    if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) return halfExtents.x;
    if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) return halfExtents.y;
    return halfExtents.z;
  }

  /**
   * Clears and disposes internal meshes without dropping the class instance.
   */
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
    this.currentBounds = null;
    this.guideLinesWanted = false;
  }

  /**
   * Disposes geometries and materials under a root object.
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
      root.remove(root.children[0]);
    }
  }

  /**
   * Disposes a material or material array.
   * @param material The material(s) to dispose.
   */
  private disposeMaterial(
    material: THREE.Material | THREE.Material[]
  ): void {
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
      return;
    }
    material.dispose();
  }
}
