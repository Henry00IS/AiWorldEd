import * as THREE from 'three';
import { SolidBrushVisual, SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY } from './solid_brush_visual.js';
import {
  BRUSH_EDGE_FADE_FAR,
  BRUSH_EDGE_FADE_NEAR,
  SOLID_BRUSH_EDGE_USERDATA_KEY,
  SolidBrushEdgeMaterials,
} from './solid_brush_edge_materials.js';

/**
 * Multiplier on fade-far for selected brushes so their edges stay available
 * longer.
 */
const SELECTED_FADE_RANGE_SCALE = 1.75;

/**
 * Beyond this multiple of fade-near, the occluded pass is skipped to save
 * draws.
 */
const OCCLUDED_PASS_RANGE_SCALE = 1.35;

/** Scratch state reused while updating brush edge visibility each frame. */
const cameraWorldPosition = new THREE.Vector3();
const brushWorldCenter = new THREE.Vector3();
const brushWorldScale = new THREE.Vector3();
const brushWorldPosition = new THREE.Vector3();
const brushWorldQuaternion = new THREE.Quaternion();

/**
 * Distance-culls solid brush edge helpers for the perspective multi-view pass.
 * Far brushes hide edge draws so large maps rely on compiled solid geometry.
 * Shared-scene 2D panes must call {@link showAllEdges} before drawing so a prior
 * 3D cull does not leave edges hidden in orthographic views.
 */
export class SolidBrushEdgeFader {
  /**
   * Updates edge line visibility for every solid brush under a scene root.
   *
   * @param root World group or scene containing solid brush helpers.
   * @param camera Perspective camera used for distance tests.
   */
  static updateForCamera(root: THREE.Object3D, camera: THREE.Camera): void {
    camera.getWorldPosition(cameraWorldPosition);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!SolidBrushVisual.isBrushObject(object)) return;
      this.updateBrushEdgeVisibility(object);
    });
  }

  /**
   * Restores full brush edge visibility for orthographic multi-view panes that
   * share the world hierarchy with the perspective pass.
   *
   * @param root World group or scene containing solid brush helpers.
   */
  static showAllEdges(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!SolidBrushVisual.isBrushObject(object)) return;
      this.applyEdgeVisibility(object, true, true);
    });
  }

  /**
   * Prepares shared brush edges and selected hull fills for an orthographic
   * multi-view pass: full-bright front lines and hulls without depth darkening.
   * Call from 2D pane prepare so sky geometry does not hide overlays.
   *
   * @param root World group or scene containing solid brush helpers.
   */
  static prepareForOrthographicPass(root: THREE.Object3D): void {
    SolidBrushEdgeMaterials.setDepthOcclusionEnabled(false);
    SolidBrushVisual.setHullFillDepthOcclusionEnabled(root, false);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!SolidBrushVisual.isBrushObject(object)) return;
      this.applyEdgeVisibility(object, true, false);
    });
  }

  /**
   * Restores dual-pass depth occlusion for edges and selected hull fills before
   * a perspective pass. Edge visibility is then updated by
   * {@link updateForCamera}.
   *
   * @param root World group or scene containing solid brush helpers.
   */
  static prepareForPerspectivePass(root: THREE.Object3D): void {
    SolidBrushEdgeMaterials.setDepthOcclusionEnabled(true);
    SolidBrushVisual.setHullFillDepthOcclusionEnabled(root, true);
  }

  /**
   * Kept for callers that previously invalidated a camera-motion cache. No-op
   * now that every frame re-evaluates distances (brush motion must always
   * update fade even when the camera is still).
   */
  static invalidateCameraCache(): void {}

  /**
   * Shows or hides a brush's decorative edge passes based on camera distance.
   *
   * @param brushMesh Solid brush preview mesh.
   */
  private static updateBrushEdgeVisibility(brushMesh: THREE.Mesh): void {
    const distance = this.estimateNearestDistance(brushMesh);
    const selected = SolidBrushVisual.isHullFillVisible(brushMesh);
    const hideBeyond = selected ? BRUSH_EDGE_FADE_FAR * SELECTED_FADE_RANGE_SCALE : BRUSH_EDGE_FADE_FAR;
    const showFront = distance < hideBeyond;
    const showOccluded = showFront && distance < BRUSH_EDGE_FADE_NEAR * OCCLUDED_PASS_RANGE_SCALE;
    this.applyEdgeVisibility(brushMesh, showFront, showOccluded);
  }

  /**
   * Estimates distance from the camera to the nearest point on the brush
   * bounds.
   *
   * @param brushMesh Brush preview mesh.
   * @returns Non-negative distance in world units.
   */
  private static estimateNearestDistance(brushMesh: THREE.Mesh): number {
    brushMesh.updateMatrixWorld(false);
    const sphere = brushMesh.geometry.boundingSphere;
    if (!sphere) {
      brushMesh.getWorldPosition(brushWorldCenter);
      return cameraWorldPosition.distanceTo(brushWorldCenter);
    }
    return this.distanceToBoundingSphere(brushMesh, sphere);
  }

  /**
   * Distance from the camera to a brush mesh bounding sphere (nearest point).
   *
   * @param brushMesh Brush preview mesh.
   * @param sphere Local-space bounding sphere.
   * @returns Non-negative nearest distance.
   */
  private static distanceToBoundingSphere(brushMesh: THREE.Mesh, sphere: THREE.Sphere): number {
    brushWorldCenter.copy(sphere.center).applyMatrix4(brushMesh.matrixWorld);
    brushMesh.matrixWorld.decompose(brushWorldPosition, brushWorldQuaternion, brushWorldScale);
    const maxScale = Math.max(Math.abs(brushWorldScale.x), Math.abs(brushWorldScale.y), Math.abs(brushWorldScale.z));
    const worldRadius = sphere.radius * maxScale;
    const centerDistance = cameraWorldPosition.distanceTo(brushWorldCenter);
    return Math.max(0, centerDistance - worldRadius);
  }

  /**
   * Applies visibility to front and occluded decorative edge children.
   *
   * @param brushMesh Brush preview mesh.
   * @param showFront Whether front edge pass should draw.
   * @param showOccluded Whether occluded edge pass should draw.
   */
  private static applyEdgeVisibility(brushMesh: THREE.Mesh, showFront: boolean, showOccluded: boolean): void {
    for (const child of brushMesh.children) {
      if (!(child instanceof THREE.LineSegments)) continue;
      if (child.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] !== true) continue;
      const isOccluded = child.userData[SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY] === true;
      const nextVisible = isOccluded ? showOccluded : showFront;
      if (child.visible !== nextVisible) {
        child.visible = nextVisible;
      }
    }
  }
}
