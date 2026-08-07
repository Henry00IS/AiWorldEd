import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidModel } from '@/solid/model/solid_model.js';

/** One editable vertex owned by a content mesh document. */
export interface ComponentTransformMeshVertex {
  kind: 'mesh';
  targetId: string;
  vertexIndex: number;
  mesh: THREE.Mesh;
  document: MeshDocument;
  initialLocal: THREE.Vector3;
}

/** One editable vertex owned by a solid brush. */
export interface ComponentTransformBrushVertex {
  kind: 'brush';
  targetId: string;
  vertexIndex: number;
  solidModel: SolidModel;
  brushId: string;
  brush: SolidBrush;
  mesh: THREE.Mesh | null;
  initialLocal: THREE.Vector3;
}

/** Union of component transform vertices. */
export type ComponentTransformVertex = ComponentTransformMeshVertex | ComponentTransformBrushVertex;

/**
 * Reads the current local position of a component vertex.
 *
 * @param vertex Vertex descriptor.
 * @returns Local position copy.
 */
export function readComponentTransformVertexLocal(vertex: ComponentTransformVertex): THREE.Vector3 {
  if (vertex.kind === 'mesh') {
    const positions = vertex.document.getTopology().getPositions();
    const base = vertex.vertexIndex * 3;
    return new THREE.Vector3(positions[base]!, positions[base + 1]!, positions[base + 2]!);
  }
  return vertex.brush.vertices[vertex.vertexIndex]!.clone();
}

/**
 * Writes a local position onto a component vertex.
 *
 * @param vertex Vertex descriptor.
 * @param local New local position.
 */
export function writeComponentTransformVertexLocal(vertex: ComponentTransformVertex, local: THREE.Vector3): void {
  if (vertex.kind === 'mesh') {
    const positions = vertex.document.getTopology().getPositions();
    const base = vertex.vertexIndex * 3;
    positions[base] = local.x;
    positions[base + 1] = local.y;
    positions[base + 2] = local.z;
    return;
  }
  vertex.brush.vertices[vertex.vertexIndex]!.copy(local);
}

/**
 * Converts a local component vertex position to world space.
 *
 * @param vertex Vertex descriptor.
 * @param local Local position.
 * @returns World position.
 */
export function componentTransformLocalToWorld(vertex: ComponentTransformVertex, local: THREE.Vector3): THREE.Vector3 {
  if (vertex.kind === 'mesh') {
    vertex.mesh.updateMatrixWorld(true);
    return local.clone().applyMatrix4(vertex.mesh.matrixWorld);
  }
  const matrix = buildBrushWorldMatrix(vertex);
  return local.clone().applyMatrix4(matrix);
}

/**
 * Converts a world position into local component space.
 *
 * @param vertex Vertex descriptor.
 * @param world World position.
 * @returns Local position.
 */
export function componentTransformWorldToLocal(vertex: ComponentTransformVertex, world: THREE.Vector3): THREE.Vector3 {
  if (vertex.kind === 'mesh') {
    vertex.mesh.updateMatrixWorld(true);
    return world.clone().applyMatrix4(vertex.mesh.matrixWorld.clone().invert());
  }
  const matrix = buildBrushWorldMatrix(vertex).invert();
  return world.clone().applyMatrix4(matrix);
}

/**
 * Builds the world matrix for a brush instance.
 *
 * @param vertex Brush vertex descriptor.
 * @returns World matrix.
 */
function buildBrushWorldMatrix(vertex: ComponentTransformBrushVertex): THREE.Matrix4 {
  const root = vertex.solidModel.root;
  root.updateMatrixWorld(true);
  const instance = vertex.solidModel.findBrush(vertex.brushId);
  if (!instance) {
    return root.matrixWorld.clone();
  }
  return root.matrixWorld.clone().multiply(instance.getLocalMatrix());
}
