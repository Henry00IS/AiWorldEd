import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';
import { ensureMeshEditDocument, readBoundMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { applyComponentTranslationDelta } from '@/edit/transform/component_transform_apply.js';
import type { ComponentTransformMeshVertex } from '@/edit/transform/component_transform_vertex.js';
import { readComponentTransformVertexLocal } from '@/edit/transform/component_transform_vertex.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';

describe('component transform document stability', () => {
  it('authors spheres with a persistent MeshDocument', () => {
    const tool = new ToolPrimitiveCreation(new THREE.Group());
    const mesh = tool.createSphere(0.5);
    const persistent = readPersistentMeshDocument(mesh);
    expect(persistent).toBeTruthy();
    expect(persistent!.getTopology().getFaceCount()).toBeGreaterThan(100);
    tool.dispose();
    mesh.geometry.dispose();
  });

  it('keeps face and vertex counts stable when dragging a sphere face', () => {
    const tool = new ToolPrimitiveCreation(new THREE.Group());
    const mesh = tool.createSphere(0.5);
    const document = ensureMeshEditDocument(mesh);
    expect(document).toBeTruthy();
    if (!document) {
      return;
    }
    const topology = document.getTopology();
    const faceCountBefore = topology.getFaceCount();
    const vertexCountBefore = topology.getVertexCount();
    const faceIndex = Math.floor(faceCountBefore / 2);
    const transformVertices = collectFaceTransformVertices(mesh, document, faceIndex);
    expect(transformVertices.length).toBeGreaterThanOrEqual(3);
    applyComponentTranslationDelta(transformVertices, new THREE.Vector3(0, 0.25, 0));
    expect(document.getTopology().getFaceCount()).toBe(faceCountBefore);
    expect(document.getTopology().getVertexCount()).toBe(vertexCountBefore);
    expect(readBoundMeshEditDocument(mesh)).toBe(document);
    tool.dispose();
    mesh.geometry.dispose();
  });

  it('keeps box n-gon face count when dragging a box face', () => {
    const tool = new ToolPrimitiveCreation(new THREE.Group());
    const mesh = tool.createBox(2, 2, 2);
    const document = ensureMeshEditDocument(mesh);
    expect(document).toBeTruthy();
    if (!document) {
      return;
    }
    expect(document.getTopology().getFaceCount()).toBe(6);
    expect(document.getTopology().getVertexCount()).toBe(8);
    const transformVertices = collectFaceTransformVertices(mesh, document, 0);
    applyComponentTranslationDelta(transformVertices, new THREE.Vector3(0.5, 0, 0));
    expect(document.getTopology().getFaceCount()).toBe(6);
    expect(document.getTopology().getVertexCount()).toBe(8);
    tool.dispose();
    mesh.geometry.dispose();
  });
});

/**
 * Builds transform vertices for every corner of a document face.
 *
 * @param mesh Content mesh.
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @returns Transform vertices with initial snapshots.
 */
function collectFaceTransformVertices(
  mesh: THREE.Mesh,
  document: import('@/mesh/document/mesh_document.js').MeshDocument,
  faceIndex: number,
): ComponentTransformMeshVertex[] {
  const topology = document.getTopology();
  const vertices: ComponentTransformMeshVertex[] = [];
  const seen = new Set<number>();
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    if (seen.has(vertexIndex)) {
      continue;
    }
    seen.add(vertexIndex);
    const vertex: ComponentTransformMeshVertex = {
      kind: 'mesh',
      targetId: mesh.uuid,
      vertexIndex,
      mesh,
      document,
      initialLocal: new THREE.Vector3(),
    };
    vertex.initialLocal.copy(readComponentTransformVertexLocal(vertex));
    vertices.push(vertex);
  }
  return vertices;
}
