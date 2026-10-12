import { describe, expect, it } from 'vitest';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { deleteTopologyWorkingEdges } from '@/edit/topology/topology_component_delete.js';
import { dissolveTopologyWorkingEdge } from '@/edit/topology/topology_edge_dissolve.js';
import { meshDocumentToWorkingGeometry } from '@/edit/topology/topology_working_from_mesh.js';
import { collectTopologyWorkingEdges } from '@/edit/topology/topology_working_edges_collect.js';
import type { TopologyWorkingFace } from '@/edit/topology/topology_working_face.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';

describe('cube edge delete and dissolve', () => {
  it('deletes an edge and the faces that use it while keeping the other faces', () => {
    const working = meshDocumentToWorkingGeometry(createMeshDocumentBox(2, 2, 2));
    const edge = collectTopologyWorkingEdges(working)[0];
    expect(edge).toBeDefined();
    if (!edge) {
      return;
    }
    const kept = working.positions[edge.vertexA]?.clone();
    expect(deleteTopologyWorkingEdges(working, [edge]).applied).toBe(true);
    expect(working.faces).toHaveLength(4);
    expect(positionIsPresent(working, kept)).toBe(true);
    expect(faceUsesEdge(working, edge.vertexA, edge.vertexB)).toBe(false);
  });

  it('dissolves an edge into a five-face wedge without duplicate corners', () => {
    const working = meshDocumentToWorkingGeometry(createMeshDocumentBox(2, 2, 2));
    const edge = collectTopologyWorkingEdges(working)[0];
    expect(edge).toBeDefined();
    if (!edge) {
      return;
    }
    const start = working.positions[edge.vertexA]?.clone();
    const end = working.positions[edge.vertexB]?.clone();
    expect(dissolveTopologyWorkingEdge(working, edge.vertexA, edge.vertexB, false).applied).toBe(true);
    expect(working.faces).toHaveLength(5);
    expect(positionIsPresent(working, start)).toBe(false);
    expect(positionIsPresent(working, end)).toBe(false);
    expect(hasCoincidentPositions(working)).toBe(false);
    expect(working.faces.some((face) => face.vertexIndices.length === 4 && faceUvArea(face) > 0.5)).toBe(true);
  });
});

/**
 * Returns whether any vertex still sits on a position.
 *
 * @param geometry Working geometry.
 * @param position Position to find.
 * @returns True when a vertex matches.
 */
function faceUsesEdge(geometry: TopologyWorkingGeometry, vertexA: number, vertexB: number): boolean {
  for (const face of geometry.faces) {
    const count = face.vertexIndices.length;
    for (let corner = 0; corner < count; corner++) {
      const start = face.vertexIndices[corner];
      const end = face.vertexIndices[(corner + 1) % count];
      if ((start === vertexA && end === vertexB) || (start === vertexB && end === vertexA)) {
        return true;
      }
    }
  }
  return false;
}

function hasCoincidentPositions(geometry: TopologyWorkingGeometry): boolean {
  for (let left = 0; left < geometry.positions.length; left++) {
    for (let right = left + 1; right < geometry.positions.length; right++) {
      const a = geometry.positions[left];
      const b = geometry.positions[right];
      if (a && b && a.distanceToSquared(b) < 1e-8) {
        return true;
      }
    }
  }
  return false;
}

function faceUvArea(face: TopologyWorkingFace): number {
  const first = face.cornerUvs[0];
  const second = face.cornerUvs[1];
  const third = face.cornerUvs[2];
  if (!first || !second || !third) {
    return 0;
  }
  return (second.u - first.u) * (third.v - first.v) - (second.v - first.v) * (third.u - first.u);
}

function positionIsPresent(
  geometry: TopologyWorkingGeometry,
  position: { x: number; y: number; z: number } | undefined,
): boolean {
  if (!position) {
    return false;
  }
  for (const vertex of geometry.positions) {
    const dx = vertex.x - position.x;
    const dy = vertex.y - position.y;
    const dz = vertex.z - position.z;
    if (dx * dx + dy * dy + dz * dz < 1e-8) {
      return true;
    }
  }
  return false;
}
