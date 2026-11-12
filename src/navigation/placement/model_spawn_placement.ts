import * as THREE from 'three';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';
import { isDecorativeEdge } from '@/utils/mesh_edge_sync.js';
import { snapPositionToGrid } from './object_spawn_placement.js';

/** Smallest radius a model's bounds count with. */
const MODEL_SPAWN_RADIUS_MINIMUM = 0.01;

/**
 * Returns the spawn point of an object of a given radius (world space), as new
 * volumes get it, or null without a view.
 */
export type ModelSpawnPosition = (objectRadius: number) => THREE.Vector3 | null;

/**
 * Moves the content of an object by minus an offset in its own space, so moving
 * the object by that offset leaves everything where it was.
 */
export type ModelContentShift = (object: THREE.Object3D, offset: THREE.Vector3) => void;

/**
 * Shifts the children of an object and, for a mesh, its geometry; an editable
 * mesh rewrites its document, which also rebuilds its edge overlay.
 *
 * @param object Object.
 * @param offset Offset in the object's space.
 */
export function modelContentShift(object: THREE.Object3D, offset: THREE.Vector3): void {
  const document = object instanceof THREE.Mesh ? readPersistentMeshDocument(object) : null;
  object.children.forEach((child) => {
    if (document === null || !isDecorativeEdge(child)) child.position.sub(offset);
  });
  if (!(object instanceof THREE.Mesh)) return;
  if (document === null) {
    object.geometry.translate(-offset.x, -offset.y, -offset.z);
    return;
  }
  const topology = document.getTopology();
  const positions = topology.getPositions().slice();
  for (let index = 0; index < positions.length; index += 3) {
    positions[index]! -= offset.x;
    positions[index + 1]! -= offset.y;
    positions[index + 2]! -= offset.z;
  }
  topology.setPositions(positions);
  writeMeshDocumentDisplayGeometry(object, document);
}

/**
 * Prepares freshly loaded objects, not yet added to their parent, for a place
 * in front of the last used view, clear of geometry, as new volumes get: each
 * object's pivot moves to the centre of its own bounds without moving its
 * content, then the objects move together so the minimum corner of their
 * combined bounds lands on the grid next to the spawn point.
 *
 * @param objects Top-level objects of one model, in parent-local space.
 * @param parent Parent the objects will be added to.
 * @param spawn Spawn rule of new volumes.
 * @param gridInterval Grid step (non-positive keeps the spawn point as the
 *   centre).
 * @param shift Moves an object's content against a pivot change.
 * @returns True when the objects moved.
 */
export function modelSpawnPlace(
  objects: readonly THREE.Object3D[],
  parent: THREE.Object3D,
  spawn: ModelSpawnPosition,
  gridInterval: number,
  shift: ModelContentShift = modelContentShift,
): boolean {
  const bounds = new THREE.Box3();
  objects.forEach((object) => {
    object.updateMatrixWorld(true);
    bounds.expandByObject(object);
  });
  if (bounds.isEmpty()) return false;
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, MODEL_SPAWN_RADIUS_MINIMUM * 2) / 2;
  const target = spawn(radius);
  if (target === null) return false;
  objects.forEach((object) => modelPivotCentre(object, shift));
  parent.updateMatrixWorld(true);
  const corner = parent.localToWorld(parent.worldToLocal(target.clone()).sub(size.clone().multiplyScalar(0.5)));
  snapPositionToGrid(corner, gridInterval);
  const offset = parent.worldToLocal(corner).sub(bounds.min);
  objects.forEach((object) => {
    object.position.add(offset);
    object.updateMatrixWorld(true);
  });
  return true;
}

/**
 * Moves an object's pivot to the centre of its bounds (parent-local) without
 * moving its content.
 *
 * @param object Detached object.
 * @param shift Moves the object's content against the pivot change.
 */
function modelPivotCentre(object: THREE.Object3D, shift: ModelContentShift): void {
  const bounds = new THREE.Box3().expandByObject(object);
  if (bounds.isEmpty()) return;
  const centre = bounds.getCenter(new THREE.Vector3());
  shift(object, object.worldToLocal(centre.clone()));
  object.position.copy(centre);
  object.updateMatrixWorld(true);
}
