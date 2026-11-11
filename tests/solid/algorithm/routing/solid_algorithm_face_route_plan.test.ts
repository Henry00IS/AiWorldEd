import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidCsgTree } from '@/solid/algorithm/compile/solid_csg_tree.js';
import { SolidAlgorithmRoutingTableCache } from '@/solid/algorithm/routing/solid_algorithm_routing_table_cache.js';
import type { SolidAlgorithmRoutingTable } from '@/solid/algorithm/routing/solid_algorithm_routing_table.js';
import { SolidAlgorithmFaceRoutePlan } from '@/solid/algorithm/routing/solid_algorithm_face_route_plan.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';

/**
 * Builds a prepared box brush.
 *
 * @param id Brush id.
 * @param size Box edge lengths.
 * @param operation CSG operation.
 * @param position Box center.
 * @returns Prepared brush.
 */
function makePrepared(
  id: string,
  size: THREE.Vector3,
  operation: SolidOperation,
  position: THREE.Vector3,
): PreparedBrush {
  const instance = new SolidBrushInstance(
    id,
    id,
    SolidBrushFactory.createCenteredBox(size.x, size.y, size.z),
    operation,
  );
  instance.position.copy(position);
  const brush = instance.getModelSpaceBrush();
  return { instance, brush, bounds: brush.computeLocalBounds(), overlappingPeerIndices: [], operation };
}

/**
 * Builds a scene: a floor slab (subject) with peers far away, fully covering,
 * and crossing the probed face region.
 *
 * @returns Prepared brushes with every peer overlapping the subject.
 */
function makeScene(): PreparedBrush[] {
  const prepared = [
    makePrepared('floor', new THREE.Vector3(10, 1, 10), SolidOperation.Additive, new THREE.Vector3(0, 0, 0)),
    makePrepared('cover', new THREE.Vector3(20, 4, 20), SolidOperation.Subtractive, new THREE.Vector3(0, 0, 0)),
    makePrepared('cross', new THREE.Vector3(2, 3, 2), SolidOperation.Subtractive, new THREE.Vector3(1, 0, 1)),
    makePrepared('far', new THREE.Vector3(1, 3, 1), SolidOperation.Additive, new THREE.Vector3(4, 0, 4)),
    makePrepared('late', new THREE.Vector3(3, 2, 3), SolidOperation.Additive, new THREE.Vector3(-1, 0, 0)),
  ];
  prepared.forEach((brush, index) => {
    brush.overlappingPeerIndices = prepared.map((_, peer) => peer).filter((peer) => peer !== index);
  });
  return prepared;
}

/**
 * Routes a point by walking the table step by step.
 *
 * @param plan Plan whose table to walk.
 * @param prepared Prepared brushes.
 * @param point Probe point.
 * @param normal Face normal.
 * @returns Routed category.
 */
function walkTable(
  plan: SolidAlgorithmFaceRoutePlan,
  prepared: PreparedBrush[],
  point: THREE.Vector3,
  normal: THREE.Vector3,
): SurfaceCategory {
  const classify = (index: number) => {
    if (index === 0) return SurfaceCategory.SelfAligned;
    const peer = prepared[index];
    return peer ? BrushMembership.classifyPoint(point, peer.brush, normal) : SurfaceCategory.Inside;
  };
  return plan.table.route(classify, (index) => index === 0 || classify(index) !== SurfaceCategory.Outside);
}

/**
 * Builds a fresh routing table for the first brush of a scene.
 *
 * @param prepared Prepared scene.
 * @returns Routing table.
 */
function buildTable(prepared: PreparedBrush[]): SolidAlgorithmRoutingTable {
  return new SolidAlgorithmRoutingTableCache().getOrBuild(
    prepared,
    0,
    SolidCsgTree.fromPreparedFlat(prepared),
    false,
    false,
  );
}

/**
 * SolidAlgorithmFaceRoutePlan routes like the table while resolving face-wide
 * peers once.
 */
describe('SolidAlgorithmFaceRoutePlan', () => {
  it('gives the same category as walking the table for every probed point of the face', () => {
    const prepared = makeScene();
    const table = buildTable(prepared);
    const bounds = new THREE.Box3(new THREE.Vector3(-3, 0.5, -3), new THREE.Vector3(3, 0.5, 3));
    const plan = new SolidAlgorithmFaceRoutePlan(table, prepared, 0, bounds);
    const normal = new THREE.Vector3(0, 1, 0);
    let classified = 0;
    for (let x = -3; x <= 3; x += 0.37) {
      for (let z = -3; z <= 3; z += 0.41) {
        const point = new THREE.Vector3(x, 0.5, z);
        const viaPlan = plan.route((index) => {
          classified++;
          const peer = prepared[index];
          return peer ? BrushMembership.classifyPoint(point, peer.brush, normal) : SurfaceCategory.Outside;
        });
        expect(viaPlan).toBe(walkTable(plan, prepared, point, normal));
      }
    }
    expect(classified).toBeGreaterThan(0);
  });

  it('only keeps its resolved categories while changed peers keep them over the bounds', () => {
    const prepared = makeScene();
    const table = buildTable(prepared);
    const bounds = new THREE.Box3(new THREE.Vector3(-1, 0.5, -1), new THREE.Vector3(0, 0.5, 0));
    const plan = new SolidAlgorithmFaceRoutePlan(table, prepared, 0, bounds);
    const nudged = prepared.slice();
    nudged[3] = makePrepared('far', new THREE.Vector3(1, 3, 1), SolidOperation.Additive, new THREE.Vector3(4.1, 0, 4));
    expect(plan.constantsStillHold(table, nudged, [3])).toBe(true);
    const shrunk = prepared.slice();
    shrunk[4] = makePrepared('late', new THREE.Vector3(1, 2, 1), SolidOperation.Additive, new THREE.Vector3(8, 0, 8));
    expect(plan.constantsStillHold(table, shrunk, [4])).toBe(false);
    expect(plan.constantsStillHold(table, prepared, [])).toBe(true);
    const otherTable = buildTable(prepared);
    expect(plan.constantsStillHold(otherTable, prepared, [])).toBe(false);
  });

  it('never classifies more peers than walking the table and skips peers whose category cannot matter', () => {
    const prepared = makeScene();
    const table = buildTable(prepared);
    const bounds = new THREE.Box3(new THREE.Vector3(-6, 0.5, -6), new THREE.Vector3(6, 0.5, 6));
    const plan = new SolidAlgorithmFaceRoutePlan(table, prepared, 0, bounds);
    const consulted = new Set<number>();
    const viaPlan = plan.route((index) => {
      consulted.add(index);
      return SurfaceCategory.Outside;
    });
    const walked = new Set<number>();
    const viaTable = table.route(
      (index) => {
        walked.add(index);
        return SurfaceCategory.Outside;
      },
      () => true,
    );
    expect(viaPlan).toBe(viaTable);
    expect(consulted.size).toBeLessThanOrEqual(walked.size);
  });
});
