import * as THREE from 'three';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';
import { closestParameterOnSegmentToRay } from '@/utils/ray_segment_closest.js';
import { clampLoopCutParameter } from './edit_loop_cut_slide.js';

/** Shared raycaster so slide samples do not allocate each pointer move. */
const loopCutSlideRaycaster = new THREE.Raycaster();

/** World-space pick ray used to slide along a locked seed edge. */
export interface LoopCutPointerWorldRay {
  /** Ray origin. */
  origin: THREE.Vector3;
  /** Ray direction. */
  direction: THREE.Vector3;
}

/**
 * Projects a pointer onto a locked world edge using the camera ray.
 *
 * @param event Pointer event.
 * @param camera Active camera.
 * @param pickElement Pick element.
 * @param worldA Edge start.
 * @param worldB Edge end.
 * @returns Interior parameter, or null when the edge is nearly end-on.
 */
export function projectLoopCutParameterFromPointerRay(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
): number | null {
  const ray = readPointerWorldRay(event, camera, pickElement);
  if (!ray) {
    return null;
  }
  if (isSegmentNearlyParallelToDirection(worldA, worldB, ray.direction)) {
    return null;
  }
  return clampLoopCutParameter(closestParameterOnSegmentToRay(worldA, worldB, ray.origin, ray.direction));
}

/**
 * Builds a world pick ray from a pointer and camera.
 *
 * @param event Pointer event.
 * @param camera Active camera.
 * @param pickElement Pick element.
 * @returns Ray, or null when the direction is degenerate.
 */
export function readPointerWorldRay(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
): LoopCutPointerWorldRay | null {
  camera.updateMatrixWorld(true);
  loopCutSlideRaycaster.setFromCamera(pointerEventToNdc(event, pickElement), camera);
  const direction = loopCutSlideRaycaster.ray.direction;
  if (direction.lengthSq() <= 1e-20) {
    return null;
  }
  return {
    origin: loopCutSlideRaycaster.ray.origin.clone(),
    direction: direction.clone(),
  };
}

/**
 * Returns whether a segment is nearly parallel to a direction.
 *
 * @param worldA Segment start.
 * @param worldB Segment end.
 * @param direction Direction to test.
 * @returns True when the closest-point solve is unstable.
 */
export function isSegmentNearlyParallelToDirection(
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
  direction: THREE.Vector3,
): boolean {
  const edgeX = worldB.x - worldA.x;
  const edgeY = worldB.y - worldA.y;
  const edgeZ = worldB.z - worldA.z;
  const edgeLengthSq = edgeX * edgeX + edgeY * edgeY + edgeZ * edgeZ;
  const directionLengthSq = direction.lengthSq();
  if (edgeLengthSq <= 1e-20 || directionLengthSq <= 1e-20) {
    return true;
  }
  return isRayEdgeDenominatorNearlyZero(edgeX, edgeY, edgeZ, edgeLengthSq, direction, directionLengthSq);
}

/**
 * Returns whether the ray-versus-edge denominator is numerically zero.
 *
 * @param edgeX Segment delta X.
 * @param edgeY Segment delta Y.
 * @param edgeZ Segment delta Z.
 * @param edgeLengthSq Squared segment length.
 * @param direction Ray direction.
 * @param directionLengthSq Squared ray length.
 * @returns True when the lines are nearly parallel.
 */
function isRayEdgeDenominatorNearlyZero(
  edgeX: number,
  edgeY: number,
  edgeZ: number,
  edgeLengthSq: number,
  direction: THREE.Vector3,
  directionLengthSq: number,
): boolean {
  const rayDotEdge = direction.x * edgeX + direction.y * edgeY + direction.z * edgeZ;
  const denominator = directionLengthSq * edgeLengthSq - rayDotEdge * rayDotEdge;
  return Math.abs(denominator) <= 1e-12 * directionLengthSq * edgeLengthSq;
}
