import { describe, it, expect } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidCsgTree } from '@/solid/algorithm/compile/solid_csg_tree.js';
import { SolidAlgorithmRoutingTableCache } from '@/solid/algorithm/routing/solid_algorithm_routing_table_cache.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { CommandSolidBrushesDelete } from '@/solid/commands/brushes/command_solid_brushes_delete.js';

/**
 * Builds a prepared brush at a local position.
 *
 * @param id Brush id.
 * @param size Box size.
 * @param operation CSG operation.
 * @param x Local X position.
 * @returns Prepared brush.
 */
function makePrepared(id: string, size: number, operation: SolidOperation, x: number): PreparedBrush {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  instance.position.set(x, 0, 0);
  const modelBrush = instance.getModelSpaceBrush();
  return {
    instance,
    brush: modelBrush,
    bounds: modelBrush.computeLocalBounds(),
    overlappingPeerIndices: [],
    operation,
  };
}

/**
 * Counts result mesh vertices for a solid model.
 *
 * @param model Solid model.
 * @returns Position attribute count.
 */
function resultVertexCount(model: SolidModel): number {
  return model.getResultMesh().geometry.getAttribute('position')?.count ?? 0;
}

/**
 * Routing-table cache must not reuse tables after prepared indices shift
 * (delete/insert), and deleting a brush must not wipe unrelated solid
 * geometry.
 */
describe('Solid routing table cache regression', () => {
  it('reuses a table for the same tree and rebuilds it for a changed tree structure', () => {
    const cache = new SolidAlgorithmRoutingTableCache();
    const prepared = [
      makePrepared('a', 2, SolidOperation.Additive, 0),
      makePrepared('b', 2, SolidOperation.Additive, 1),
    ];
    prepared[0]!.overlappingPeerIndices = [1];
    prepared[1]!.overlappingPeerIndices = [0];
    const branch = (operation: SolidOperation): SolidCsgTree =>
      new SolidCsgTree([
        { kind: 'brush', preparedIndex: 0, operation: SolidOperation.Additive },
        {
          kind: 'branch',
          operation,
          children: [{ kind: 'brush', preparedIndex: 1, operation: SolidOperation.Additive }],
        },
      ]);
    const tree = branch(SolidOperation.Additive);
    const first = cache.getOrBuild(prepared, 0, tree, false);
    expect(cache.getOrBuild(prepared, 0, tree, false)).toBe(first);
    expect(cache.getOrBuild(prepared, 0, branch(SolidOperation.Additive), false)).toBe(first);
    expect(cache.getOrBuild(prepared, 0, branch(SolidOperation.Subtractive), false)).not.toBe(first);
  });

  it('does not reuse a table when subject prepared index shifts but peer index stays', () => {
    const cache = new SolidAlgorithmRoutingTableCache();
    // Indices: 0 filler, 1 peer, 2 middle, 3 subject
    const preparedBefore = [
      makePrepared('filler', 1, SolidOperation.Additive, -10),
      makePrepared('peer', 2, SolidOperation.Additive, 0),
      makePrepared('middle', 1, SolidOperation.Additive, 5),
      makePrepared('subject', 2, SolidOperation.Additive, 0.5),
    ];
    preparedBefore[3]!.overlappingPeerIndices = [1];
    preparedBefore[1]!.overlappingPeerIndices = [3];
    const treeBefore = SolidCsgTree.fromPreparedFlat(preparedBefore);
    const tableBefore = cache.getOrBuild(preparedBefore, 3, treeBefore, false, false);
    // Delete middle (index 2): peer stays at 1, subject moves from 3 → 2
    const preparedAfter = [
      preparedBefore[0]!,
      preparedBefore[1]!,
      preparedBefore[3]!, // subject now at index 2
    ];
    preparedAfter[2]!.overlappingPeerIndices = [1];
    preparedAfter[1]!.overlappingPeerIndices = [2];
    const treeAfter = SolidCsgTree.fromPreparedFlat(preparedAfter);
    const tableAfter = cache.getOrBuild(preparedAfter, 2, treeAfter, false, false);
    // Must rebuild: no step may still reference deleted prepared index 3
    expect(tableAfter.steps.some((step) => step.preparedIndex === 3)).toBe(false);
    // SelfAligned on subject must keep surface (additive, peer outside classify)
    const category = tableAfter.route((preparedIndex) => {
      if (preparedIndex === 2) return SurfaceCategory.SelfAligned;
      return SurfaceCategory.Outside;
    });
    expect(category).toBe(SurfaceCategory.SelfAligned);
    expect(tableBefore).not.toBe(tableAfter);
  });

  it('keeps unrelated additive brushes after deleting a middle brush in a chain', () => {
    const model = new SolidModel('DeleteChain');
    const brushes: ReturnType<SolidModel['addBoxBrush']>[] = [];
    for (let index = 0; index < 8; index++) {
      const brush = model.addBoxBrush(1.5, SolidOperation.Additive);
      brush.position.set(index * 2.5, 0, 0);
      brush.pushTransformToMesh();
      brushes.push(brush);
    }
    // Overlapping pair in the middle so CSG has peers
    brushes[3]!.position.set(3 * 2.5 - 0.4, 0, 0);
    brushes[3]!.pushTransformToMesh();
    brushes[4]!.position.set(4 * 2.5, 0, 0);
    brushes[4]!.pushTransformToMesh();
    model.rebuild(true);
    const beforeVerts = brushes.map((brush) => {
      const polys = model['pipeline']['compiler'].getCachedPolygons(brush.id);
      return polys?.length ?? 0;
    });
    expect(beforeVerts.every((count) => count > 0)).toBe(true);
    const beforeTotal = resultVertexCount(model);
    expect(beforeTotal).toBeGreaterThan(0);
    const remove = brushes[2]!;
    const command = new CommandSolidBrushesDelete([remove.mesh!]);
    command.execute();
    expect(model.getBrushCount()).toBe(7);
    for (const brush of brushes) {
      if (brush.id === remove.id) continue;
      const polys = model['pipeline']['compiler'].getCachedPolygons(brush.id);
      expect(polys?.length ?? 0, `brush ${brush.name} lost polygons after delete`).toBeGreaterThan(0);
    }
    expect(resultVertexCount(model)).toBeGreaterThan(0);
    // Moving a survivor must keep geometry
    const survivor = brushes[5]!;
    survivor.position.x += 0.25;
    survivor.pushTransformToMesh();
    model.markBrushesDirty([survivor.id]);
    model.rebuild(true);
    const survivorPolys = model['pipeline']['compiler'].getCachedPolygons(survivor.id);
    expect(survivorPolys?.length ?? 0).toBeGreaterThan(0);
    expect(resultVertexCount(model)).toBeGreaterThan(0);
  });

  it('refills additive volume when a subtractive peer is deleted', () => {
    const model = new SolidModel('DeleteSub');
    const outer = model.addBoxBrush(4, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Subtractive);
    model.rebuild(true);
    const withHole = resultVertexCount(model);
    const command = new CommandSolidBrushesDelete([cutter.mesh!]);
    command.execute();
    expect(model.findBrush(outer.id)).toBeDefined();
    const outerPolys = model['pipeline']['compiler'].getCachedPolygons(outer.id);
    expect(outerPolys?.length ?? 0).toBeGreaterThan(0);
    const after = resultVertexCount(model);
    expect(after).toBeGreaterThan(0);
    // Closed box typically has fewer verts than a holed solid
    expect(after).not.toBe(withHole);
  });
});
