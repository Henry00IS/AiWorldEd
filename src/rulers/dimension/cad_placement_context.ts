import * as THREE from 'three';
import { CadRulerStyle } from '@/rulers/system/cad_ruler_style.js';
import type { CadViewPlane } from '@/rulers/view/cad_view_plane.js';

/**
 * Per-viewport placement metrics: camera used to pick near-side faces and
 * screen-stable world offsets so rulers do not fly away as the solid grows.
 */
export interface CadPlacementContext {
  /** Viewport camera (perspective or orthographic). */
  camera: THREE.Camera;
  /** World-unit stand-off from mesh edge to dimension line. */
  offsetWorld: number;
  /** World-unit extension overshoot past the dimension line. */
  overshootWorld: number;
  /** World-unit gap from mesh to extension start (0 = connected). */
  gapWorld: number;
  /**
   * View plane for axis filtering and in-plane offset. Top=`xz`, front=`xy`,
   * side=`yz`, perspective=`xyz`.
   */
  viewPlane: CadViewPlane;
}

const scratchCameraDirection = new THREE.Vector3();
const scratchToCamera = new THREE.Vector3();

/**
 * Builds placement metrics for a viewport camera at a world anchor point.
 *
 * @param camera Active viewport camera.
 * @param viewportCssHeight Pane content CSS height (not full shared canvas).
 * @param worldAnchor Point used to estimate world units per pixel.
 * @param viewPlane Optional view plane (defaults to full 3D).
 * @returns Placement context with clamped world offsets.
 */
export function createCadPlacementContext(
  camera: THREE.Camera,
  viewportCssHeight: number,
  worldAnchor: THREE.Vector3,
  viewPlane: CadViewPlane = 'xyz',
): CadPlacementContext {
  const worldPerPixel = estimateWorldUnitsPerPixel(camera, viewportCssHeight, worldAnchor);
  const offsetWorld = clampWorld(
    worldPerPixel * CadRulerStyle.dimensionOffsetPixels,
    CadRulerStyle.minimumOffsetWorld,
    CadRulerStyle.maximumOffsetWorld,
  );
  const overshootWorld = resolveOptionalWorldOffset(
    worldPerPixel * CadRulerStyle.extensionOvershootPixels,
    CadRulerStyle.minimumOffsetWorld * 0.25,
    CadRulerStyle.maximumOffsetWorld * 0.25,
  );
  const gapWorld = worldPerPixel * CadRulerStyle.extensionGapPixels;
  return {
    camera,
    offsetWorld,
    overshootWorld,
    gapWorld,
    viewPlane,
  };
}

/**
 * Builds a fixed placement context for unit tests without a live renderer.
 *
 * @param camera Camera used for near-side selection.
 * @param offsetWorld Fixed stand-off in world units.
 * @param viewPlane Optional view plane (defaults to full 3D).
 * @returns Placement context.
 */
export function createFixedCadPlacementContext(
  camera: THREE.Camera,
  offsetWorld: number = 0.15,
  viewPlane: CadViewPlane = 'xyz',
): CadPlacementContext {
  return {
    camera,
    offsetWorld,
    overshootWorld: 0,
    gapWorld: 0,
    viewPlane,
  };
}

/**
 * Estimates world units covered by one CSS pixel at a world anchor.
 *
 * @param camera Active camera.
 * @param viewportCssHeight Pane content height in CSS pixels.
 * @param worldAnchor Sample point in world space.
 * @returns World units per pixel.
 */
export function estimateWorldUnitsPerPixel(
  camera: THREE.Camera,
  viewportCssHeight: number,
  worldAnchor: THREE.Vector3,
): number {
  const height = Math.max(1, viewportCssHeight || 1);
  if (camera instanceof THREE.OrthographicCamera) {
    const viewHeight = Math.abs(camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6);
    return viewHeight / height;
  }
  if (camera instanceof THREE.PerspectiveCamera) {
    const distance = camera.position.distanceTo(worldAnchor);
    const verticalFovRadians = THREE.MathUtils.degToRad(camera.fov);
    const viewHeight = 2 * Math.tan(verticalFovRadians * 0.5) * Math.max(distance, 0.01);
    return viewHeight / height;
  }
  return 0.01;
}

/**
 * Fills a vector with the direction from a world point toward the camera eye.
 * Works for perspective and orthographic cameras (Y-up scenes).
 *
 * @param camera Active camera.
 * @param worldPoint Sample world point.
 * @param target Receives a normalized to-camera direction.
 */
export function writeDirectionTowardCamera(
  camera: THREE.Camera,
  worldPoint: THREE.Vector3,
  target: THREE.Vector3,
): void {
  if (camera instanceof THREE.OrthographicCamera) {
    camera.getWorldDirection(scratchCameraDirection);
    target.copy(scratchCameraDirection).multiplyScalar(-1);
    if (target.lengthSq() < 1e-12) {
      target.set(0, 0, 1);
    } else {
      target.normalize();
    }
    return;
  }
  target.copy(camera.position).sub(worldPoint);
  if (target.lengthSq() < 1e-12) {
    camera.getWorldDirection(scratchCameraDirection);
    target.copy(scratchCameraDirection).multiplyScalar(-1).normalize();
    return;
  }
  target.normalize();
}

/**
 * Clamps a world offset into a safe range.
 *
 * @param value Raw world units.
 * @param min Minimum.
 * @param max Maximum.
 * @returns Clamped value.
 */
function clampWorld(value: number, min: number, max: number): number {
  return THREE.MathUtils.clamp(value, min, max);
}

/**
 * Clamps a world offset, but keeps an exact zero so style flags like
 * extensionOvershootPixels: 0 are not forced up to a minimum.
 *
 * @param value Raw world units.
 * @param min Minimum when value is positive.
 * @param max Maximum.
 * @returns Zero or a clamped positive world offset.
 */
function resolveOptionalWorldOffset(value: number, min: number, max: number): number {
  if (value <= 0) return 0;
  return clampWorld(value, min, max);
}

// Keep scratch used only here from being tree-shaken incorrectly in some tools.
void scratchToCamera;
