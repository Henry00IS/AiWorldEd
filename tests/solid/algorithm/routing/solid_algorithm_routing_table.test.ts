import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { CategoryRouter } from '@/solid/algorithm/category/category_router.js';
import { SolidCsgTree } from '@/solid/algorithm/compile/solid_csg_tree.js';
import { SolidAlgorithmRoutingTableBuilder } from '@/solid/algorithm/routing/solid_algorithm_routing_table_builder.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidFragmentRouter } from '@/solid/algorithm/compile/solid_fragment_router.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';

/**
 * Builds a prepared box brush for routing-table tests.
 *
 * @param id Brush id.
 * @param size Box edge length.
 * @param operation CSG operation.
 * @param position Optional position.
 * @returns Prepared brush entry.
 */
function makePrepared(id: string, size: number, operation: SolidOperation, position?: THREE.Vector3): PreparedBrush {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  if (position) {
    instance.position.copy(position);
  }
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
 * Sequential CategoryRouter fold matching pre-table semantics for flat trees.
 *
 * @param prepared Prepared brushes in order.
 * @param subjectIndex Subject index.
 * @param classifications Relative category per prepared index.
 * @param invertedWorld Inverted world flag.
 * @returns Final category.
 */
function sequentialRoute(
  prepared: PreparedBrush[],
  subjectIndex: number,
  classifications: SurfaceCategory[],
  invertedWorld: boolean,
): SurfaceCategory {
  let category = invertedWorld ? SurfaceCategory.Inside : SurfaceCategory.Outside;
  for (let index = 0; index < prepared.length; index++) {
    const entry = prepared[index]!;
    const relative =
      index === subjectIndex ? SurfaceCategory.SelfAligned : (classifications[index] ?? SurfaceCategory.Outside);
    category = CategoryRouter.route(category, relative, entry.operation);
  }
  return category;
}

/** Exact routing tables match sequential CategoryRouter folds on flat trees. */
describe('SolidAlgorithmRoutingTable', () => {
  it('matches sequential routing for additive then overlapping subtractive', () => {
    const prepared = [
      makePrepared('a', 4, SolidOperation.Additive),
      makePrepared('b', 2, SolidOperation.Subtractive, new THREE.Vector3(1.5, 0, 0)),
    ];
    prepared[0]!.overlappingPeerIndices = [1];
    prepared[1]!.overlappingPeerIndices = [0];
    const tree = SolidCsgTree.fromPreparedFlat(prepared);
    const table = SolidAlgorithmRoutingTableBuilder.buildForSubject(prepared, 0, [1], tree, false, false);
    const classifications = [SurfaceCategory.SelfAligned, SurfaceCategory.Inside];
    const fromTable = table.route((index) =>
      index === 0 ? SurfaceCategory.SelfAligned : (classifications[index] ?? SurfaceCategory.Outside),
    );
    const fromSequential = sequentialRoute(prepared, 0, classifications, false);
    expect(fromTable).toBe(fromSequential);
    expect(fromTable).toBe(SurfaceCategory.Outside);
  });

  it('keeps subject self-aligned surface when peer is outside', () => {
    const prepared = [
      makePrepared('a', 4, SolidOperation.Additive),
      makePrepared('b', 2, SolidOperation.Subtractive, new THREE.Vector3(10, 0, 0)),
    ];
    prepared[0]!.overlappingPeerIndices = [];
    const tree = SolidCsgTree.fromPreparedFlat(prepared);
    const table = SolidAlgorithmRoutingTableBuilder.buildForSubject(prepared, 0, [], tree, false, false);
    const result = table.route((index) => (index === 0 ? SurfaceCategory.SelfAligned : SurfaceCategory.Outside));
    expect(result).toBe(SurfaceCategory.SelfAligned);
  });

  it('compacts multi-brush chains without exploding row counts', () => {
    const prepared: PreparedBrush[] = [];
    for (let index = 0; index < 12; index++) {
      prepared.push(
        makePrepared(
          `b${index}`,
          2,
          index % 3 === 1 ? SolidOperation.Subtractive : SolidOperation.Additive,
          new THREE.Vector3(index * 0.1, 0, 0),
        ),
      );
    }
    for (let index = 0; index < prepared.length; index++) {
      const peers: number[] = [];
      for (let peer = 0; peer < prepared.length; peer++) {
        if (peer !== index) {
          peers.push(peer);
        }
      }
      prepared[index]!.overlappingPeerIndices = peers;
    }
    const tree = SolidCsgTree.fromPreparedFlat(prepared);
    const table = SolidAlgorithmRoutingTableBuilder.buildForSubject(
      prepared,
      0,
      prepared[0]!.overlappingPeerIndices,
      tree,
      false,
      false,
    );
    expect(table.steps.length).toBeGreaterThan(0);
    expect(table.totalRowCount()).toBeLessThanOrEqual(prepared.length * 36);
  });

  it('fragment router table path matches sequential CategoryRouter', () => {
    const prepared = [
      makePrepared('outer', 4, SolidOperation.Additive),
      makePrepared('cutter', 2, SolidOperation.Subtractive),
    ];
    prepared[0]!.overlappingPeerIndices = [1];
    prepared[1]!.overlappingPeerIndices = [0];
    const tree = SolidCsgTree.fromPreparedFlat(prepared);
    const router = new SolidFragmentRouter();
    router.setCsgTree(tree);
    router.setInvertedWorld(false);
    router.setHasIntersectingOperations(false);
    const face = prepared[0]!.brush.getFaceVertices(prepared[0]!.brush.faces[0]!);
    const normal = prepared[0]!.brush.planes[0]!.normal.clone();
    const category = router.routeFragmentCategory(face, normal, prepared, 0);
    const centroid = new THREE.Vector3();
    BrushMembership.polygonCentroidInto(face, centroid);
    const classifications = prepared.map((entry, index) =>
      index === 0 ? SurfaceCategory.SelfAligned : BrushMembership.classifyPoint(centroid, entry.brush, normal),
    );
    const expected = sequentialRoute(prepared, 0, classifications, false);
    expect(category).toBe(expected);
  });

  it('excludes non-touching peers from the subject table', () => {
    const prepared = [
      makePrepared('a', 4, SolidOperation.Additive),
      makePrepared('far', 2, SolidOperation.Additive, new THREE.Vector3(50, 0, 0)),
      makePrepared('near', 2, SolidOperation.Subtractive, new THREE.Vector3(1.5, 0, 0)),
    ];
    prepared[0]!.overlappingPeerIndices = [2];
    prepared[2]!.overlappingPeerIndices = [0];
    const tree = SolidCsgTree.fromPreparedFlat(prepared);
    const table = SolidAlgorithmRoutingTableBuilder.buildForSubject(prepared, 0, [2], tree, false, false);
    const preparedIndices = table.steps.map((step) => step.preparedIndex);
    expect(preparedIndices).not.toContain(1);
    const kept = table.route((index) => (index === 0 ? SurfaceCategory.SelfAligned : SurfaceCategory.Outside));
    expect(kept).toBe(SurfaceCategory.SelfAligned);
    const carved = table.route((index) => (index === 0 ? SurfaceCategory.SelfAligned : SurfaceCategory.Inside));
    expect(carved).toBe(SurfaceCategory.Outside);
  });

  it('keeps both partial-overlap additives in a subtractive subject table', () => {
    const prepared = [
      makePrepared('a0', 2, SolidOperation.Additive, new THREE.Vector3(0, 0, 0)),
      makePrepared('a1', 2, SolidOperation.Additive, new THREE.Vector3(2, 0, 0)),
      makePrepared('cut', 1.2, SolidOperation.Subtractive, new THREE.Vector3(1, 0, 0)),
    ];
    prepared[0]!.overlappingPeerIndices = [1, 2];
    prepared[1]!.overlappingPeerIndices = [0, 2];
    prepared[2]!.overlappingPeerIndices = [0, 1];
    const tree = SolidCsgTree.fromPreparedFlat(prepared);
    const table = SolidAlgorithmRoutingTableBuilder.buildForSubject(prepared, 2, [0, 1], tree, false, false);
    const preparedIndices = table.steps.map((step) => step.preparedIndex);
    expect(preparedIndices).toContain(0);
    expect(preparedIndices).toContain(1);
  });

  it('routes a subtractive through a distant first additive then a near peer', () => {
    const prepared = [
      makePrepared('far', 2, SolidOperation.Additive, new THREE.Vector3(50, 0, 0)),
      makePrepared('near', 2, SolidOperation.Additive, new THREE.Vector3(0, 0, 0)),
      makePrepared('cut', 1.2, SolidOperation.Subtractive, new THREE.Vector3(0.5, 0, 0)),
    ];
    prepared[1]!.overlappingPeerIndices = [2];
    prepared[2]!.overlappingPeerIndices = [1];
    const tree = SolidCsgTree.fromPreparedFlat(prepared);
    const table = SolidAlgorithmRoutingTableBuilder.buildForSubject(prepared, 2, [1], tree, false, false);
    const preparedIndices = table.steps.map((step) => step.preparedIndex);
    expect(preparedIndices).toContain(1);
    expect(preparedIndices).not.toContain(0);
    const cavity = table.route((index) => (index === 1 ? SurfaceCategory.Inside : SurfaceCategory.SelfAligned));
    expect(cavity).toBe(SurfaceCategory.SelfReverseAligned);
  });
});
