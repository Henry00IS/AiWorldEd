import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { isSolidBrushMarkedNonConvex } from '@/edit/transform/brush_edit_convexity.js';
import { applyWorkingGeometryToTarget } from '@/edit/topology/topology_apply_working.js';
import { applyTopologyLoopCut } from '@/edit/topology/topology_loop_cut.js';
import { brushToWorkingGeometry } from '@/edit/topology/topology_working_from_brush.js';
import type { TopologyBrushTarget } from '@/edit/topology/topology_target.js';
import { findWorkingEdgeParallelToY } from './topology_test_edges.js';

/** Unit tests for committing brush edits that solid compilation must skip. */
describe('applyWorkingGeometryToTarget', () => {
  it('commits a coplanar loop cut and marks the brush so compilation skips it', () => {
    const model = new SolidModel('LoopCutBrush');
    const instance = model.addBoxBrush(2, SolidOperation.Additive);
    const beforeCount = instance.brush.vertices.length;
    const target = createBrushTarget(model, instance.id);
    const working = brushToWorkingGeometry(instance.brush);
    const edge = findWorkingEdgeParallelToY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    expect(applyTopologyLoopCut(working, edge.vertexA, edge.vertexB, 0.5).applied).toBe(true);
    const written = applyWorkingGeometryToTarget(target, working, null);
    expect(written.applied).toBe(true);
    expect(instance.brush.vertices.length).toBe(beforeCount + 4);
    expect(instance.mesh).toBeTruthy();
    if (!instance.mesh) {
      return;
    }
    expect(isSolidBrushMarkedNonConvex(instance.mesh)).toBe(true);
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
