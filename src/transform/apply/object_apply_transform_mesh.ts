import * as THREE from 'three';
import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';
import { readBoundMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import { rebuildDecorativeEdges } from '@/utils/mesh_edge_sync.js';
import type { ObjectApplyTransformFlags } from './object_apply_transform_flags.js';
import {
  buildObjectApplyBakeMatrix,
  captureObjectLocalPose,
  clearObjectAppliedTransformChannels,
  restoreObjectLocalPose,
  type ObjectLocalPoseSnapshot,
} from './object_apply_transform_matrix.js';

/** Undo payload for one content mesh apply. */
export interface ObjectApplyMeshSnapshot {
  mesh: THREE.Mesh;
  pose: ObjectLocalPoseSnapshot;
  positions: Float32Array;
  usedDocument: boolean;
}

/**
 * Bakes selected local transform channels into mesh geometry and clears them on
 * the object.
 *
 * @param mesh Content mesh.
 * @param flags Channels to bake.
 * @returns Snapshot for undo, or null when nothing changed.
 */
export function applyObjectTransformToContentMesh(
  mesh: THREE.Mesh,
  flags: ObjectApplyTransformFlags,
): ObjectApplyMeshSnapshot | null {
  if (!hasAnyApplyFlag(flags)) {
    return null;
  }
  if (isIdentityObjectPose(mesh, flags)) {
    return null;
  }
  const snapshot = captureMeshSnapshot(mesh);
  const bakeMatrix = buildObjectApplyBakeMatrix(mesh, flags);
  bakeMeshGeometry(mesh, bakeMatrix, snapshot.usedDocument);
  clearObjectAppliedTransformChannels(mesh, flags);
  return snapshot;
}

/**
 * Restores a content mesh apply snapshot.
 *
 * @param snapshot Undo snapshot.
 */
export function restoreObjectApplyMeshSnapshot(snapshot: ObjectApplyMeshSnapshot): void {
  writeMeshPositions(snapshot.mesh, snapshot.positions, snapshot.usedDocument);
  restoreObjectLocalPose(snapshot.mesh, snapshot.pose);
  rebuildMeshDisplay(snapshot.mesh, snapshot.usedDocument);
}

/**
 * Captures mesh positions and pose before baking.
 *
 * @param mesh Content mesh.
 * @returns Snapshot.
 */
export function captureMeshSnapshot(mesh: THREE.Mesh): ObjectApplyMeshSnapshot {
  const document = readBoundMeshEditDocument(mesh);
  if (document) {
    const positions = document.getTopology().getPositions();
    return {
      mesh,
      pose: captureObjectLocalPose(mesh),
      positions: new Float32Array(positions),
      usedDocument: true,
    };
  }
  const attribute = mesh.geometry.getAttribute('position');
  const array = attribute?.array ? new Float32Array(attribute.array as ArrayLike<number>) : new Float32Array(0);
  return {
    mesh,
    pose: captureObjectLocalPose(mesh),
    positions: array,
    usedDocument: false,
  };
}

/**
 * Bakes a matrix into mesh document or buffer geometry positions.
 *
 * @param mesh Content mesh.
 * @param bakeMatrix Local bake matrix.
 * @param usedDocument Whether a mesh document owns positions.
 */
export function bakeMeshGeometry(mesh: THREE.Mesh, bakeMatrix: THREE.Matrix4, usedDocument: boolean): void {
  if (usedDocument) {
    bakeMeshDocumentPositions(mesh, bakeMatrix);
    rebuildMeshDisplay(mesh, true);
    return;
  }
  mesh.geometry.applyMatrix4(bakeMatrix);
  mesh.geometry.computeBoundingSphere();
  mesh.geometry.computeBoundingBox();
  rebuildDecorativeEdges(mesh);
}

/**
 * Transforms MeshDocument vertex positions by a bake matrix.
 *
 * @param mesh Content mesh with bound document.
 * @param bakeMatrix Bake matrix.
 */
function bakeMeshDocumentPositions(mesh: THREE.Mesh, bakeMatrix: THREE.Matrix4): void {
  const document = readBoundMeshEditDocument(mesh);
  if (!document) {
    return;
  }
  const positions = document.getTopology().getPositions();
  const vertex = new THREE.Vector3();
  const vertexCount = document.getTopology().getVertexCount();
  for (let index = 0; index < vertexCount; index++) {
    const base = index * 3;
    vertex.set(positions[base]!, positions[base + 1]!, positions[base + 2]!).applyMatrix4(bakeMatrix);
    positions[base] = vertex.x;
    positions[base + 1] = vertex.y;
    positions[base + 2] = vertex.z;
  }
  document.markPositionsDirty();
}

/**
 * Writes raw position data back onto a mesh.
 *
 * @param mesh Content mesh.
 * @param positions Packed positions.
 * @param usedDocument Document vs buffer path.
 */
function writeMeshPositions(mesh: THREE.Mesh, positions: Float32Array, usedDocument: boolean): void {
  if (usedDocument) {
    const document = readBoundMeshEditDocument(mesh);
    if (!document) {
      return;
    }
    document.getTopology().getPositions().set(positions);
    document.markPositionsDirty();
    return;
  }
  const attribute = mesh.geometry.getAttribute('position');
  if (!attribute) {
    return;
  }
  (attribute.array as Float32Array).set(positions);
  attribute.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
  mesh.geometry.computeBoundingBox();
}

/**
 * Rebuilds display buffers after document or edge edits.
 *
 * @param mesh Content mesh.
 * @param usedDocument Whether a document drives geometry.
 */
function rebuildMeshDisplay(mesh: THREE.Mesh, usedDocument: boolean): void {
  if (usedDocument) {
    const document = readBoundMeshEditDocument(mesh);
    if (!document) {
      return;
    }
    writeMeshDocumentDisplayGeometry(mesh, document);
    return;
  }
  rebuildDecorativeEdges(mesh);
}

/**
 * Returns whether any apply channel is enabled.
 *
 * @param flags Channel flags.
 * @returns True when at least one channel is set.
 */
function hasAnyApplyFlag(flags: ObjectApplyTransformFlags): boolean {
  return flags.location || flags.rotation || flags.scale;
}

/**
 * Returns whether the object's selected channels are already identity.
 *
 * @param object Object pose.
 * @param flags Channels to inspect.
 * @returns True when bake would be a no-op.
 */
function isIdentityObjectPose(object: THREE.Object3D, flags: ObjectApplyTransformFlags): boolean {
  if (flags.location && object.position.lengthSq() > 1e-12) {
    return false;
  }
  if (flags.rotation && object.quaternion.angleTo(new THREE.Quaternion()) > 1e-6) {
    return false;
  }
  if (
    flags.scale &&
    (Math.abs(object.scale.x - 1) > 1e-6 || Math.abs(object.scale.y - 1) > 1e-6 || Math.abs(object.scale.z - 1) > 1e-6)
  ) {
    return false;
  }
  return true;
}
