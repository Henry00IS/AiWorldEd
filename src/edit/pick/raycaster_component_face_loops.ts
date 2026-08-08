import * as THREE from 'three';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';
import { triangulateSimplePolygon3d } from '@/mesh/convert/mesh_polygon_triangulate.js';

/** One pickable face loop in world space. */
export interface ComponentFaceLoop {
  faceIndex: number;
  worldLoop: readonly THREE.Vector3[];
}

/** One domain target with world-space face loops for Edit Mode face pick. */
export interface ComponentFaceLoopTarget {
  targetId: string;
  faces: readonly ComponentFaceLoop[];
}

/** Result of a topology face-loop pick in Edit Mode. */
export interface ComponentFaceLoopPickResult {
  targetId: string;
  faceIndex: number;
  hitPoint: THREE.Vector3;
  distance: number;
}

/**
 * Picks the closest front-facing topology face loop under the pointer.
 *
 * @param event Pointer event.
 * @param camera Active camera.
 * @param pickElement Element used for NDC conversion.
 * @param targets Domain face-loop targets.
 * @returns Closest face pick, or null.
 */
export function pickComponentFaceLoops(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  targets: readonly ComponentFaceLoopTarget[],
): ComponentFaceLoopPickResult | null {
  if (targets.length === 0) {
    return null;
  }
  camera.updateMatrixWorld(true);
  const ray = buildWorldPickRay(event, camera, pickElement);
  return pickClosestFrontFaceAcrossTargets(targets, ray);
}

/**
 * Builds a world-space pick ray from a pointer event and camera.
 *
 * @param event Pointer event.
 * @param camera Active camera.
 * @param pickElement Element used for NDC conversion.
 * @returns World ray for face intersection.
 */
function buildWorldPickRay(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement): THREE.Ray {
  const ndc = pointerEventToNdc(event, pickElement);
  const helper = new THREE.Raycaster();
  helper.setFromCamera(ndc, camera);
  return helper.ray.clone();
}

/**
 * Finds the closest front-facing face loop across all targets.
 *
 * @param targets Domain face-loop targets.
 * @param ray World pick ray.
 * @returns Closest face pick, or null.
 */
function pickClosestFrontFaceAcrossTargets(
  targets: readonly ComponentFaceLoopTarget[],
  ray: THREE.Ray,
): ComponentFaceLoopPickResult | null {
  let best: ComponentFaceLoopPickResult | null = null;
  for (const target of targets) {
    const hit = pickClosestFrontFaceOnTarget(target, ray, best?.distance ?? Infinity);
    if (hit) {
      best = hit;
    }
  }
  return best;
}

/**
 * Finds the closest front-facing face on one target.
 *
 * @param target Face-loop target.
 * @param ray World pick ray.
 * @param maxDistance Current closest hit distance.
 * @returns Closest face within the distance cap, or null.
 */
function pickClosestFrontFaceOnTarget(
  target: ComponentFaceLoopTarget,
  ray: THREE.Ray,
  maxDistance: number,
): ComponentFaceLoopPickResult | null {
  let best: ComponentFaceLoopPickResult | null = null;
  let limit = maxDistance;
  for (const face of target.faces) {
    const hit = pickFrontFacingWorldLoop(target.targetId, face.faceIndex, face.worldLoop, ray, limit);
    if (!hit) {
      continue;
    }
    limit = hit.distance;
    best = hit;
  }
  return best;
}

/**
 * Raycasts an ear-clipped world loop and returns the closest front hit.
 *
 * @param targetId Domain target id.
 * @param faceIndex Face index on the target.
 * @param worldLoop Ordered world-space corners.
 * @param ray World pick ray.
 * @param maxDistance Current closest hit distance.
 * @returns Face pick when a closer front triangle is hit, or null.
 */
function pickFrontFacingWorldLoop(
  targetId: string,
  faceIndex: number,
  worldLoop: readonly THREE.Vector3[],
  ray: THREE.Ray,
  maxDistance: number,
): ComponentFaceLoopPickResult | null {
  if (worldLoop.length < 3) {
    return null;
  }
  const triangleIndices = triangulateSimplePolygon3d(worldLoop);
  if (triangleIndices.length < 3) {
    return null;
  }
  return pickClosestEarClipTriangle(targetId, faceIndex, worldLoop, triangleIndices, ray, maxDistance);
}

/**
 * Raycasts ear-clip triangles and keeps the closest front-facing hit.
 *
 * @param targetId Domain target id.
 * @param faceIndex Face index.
 * @param worldLoop Ordered world-space corners.
 * @param triangleIndices Flat triples of loop indices from ear-clip.
 * @param ray World pick ray.
 * @param maxDistance Current closest hit distance.
 * @returns Closest front-facing triangle hit, or null.
 */
function pickClosestEarClipTriangle(
  targetId: string,
  faceIndex: number,
  worldLoop: readonly THREE.Vector3[],
  triangleIndices: readonly number[],
  ray: THREE.Ray,
  maxDistance: number,
): ComponentFaceLoopPickResult | null {
  let best: ComponentFaceLoopPickResult | null = null;
  let limit = maxDistance;
  for (let index = 0; index + 2 < triangleIndices.length; index += 3) {
    const hit = tryIntersectIndexedTriangle(
      targetId,
      faceIndex,
      worldLoop,
      triangleIndices[index]!,
      triangleIndices[index + 1]!,
      triangleIndices[index + 2]!,
      ray,
      limit,
    );
    if (!hit) {
      continue;
    }
    limit = hit.distance;
    best = hit;
  }
  return best;
}

/**
 * Intersects one ear-clip triangle and accepts it when closer and front-facing.
 *
 * @param targetId Domain target id.
 * @param faceIndex Face index.
 * @param worldLoop Ordered world-space corners.
 * @param indexA First loop corner index.
 * @param indexB Second loop corner index.
 * @param indexC Third loop corner index.
 * @param ray World pick ray.
 * @param maxDistance Current closest hit distance.
 * @returns Face pick when accepted, or null.
 */
function tryIntersectIndexedTriangle(
  targetId: string,
  faceIndex: number,
  worldLoop: readonly THREE.Vector3[],
  indexA: number,
  indexB: number,
  indexC: number,
  ray: THREE.Ray,
  maxDistance: number,
): ComponentFaceLoopPickResult | null {
  const a = worldLoop[indexA];
  const b = worldLoop[indexB];
  const c = worldLoop[indexC];
  if (!a || !b || !c) {
    return null;
  }
  const hitPoint = new THREE.Vector3();
  if (!ray.intersectTriangle(a, b, c, true, hitPoint)) {
    return null;
  }
  return acceptCloserHit(targetId, faceIndex, ray, hitPoint, maxDistance);
}

/**
 * Accepts a triangle hit when it is closer than the current distance cap.
 *
 * @param targetId Domain target id.
 * @param faceIndex Face index.
 * @param ray World pick ray.
 * @param hitPoint Intersection point in world space.
 * @param maxDistance Current closest hit distance.
 * @returns Face pick when closer, or null.
 */
function acceptCloserHit(
  targetId: string,
  faceIndex: number,
  ray: THREE.Ray,
  hitPoint: THREE.Vector3,
  maxDistance: number,
): ComponentFaceLoopPickResult | null {
  const distance = ray.origin.distanceTo(hitPoint);
  if (!(distance < maxDistance)) {
    return null;
  }
  return {
    targetId,
    faceIndex,
    hitPoint: hitPoint.clone(),
    distance,
  };
}
