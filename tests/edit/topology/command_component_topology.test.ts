import { describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { Mesh } from 'three';
import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';
import { commitTopologyWorkingMutation } from '@/edit/topology/topology_commit.js';
import { splitTopologyWorkingEdge } from '@/edit/topology/topology_edge_split.js';
import { topologyOperatorApplied, topologyOperatorRefused } from '@/edit/topology/topology_operator_result.js';
import type { TopologyBrushTarget, TopologyMeshTarget } from '@/edit/topology/topology_target.js';
import { findWorkingEdgeParallelToY } from './topology_test_edges.js';

describe('command_component_topology', () => {
  it('splits a brush edge, rebuilds CSG, and undoes vertex count', () => {
    const model = new SolidModel('TopologyBrush');
    const instance = model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const beforeCount = instance.brush.vertices.length;
    const stack = new CommandStack(16);
    const target = createBrushTarget(model, instance.id);
    const result = commitTopologyWorkingMutation(target, stack, splitFirstYEdge);
    expect(result.applied).toBe(true);
    expect(instance.brush.vertices.length).toBe(beforeCount + 1);
    expect(SolidBrushValidator.validate(instance.brush).valid).toBe(true);
    expect(model.getResultMesh().geometry.getAttribute('position')).toBeTruthy();
    stack.undo();
    const restored = model.findBrush(instance.id);
    expect(restored?.brush.vertices.length).toBe(beforeCount);
  });

  it('splits a mesh edge and restores the document on undo', () => {
    const document = createMeshDocumentBox(2, 2, 2);
    const mesh = new Mesh();
    writeMeshDocumentDisplayGeometry(mesh, document);
    const target: TopologyMeshTarget = {
      kind: 'mesh',
      targetId: mesh.uuid,
      mesh,
      document,
    };
    const beforeCount = document.getTopology().getVertexCount();
    const stack = new CommandStack(16);
    const result = commitTopologyWorkingMutation(target, stack, splitFirstYEdge);
    expect(result.applied).toBe(true);
    expect(target.document.getTopology().getVertexCount()).toBe(beforeCount + 1);
    stack.undo();
    expect(target.mesh.userData['meshEditDocument'].getTopology().getVertexCount()).toBe(beforeCount);
  });
});

/**
 * Builds a brush topology target from a live instance id.
 *
 * @param model Solid model.
 * @param brushId Brush id.
 * @returns Target.
 */
function createBrushTarget(model: SolidModel, brushId: string): TopologyBrushTarget {
  const instance = model.findBrush(brushId);
  if (!instance) {
    throw new Error('missing brush');
  }
  return {
    kind: 'brush',
    targetId: instance.id,
    solidModel: model,
    brushId: instance.id,
    brush: instance.brush,
    mesh: instance.mesh,
  };
}

/**
 * Splits the first Y-parallel working edge at its midpoint.
 *
 * @param geometry Working geometry.
 * @returns Operator result.
 */
function splitFirstYEdge(
  geometry: import('@/edit/topology/topology_working_geometry.js').TopologyWorkingGeometry,
): import('@/edit/topology/topology_operator_result.js').TopologyOperatorResult {
  const edge = findWorkingEdgeParallelToY(geometry);
  if (!edge) {
    return topologyOperatorRefused('no y edge');
  }
  const split = splitTopologyWorkingEdge(geometry, edge.vertexA, edge.vertexB, 0.5);
  if (!split) {
    return topologyOperatorRefused('split failed');
  }
  return topologyOperatorApplied();
}
