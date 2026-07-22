import * as THREE from 'three';
import { Theme } from '../theme.js';
import { ClipPlaneTool } from './clip_plane_tool.js';
import {
  CLIP_MARKER_DISTANCE_SCALE,
  CLIP_MARKER_HALO_RADIUS,
  CLIP_MARKER_INDEX_KEY,
  CLIP_MARKER_MAX_SCALE,
  CLIP_MARKER_MIN_SCALE
} from './clip_plane_marker_style.js';

/**
 * UserData key for clip preview objects so shading/picking can ignore them.
 */
export const CLIP_PREVIEW_USERDATA_KEY = 'isClipPlanePreview';

/**
 * Renders placement markers and a translucent cutting plane for the clip tool.
 */
export class ClipPlanePreview {
  private root: THREE.Group;
  private markerGroups: THREE.Group[];
  private planeMesh: THREE.Mesh | null;
  private arrowHelper: THREE.ArrowHelper | null;

  /**
   * Creates a preview group that should be added to the world or scene.
   */
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'clip_plane_preview';
    this.root.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
    this.markerGroups = [];
    this.planeMesh = null;
    this.arrowHelper = null;
  }

  /**
   * Returns the root group to attach to a scene.
   * @returns Preview root group.
   */
  getRoot(): THREE.Group {
    return this.root;
  }

  /**
   * Syncs preview visuals from the clip tool state.
   * @param tool Clip plane tool providing points and plane.
   */
  syncFromTool(tool: ClipPlaneTool): void {
    this.clearVisuals();
    if (!tool.isActive()) return;
    tool.getPoints().forEach((point, index) => {
      this.addMarker(point, index);
    });
    const plane = tool.getPlane();
    if (!plane) return;
    this.addPlaneMesh(plane, tool.getPoints());
    this.addKeepArrow(plane, tool.getPoints(), tool.getKeepFront());
  }

  /**
   * Scales markers for consistent on-screen size relative to a camera.
   * @param camera Active viewport camera.
   */
  updateMarkerScalesForCamera(camera: THREE.Camera): void {
    const scale = this.computeMarkerScale(camera);
    this.markerGroups.forEach((group) => {
      group.scale.setScalar(scale);
    });
  }

  /**
   * Removes all preview children and disposes resources.
   */
  dispose(): void {
    this.clearVisuals();
    this.root.parent?.remove(this.root);
  }

  /**
   * Clears markers, plane, and arrow.
   */
  private clearVisuals(): void {
    while (this.root.children.length > 0) {
      const child = this.root.children[0];
      this.root.remove(child);
      this.disposeObject(child);
    }
    this.markerGroups = [];
    this.planeMesh = null;
    this.arrowHelper = null;
  }

  /**
   * Adds a solid yellow marker at a placement point.
   * @param point World point.
   * @param index Placement point index for drag identification.
   */
  private addMarker(point: THREE.Vector3, index: number): void {
    const group = new THREE.Group();
    group.position.copy(point);
    group.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
    group.userData[CLIP_MARKER_INDEX_KEY] = index;
    group.add(this.createMarkerMesh());
    group.renderOrder = 999;
    this.root.add(group);
    this.markerGroups.push(group);
  }

  /**
   * Builds a solid yellow sphere for a clip placement point.
   * @returns Marker mesh.
   */
  private createMarkerMesh(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(CLIP_MARKER_HALO_RADIUS, 16, 14);
    const material = new THREE.MeshBasicMaterial({
      color: Theme.clipMarkerColor,
      depthTest: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
    mesh.renderOrder = 999;
    return mesh;
  }

  /**
   * Computes a screen-stable scale factor for markers.
   * @param camera Active camera.
   * @returns Clamped scale multiplier.
   */
  private computeMarkerScale(camera: THREE.Camera): number {
    if (this.markerGroups.length === 0) return 1;
    const anchor = this.markerGroups[0].position;
    let raw = 1;
    if (camera instanceof THREE.PerspectiveCamera) {
      const distance = camera.position.distanceTo(anchor);
      raw = distance * CLIP_MARKER_DISTANCE_SCALE;
    } else if (camera instanceof THREE.OrthographicCamera) {
      const halfHeight = Math.abs(camera.top - camera.bottom) * 0.5;
      raw = halfHeight * CLIP_MARKER_DISTANCE_SCALE * 2.5;
    }
    return Math.min(
      CLIP_MARKER_MAX_SCALE,
      Math.max(CLIP_MARKER_MIN_SCALE, raw)
    );
  }

  /**
   * Adds a translucent plane mesh centered on placement points.
   * @param plane Cutting plane.
   * @param points Placement points for sizing.
   */
  private addPlaneMesh(plane: THREE.Plane, points: THREE.Vector3[]): void {
    const size = this.estimatePlaneSize(points);
    const geometry = new THREE.PlaneGeometry(size, size);
    const material = new THREE.MeshBasicMaterial({
      color: Theme.boundsWireColor,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
    this.orientPlaneMesh(mesh, plane, points);
    this.root.add(mesh);
    this.planeMesh = mesh;
  }

  /**
   * Orients and positions the plane mesh to match the cutting plane.
   * @param mesh Plane mesh.
   * @param plane Cutting plane.
   * @param points Placement points for center.
   */
  private orientPlaneMesh(
    mesh: THREE.Mesh,
    plane: THREE.Plane,
    points: THREE.Vector3[]
  ): void {
    const center = this.computePointsCenter(points);
    const projected = new THREE.Vector3();
    plane.projectPoint(center, projected);
    mesh.position.copy(projected);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal);
    mesh.quaternion.copy(quaternion);
  }

  /**
   * Adds an arrow showing the keep half-space direction.
   * @param plane Cutting plane (normal points toward front).
   * @param points Placement points for origin.
   * @param keepFront Whether the front half-space is kept.
   */
  private addKeepArrow(
    plane: THREE.Plane,
    points: THREE.Vector3[],
    keepFront: boolean
  ): void {
    const origin = this.computePointsCenter(points);
    plane.projectPoint(origin, origin);
    const direction = plane.normal.clone().normalize();
    if (!keepFront) direction.negate();
    const length = Math.max(0.35, this.estimatePlaneSize(points) * 0.18);
    const arrow = new THREE.ArrowHelper(
      direction,
      origin,
      length,
      Theme.selectionColor,
      length * 0.22,
      length * 0.12
    );
    arrow.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
    this.root.add(arrow);
    this.arrowHelper = arrow;
  }

  /**
   * Estimates a readable plane disc size from placement points.
   * @param points Placement points.
   * @returns Plane width/height.
   */
  private estimatePlaneSize(points: THREE.Vector3[]): number {
    if (points.length < 2) return 4;
    let maxDistance = 0;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        maxDistance = Math.max(maxDistance, points[i].distanceTo(points[j]));
      }
    }
    return Math.max(3, maxDistance * 2.2);
  }

  /**
   * Averages placement points.
   * @param points Points to average.
   * @returns Centroid.
   */
  private computePointsCenter(points: THREE.Vector3[]): THREE.Vector3 {
    const center = new THREE.Vector3();
    if (points.length === 0) return center;
    points.forEach((point) => center.add(point));
    return center.multiplyScalar(1 / points.length);
  }

  /**
   * Disposes geometries and materials on a preview object.
   * @param object Object to dispose.
   */
  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (!material) return;
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose());
        return;
      }
      material.dispose();
    });
  }
}
