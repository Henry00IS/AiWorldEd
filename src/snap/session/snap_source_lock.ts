import * as THREE from 'three';
import {
  componentTransformLocalToWorld,
  type ComponentTransformVertex,
} from '@/edit/transform/component_transform_vertex.js';
import { SNAP_SOURCE_PICK_RADIUS_PIXELS } from '@/snap/policy/snap_policy.js';
import { snapScreenDistanceToPoint } from '@/snap/query/snap_screen_project.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SNAP_DIRECT_VERTEX_LIMIT } from '@/snap/source/snap_mesh_point_hits.js';

/**
 * Locks the object-move snap source. Uses the vertex nearest the pointer when
 * one lies inside the source radius. Otherwise uses the selection bounds
 * center.
 *
 * @param objects Transform roots being moved.
 * @param camera Camera.
 * @param pickElement Viewport element.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @returns World source point.
 */
export function lockObjectSnapSourcePoint(
  objects: readonly THREE.Object3D[],
  camera: THREE.Camera,
  pickElement: HTMLElement,
  clientX: number,
  clientY: number,
): THREE.Vector3 {
  const pointer = clientPointToElementPixels(pickElement, clientX, clientY);
  const size = elementPixelSize(pickElement);
  const vertices = collectObjectWorldVertices(objects);
  const nearest = nearestVertexWithin(vertices, camera, pointer, size.x, size.y, SNAP_SOURCE_PICK_RADIUS_PIXELS);
  if (nearest) {
    return nearest;
  }
  return boundsCenterOf(objects);
}

/**
 * Locks the edit-mode snap source to the selected vertex nearest the pointer.
 *
 * @param vertices Selected component vertices.
 * @param camera Camera.
 * @param pickElement Viewport element.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @returns World source point, or null when nothing is selected.
 */
export function lockComponentSnapSourcePoint(
  vertices: readonly ComponentTransformVertex[],
  camera: THREE.Camera,
  pickElement: HTMLElement,
  clientX: number,
  clientY: number,
): THREE.Vector3 | null {
  if (vertices.length === 0) {
    return null;
  }
  const pointer = clientPointToElementPixels(pickElement, clientX, clientY);
  const size = elementPixelSize(pickElement);
  const worldPoints = vertices.map((vertex) => componentTransformLocalToWorld(vertex, vertex.initialLocal));
  return nearestVertexWithin(worldPoints, camera, pointer, size.x, size.y, Number.POSITIVE_INFINITY);
}

/**
 * Converts a client point into pixels relative to an element.
 *
 * @param element Viewport element.
 * @param clientX Client X.
 * @param clientY Client Y.
 * @returns Pixel coordinate.
 */
export function clientPointToElementPixels(element: HTMLElement, clientX: number, clientY: number): THREE.Vector2 {
  const rect = element.getBoundingClientRect();
  return new THREE.Vector2(clientX - rect.left, clientY - rect.top);
}

/**
 * Returns the CSS pixel size of an element.
 *
 * @param element Viewport element.
 * @returns Width and height. A zero axis becomes 1.
 */
export function elementPixelSize(element: HTMLElement): THREE.Vector2 {
  return new THREE.Vector2(Math.max(element.clientWidth, 1), Math.max(element.clientHeight, 1));
}

/**
 * Collects world vertices from content meshes and brush previews.
 *
 * @param objects Roots to search.
 * @returns World points.
 */
function collectObjectWorldVertices(objects: readonly THREE.Object3D[]): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const object of objects) {
    object.traverse((child) => appendMeshVertices(child, points));
  }
  return points;
}

/**
 * Appends one mesh's vertices when it is a legal snap source.
 *
 * @param child Scene child.
 * @param points Output list.
 */
function appendMeshVertices(child: THREE.Object3D, points: THREE.Vector3[]): void {
  if (!(child instanceof THREE.Mesh) || isResultMesh(child)) {
    return;
  }
  if (SolidBrushVisual.shouldSkipFacePick(child) && !SolidBrushVisual.isBrushObject(child)) {
    return;
  }
  const positions = child.geometry.getAttribute('position');
  if (!positions || positions.count > SNAP_DIRECT_VERTEX_LIMIT) {
    return;
  }
  child.updateMatrixWorld(true);
  for (let index = 0; index < positions.count; index++) {
    points.push(new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld));
  }
}

/**
 * Returns the vertex closest to the pointer inside a radius.
 *
 * @param points World points.
 * @param camera Camera.
 * @param pointerPixels Pointer in element pixels.
 * @param width Viewport width.
 * @param height Viewport height.
 * @param radiusPixels Maximum screen distance.
 * @returns Closest point, or null.
 */
function nearestVertexWithin(
  points: readonly THREE.Vector3[],
  camera: THREE.Camera,
  pointerPixels: THREE.Vector2,
  width: number,
  height: number,
  radiusPixels: number,
): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null;
  let bestDistance = radiusPixels;
  for (const point of points) {
    const distance = snapScreenDistanceToPoint(point, camera, pointerPixels, width, height);
    if (distance === null || distance > bestDistance) {
      continue;
    }
    best = point;
    bestDistance = distance;
  }
  return best ? best.clone() : null;
}

/**
 * Returns the world bounds center of the objects.
 *
 * @param objects Objects to measure.
 * @returns Center, or the first object's world position.
 */
function boundsCenterOf(objects: readonly THREE.Object3D[]): THREE.Vector3 {
  const bounds = new THREE.Box3();
  for (const object of objects) {
    bounds.expandByObject(object);
  }
  if (bounds.isEmpty()) {
    return objects[0]?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();
  }
  return bounds.getCenter(new THREE.Vector3());
}
