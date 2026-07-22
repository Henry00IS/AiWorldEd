import * as THREE from 'three';
import { Theme } from '../theme.js';
import { FaceSelection } from './face_selection_manager.js';
import {
  getTriangleVertexIndices,
  getVertexPosition
} from './triangle_geometry_utils.js';
import { GizmoVisualStyle } from '../transform/gizmo_visual_style.js';

/**
 * Opacity for face highlights that pass the depth test (in front).
 */
const FACE_HIGHLIGHT_FRONT_OPACITY = 0.45;

/**
 * Opacity for face highlights occluded by other scene geometry.
 */
const FACE_HIGHLIGHT_OCCLUDED_OPACITY = 0.18;

/**
 * Renders orange face-selection overlays with gizmo-style depth treatment.
 * Unoccluded faces stay bright; faces behind other geometry draw as ghosts.
 * Polygon offset avoids z-fighting with the owning mesh surface.
 */
export class FaceSelectionHighlight {
  private scene: THREE.Scene;
  private highlightGroup: THREE.Group;
  private frontMaterial: THREE.MeshBasicMaterial;
  private occludedMaterial: THREE.MeshBasicMaterial;
  private faceGroups: Map<string, THREE.Group>;

  /**
   * Creates a new face highlight renderer and adds it to the scene.
   * @param scene The scene to add the highlight group to.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.highlightGroup = new THREE.Group();
    this.frontMaterial = this.createFrontMaterial();
    this.occludedMaterial = this.createOccludedMaterial();
    this.faceGroups = new Map();
    this.scene.add(this.highlightGroup);
  }

  /**
   * Creates the bright front-pass material used where the face is unoccluded.
   * @returns Configured MeshBasicMaterial.
   */
  private createFrontMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: Theme.selectionColor,
      transparent: true,
      opacity: FACE_HIGHLIGHT_FRONT_OPACITY,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  }

  /**
   * Creates the ghost material used where the face is behind other geometry.
   * @returns Configured MeshBasicMaterial.
   */
  private createOccludedMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: Theme.selectionColor,
      transparent: true,
      opacity: FACE_HIGHLIGHT_OCCLUDED_OPACITY,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  }

  /**
   * Generates a unique key for a face selection entry.
   * @param mesh The mesh reference.
   * @param faceIndex The triangle index.
   * @returns A unique string key for this face.
   */
  private getFaceKey(mesh: THREE.Mesh, faceIndex: number): string {
    return `${mesh.uuid}_${faceIndex}`;
  }

  /**
   * Updates the highlight to show the given set of selected faces.
   * @param faces The array of face selections to highlight.
   */
  setSelectedFaces(faces: FaceSelection[]): void {
    const newKeys = new Set<string>();
    faces.forEach((entry) => {
      newKeys.add(this.getFaceKey(entry.mesh, entry.faceIndex));
    });
    this.removeStaleHighlights(newKeys);
    this.addNewHighlights(faces);
  }

  /**
   * Removes highlights for faces no longer in the selection set.
   * @param keepKeys The set of keys to preserve.
   */
  private removeStaleHighlights(keepKeys: Set<string>): void {
    this.faceGroups.forEach((group, key) => {
      if (keepKeys.has(key)) return;
      this.disposeFaceGroup(group);
      this.faceGroups.delete(key);
    });
  }

  /**
   * Adds new highlight groups for faces not yet highlighted.
   * @param faces The face selections to add highlights for.
   */
  private addNewHighlights(faces: FaceSelection[]): void {
    faces.forEach((entry) => {
      const key = this.getFaceKey(entry.mesh, entry.faceIndex);
      if (this.faceGroups.has(key)) return;
      const faceGroup = this.buildFaceHighlightGroup(entry);
      if (!faceGroup) return;
      this.highlightGroup.add(faceGroup);
      this.faceGroups.set(key, faceGroup);
    });
  }

  /**
   * Builds a dual-pass highlight group for one selected face.
   * @param entry The face selection to build the group for.
   * @returns A group with front and occluded meshes, or null on failure.
   */
  private buildFaceHighlightGroup(entry: FaceSelection): THREE.Group | null {
    const faceGeometry = this.buildWorldSpaceFaceGeometry(entry);
    if (!faceGeometry) return null;
    const group = new THREE.Group();
    group.userData.isFaceSelectionHighlight = true;
    group.add(this.createOccludedFaceMesh(faceGeometry));
    group.add(this.createFrontFaceMesh(faceGeometry));
    return group;
  }

  /**
   * Builds triangle geometry for a face in world space.
   * @param entry The face selection to convert.
   * @returns World-space triangle geometry, or null on failure.
   */
  private buildWorldSpaceFaceGeometry(
    entry: FaceSelection
  ): THREE.BufferGeometry | null {
    const geometry = entry.mesh.geometry;
    const positions = geometry.getAttribute('position');
    if (!positions) return null;
    const [i0, i1, i2] = getTriangleVertexIndices(geometry, entry.faceIndex);
    const v0 = getVertexPosition(positions, i0);
    const v1 = getVertexPosition(positions, i1);
    const v2 = getVertexPosition(positions, i2);
    entry.mesh.updateMatrixWorld(true);
    v0.applyMatrix4(entry.mesh.matrixWorld);
    v1.applyMatrix4(entry.mesh.matrixWorld);
    v2.applyMatrix4(entry.mesh.matrixWorld);
    return this.buildTriangleGeometry(v0, v1, v2);
  }

  /**
   * Creates the bright front-pass mesh for a face highlight.
   * @param geometry Shared triangle geometry.
   * @returns Front highlight mesh.
   */
  private createFrontFaceMesh(geometry: THREE.BufferGeometry): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.frontMaterial);
    mesh.renderOrder = GizmoVisualStyle.frontRenderOrder;
    mesh.userData.isFaceSelectionHighlight = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  /**
   * Creates the ghost mesh drawn only where the face is occluded.
   * @param geometry Shared triangle geometry.
   * @returns Occluded highlight mesh.
   */
  private createOccludedFaceMesh(geometry: THREE.BufferGeometry): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.occludedMaterial);
    mesh.renderOrder = GizmoVisualStyle.occludedRenderOrder;
    mesh.userData.isFaceSelectionHighlight = true;
    mesh.userData.isFaceSelectionHighlightOccluded = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  /**
   * Creates a buffer geometry for a single triangle.
   * @param v0 First vertex of the triangle.
   * @param v1 Second vertex of the triangle.
   * @param v2 Third vertex of the triangle.
   * @returns A BufferGeometry with three vertices.
   */
  private buildTriangleGeometry(
    v0: THREE.Vector3,
    v1: THREE.Vector3,
    v2: THREE.Vector3
  ): THREE.BufferGeometry {
    const vertices = new Float32Array([
      v0.x, v0.y, v0.z,
      v1.x, v1.y, v1.z,
      v2.x, v2.y, v2.z
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    return geometry;
  }

  /**
   * Removes a face group from the scene and disposes its geometry.
   * @param group The dual-pass face highlight group.
   */
  private disposeFaceGroup(group: THREE.Group): void {
    this.highlightGroup.remove(group);
    const geometry = this.findSharedGeometry(group);
    if (geometry) geometry.dispose();
  }

  /**
   * Finds the shared triangle geometry used by a face highlight group.
   * @param group Face highlight group containing front and occluded meshes.
   * @returns Shared geometry, or null when missing.
   */
  private findSharedGeometry(group: THREE.Group): THREE.BufferGeometry | null {
    for (const child of group.children) {
      if (child instanceof THREE.Mesh && child.geometry) {
        return child.geometry;
      }
    }
    return null;
  }

  /**
   * Removes all face highlights from the scene.
   */
  private clearHighlights(): void {
    this.faceGroups.forEach((group) => {
      this.disposeFaceGroup(group);
    });
    this.faceGroups.clear();
  }

  /**
   * Disposes all highlight resources and removes the group from the scene.
   */
  dispose(): void {
    this.clearHighlights();
    this.scene.remove(this.highlightGroup);
    this.frontMaterial.dispose();
    this.occludedMaterial.dispose();
  }

  /**
   * Returns the count of currently highlighted faces.
   * @returns The number of active face highlight groups.
   */
  getHighlightCount(): number {
    return this.faceGroups.size;
  }
}
