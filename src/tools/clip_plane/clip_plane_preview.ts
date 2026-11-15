import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { ToolClipPlane } from './tool_clip_plane.js';
import { collectClipCutEdgeSegments } from './clip_plane_cut_edges.js';
import { buildClipHalfPreviewPair } from './clip_plane_half_preview.js';
import {
  CLIP_MARKER_CORE_RADIUS,
  CLIP_MARKER_DISTANCE_SCALE,
  CLIP_MARKER_HALO_RADIUS,
  CLIP_MARKER_INDEX_KEY,
  CLIP_MARKER_MAX_SCALE,
  CLIP_MARKER_MIN_SCALE,
  CLIP_MARKER_RIM_RADIUS,
  getClipPointColor,
} from './clip_plane_marker_style.js';
import {
  CLIP_CONSTRUCTION_LINE_USERDATA_KEY,
  CLIP_CUT_EDGE_USERDATA_KEY,
  CLIP_PREVIEW_USERDATA_KEY,
} from './clip_plane_preview_keys.js';

export {
  CLIP_CONSTRUCTION_LINE_USERDATA_KEY,
  CLIP_CUT_EDGE_USERDATA_KEY,
  CLIP_PREVIEW_USERDATA_KEY,
} from './clip_plane_preview_keys.js';

/** Overlay render order for construction and cut lines. */
const CLIP_LINE_RENDER_ORDER = 1000;

/** Compact keep-side chevron length scale. */
const KEEP_ARROW_LENGTH_FACTOR = 0.12;

/**
 * Professional clip preview: RGB-coded points, short construction polyline,
 * plane∩brush cut edges, and keep/discard half fills. Intentionally omits
 * infinite guide rays and floating plane discs.
 */
export class ClipPlanePreview {
  private root: THREE.Group;
  private markerGroups: THREE.Group[];

  /** Creates a preview group that should be added to the world or scene. */
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'clip_plane_preview';
    this.root.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
    this.markerGroups = [];
  }

  /**
   * Returns the root group to attach to a scene.
   *
   * @returns Preview root group.
   */
  getRoot(): THREE.Group {
    return this.root;
  }

  /**
   * Syncs preview visuals from the clip tool. Rebuilds only when called (tool
   * changes / drag / selection) — never from the render loop. Half fills and
   * cut edges use selected targets only.
   *
   * @param tool Clip plane tool providing points and plane.
   * @param targetMeshes Selected meshes to preview-clip.
   */
  syncFromTool(tool: ToolClipPlane, targetMeshes: readonly THREE.Mesh[] = []): void {
    this.clearVisuals();
    if (!tool.isActive()) return;
    tool.getPoints().forEach((point, index) => this.addMarker(point, index));
    this.addConstructionPolyline(tool.getPoints());
    const plane = tool.getPlane();
    if (!plane) return;
    this.addCutSilhouette(plane, targetMeshes);
    this.addHalfBrushPreviews(plane, targetMeshes, tool.getKeepFront());
    this.addKeepChevron(plane, tool.getPoints(), tool.getKeepFront());
  }

  /**
   * Scales markers for consistent on-screen size relative to a camera.
   *
   * @param camera Active viewport camera.
   */
  updateMarkerScalesForCamera(camera: THREE.Camera): void {
    const scale = this.computeMarkerScale(camera);
    this.markerGroups.forEach((group) => group.scale.setScalar(scale));
  }

  /** Removes all preview children and disposes resources. */
  dispose(): void {
    this.clearVisuals();
    this.root.parent?.remove(this.root);
  }

  /** Clears overlays (markers, lines, half fills). Never mutates scene meshes. */
  private clearVisuals(): void {
    while (this.root.children.length > 0) {
      const child = this.root.children[0]!;
      this.root.remove(child);
      this.disposeObject(child);
    }
    this.markerGroups = [];
  }

  /**
   * Adds an RGB-coded placement marker (point 1 red, 2 green, 3 blue).
   *
   * @param point World point.
   * @param index Placement point index for drag identification.
   */
  private addMarker(point: THREE.Vector3, index: number): void {
    const group = new THREE.Group();
    group.position.copy(point);
    group.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
    group.userData[CLIP_MARKER_INDEX_KEY] = index;
    group.add(this.createMarkerHalo());
    group.add(this.createMarkerRim());
    group.add(this.createMarkerCore(index));
    group.renderOrder = 999;
    this.root.add(group);
    this.markerGroups.push(group);
  }

  /**
   * Builds the solid colored core sphere for a placement point.
   *
   * @param index Point index for color.
   * @returns Core mesh.
   */
  private createMarkerCore(index: number): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(CLIP_MARKER_CORE_RADIUS, 14, 12);
    const material = new THREE.MeshBasicMaterial({
      color: getClipPointColor(index),
      depthTest: false,
      toneMapped: false,
    });
    return this.tagOverlayMesh(new THREE.Mesh(geometry, material), 1002);
  }

  /**
   * Builds a light rim between halo and core so points read on dark fills.
   *
   * @returns Rim mesh.
   */
  private createMarkerRim(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(CLIP_MARKER_RIM_RADIUS, 14, 12);
    const material = new THREE.MeshBasicMaterial({
      color: 0xe8eef4,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
    });
    return this.tagOverlayMesh(new THREE.Mesh(geometry, material), 1001);
  }

  /**
   * Builds a dark halo behind the marker core for contrast on light fills.
   *
   * @returns Halo mesh.
   */
  private createMarkerHalo(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(CLIP_MARKER_HALO_RADIUS, 14, 12);
    const material = new THREE.MeshBasicMaterial({
      color: 0x0c0e12,
      depthTest: false,
      transparent: true,
      opacity: 0.72,
      toneMapped: false,
    });
    return this.tagOverlayMesh(new THREE.Mesh(geometry, material), 1000);
  }

  /**
   * Tags a mesh as clip preview overlay geometry.
   *
   * @param mesh Mesh to tag.
   * @param renderOrder Draw order.
   * @returns The same mesh.
   */
  private tagOverlayMesh(mesh: THREE.Mesh, renderOrder: number): THREE.Mesh {
    mesh.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
    mesh.renderOrder = renderOrder;
    return mesh;
  }

  /**
   * Draws a short construction polyline only between placed points (CAD style).
   * Never extends into an infinite ray.
   *
   * @param points Placement points.
   */
  private addConstructionPolyline(points: THREE.Vector3[]): void {
    if (points.length < 2) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: Theme.clipConstructionLineColor,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.65,
      toneMapped: false,
    });
    const line = new THREE.Line(geometry, material);
    line.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
    line.userData[CLIP_CONSTRUCTION_LINE_USERDATA_KEY] = true;
    line.renderOrder = CLIP_LINE_RENDER_ORDER;
    line.frustumCulled = false;
    this.root.add(line);
  }

  /**
   * Draws plane∩mesh cut edges for selected targets (the cut silhouette).
   *
   * @param plane World clip plane.
   * @param targetMeshes Selected clip targets.
   */
  private addCutSilhouette(plane: THREE.Plane, targetMeshes: readonly THREE.Mesh[]): void {
    if (targetMeshes.length === 0) return;
    const segments = collectClipCutEdgeSegments(plane, targetMeshes);
    if (segments.length < 2) return;
    this.root.add(this.createOverlayLineSegments(segments, Theme.clipCutEdgeColor, CLIP_CUT_EDGE_USERDATA_KEY));
  }

  /**
   * Builds keep/discard half fills as overlays. Source meshes stay visible —
   * halves never hide scene geometry (that made regular meshes vanish and
   * caused solid results to z-fight when only the brush was hidden).
   *
   * @param plane World clip plane.
   * @param targetMeshes Selected targets.
   * @param keepFront Keep-front preference.
   */
  private addHalfBrushPreviews(plane: THREE.Plane, targetMeshes: readonly THREE.Mesh[], keepFront: boolean): void {
    targetMeshes.forEach((target) => {
      const pair = buildClipHalfPreviewPair(target, plane, keepFront);
      if (pair.keepMesh) this.root.add(pair.keepMesh);
      if (pair.discardMesh) this.root.add(pair.discardMesh);
    });
  }

  /**
   * Small keep-side chevron at the cut center (flip affordance without
   * clutter).
   *
   * @param plane Cutting plane.
   * @param points Placement points.
   * @param keepFront Whether front is kept.
   */
  private addKeepChevron(plane: THREE.Plane, points: THREE.Vector3[], keepFront: boolean): void {
    if (points.length < 2) return;
    const origin = this.computePointsCenter(points);
    plane.projectPoint(origin, origin);
    const direction = plane.normal.clone().normalize();
    if (!keepFront) direction.negate();
    const length = Math.max(0.28, this.estimateSpan(points) * KEEP_ARROW_LENGTH_FACTOR);
    const arrow = new THREE.ArrowHelper(direction, origin, length, Theme.clipKeepColor, length * 0.28, length * 0.16);
    arrow.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
    this.styleKeepArrowAsOverlay(arrow);
    this.root.add(arrow);
  }

  /**
   * Builds depth-test-disabled line segments for cut edges.
   *
   * @param endpoints Interleaved segment endpoints.
   * @param color Line color.
   * @param kindKey UserData kind flag.
   * @returns LineSegments overlay.
   */
  private createOverlayLineSegments(
    endpoints: readonly THREE.Vector3[],
    color: number,
    kindKey: string,
  ): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry().setFromPoints(endpoints as THREE.Vector3[]);
    const material = new THREE.LineBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
    lines.userData[kindKey] = true;
    lines.renderOrder = CLIP_LINE_RENDER_ORDER;
    lines.frustumCulled = false;
    return lines;
  }

  /**
   * Computes a screen-stable scale factor for markers.
   *
   * @param camera Active camera.
   * @returns Clamped scale multiplier.
   */
  private computeMarkerScale(camera: THREE.Camera): number {
    if (this.markerGroups.length === 0) return 1;
    const anchor = this.markerGroups[0]!.position;
    let raw = 1;
    if (camera instanceof THREE.PerspectiveCamera) {
      raw = camera.position.distanceTo(anchor) * CLIP_MARKER_DISTANCE_SCALE;
    } else if (camera instanceof THREE.OrthographicCamera) {
      const halfHeight = Math.abs(camera.top - camera.bottom) * 0.5;
      raw = halfHeight * CLIP_MARKER_DISTANCE_SCALE * 2.5;
    }
    return Math.min(CLIP_MARKER_MAX_SCALE, Math.max(CLIP_MARKER_MIN_SCALE, raw));
  }

  /**
   * Makes ArrowHelper draw on top as a compact overlay.
   *
   * @param arrow Keep-side direction helper.
   */
  private styleKeepArrowAsOverlay(arrow: THREE.ArrowHelper): void {
    arrow.renderOrder = 1000;
    arrow.traverse((child) => {
      child.renderOrder = 1000;
      child.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
      const materialOwner = child as THREE.Mesh | THREE.Line;
      if (!materialOwner.material) return;
      const materials = Array.isArray(materialOwner.material) ? materialOwner.material : [materialOwner.material];
      materials.forEach((material) => {
        material.depthTest = false;
        material.depthWrite = false;
        material.transparent = true;
        material.needsUpdate = true;
      });
    });
  }

  /**
   * Estimates a span from placement points for chevron sizing.
   *
   * @param points Placement points.
   * @returns Characteristic length.
   */
  private estimateSpan(points: THREE.Vector3[]): number {
    if (points.length < 2) return 4;
    let maxDistance = 0;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        maxDistance = Math.max(maxDistance, points[i]!.distanceTo(points[j]!));
      }
    }
    return Math.max(2, maxDistance);
  }

  /**
   * Averages placement points.
   *
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
   *
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
