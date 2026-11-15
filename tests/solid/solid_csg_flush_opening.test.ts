import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidAlgorithmBrushIntersection } from '@/solid/algorithm/routing/solid_algorithm_brush_intersection.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';

/**
 * Builds a box brush instance.
 *
 * @param id Brush id.
 * @param size Edge length.
 * @param operation CSG operation.
 * @param position Optional position.
 * @returns Brush instance.
 */
function makeBox(id: string, size: number, operation: SolidOperation, position?: THREE.Vector3): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  if (position) {
    instance.position.copy(position);
  }
  return instance;
}

/**
 * Prepares instances for intersection classification.
 *
 * @param instances Brush instances.
 * @returns Prepared list with empty peer lists.
 */
function prepare(instances: SolidBrushInstance[]): PreparedBrush[] {
  return instances.map((instance) => {
    const brush = instance.getModelSpaceBrush();
    return {
      instance,
      brush,
      bounds: brush.computeLocalBounds(),
      overlappingPeerIndices: [] as number[],
      operation: instance.operation,
    };
  });
}

/**
 * Flush and fully-internal openings must classify and mesh as touching convex
 * polytopes (on-plane contact is Intersection, not BInsideA).
 */
describe('Solid CSG flush openings', () => {
  it('classifies fully internal subtractive as BInsideA', () => {
    const outer = makeBox('outer', 4, SolidOperation.Additive);
    const cutter = makeBox('cutter', 2, SolidOperation.Subtractive);
    const prepared = prepare([outer, cutter]);
    const type = SolidAlgorithmBrushIntersection.classify(
      prepared[0]!,
      1,
      prepared,
      SOLID_FAT_PLANE_EPSILON * 2,
      SOLID_FAT_PLANE_EPSILON,
    );
    expect(type).toBe(SolidAlgorithmIntersectionType.BInsideA);
  });

  it('classifies flush subtractive as Intersection not BInsideA', () => {
    const outer = makeBox('outer', 4, SolidOperation.Additive);
    // Size 2 box centered at x=1: extends [0, 2], flush with outer face at x=2
    const cutter = makeBox('cutter', 2, SolidOperation.Subtractive, new THREE.Vector3(1, 0, 0));
    const prepared = prepare([outer, cutter]);
    const type = SolidAlgorithmBrushIntersection.classify(
      prepared[0]!,
      1,
      prepared,
      SOLID_FAT_PLANE_EPSILON * 2,
      SOLID_FAT_PLANE_EPSILON,
    );
    expect(type).toBe(SolidAlgorithmIntersectionType.Intersection);
  });

  it('cuts an opening when subtractive is flush with the outer face', () => {
    const outer = makeBox('outer', 4, SolidOperation.Additive);
    const cutter = makeBox('cutter', 2, SolidOperation.Subtractive, new THREE.Vector3(1, 0, 0));
    const compiler = new SolidCsgCompiler();
    const polygons = compiler.compile([outer, cutter], { forceFull: true });
    const outerPolys = polygons.filter((polygon) => polygon.brushId === outer.id);
    const cutterPolys = polygons.filter((polygon) => polygon.brushId === cutter.id);
    expect(outerPolys.length).toBeGreaterThan(6);
    expect(cutterPolys.length).toBeGreaterThan(0);
    // The +X outer face must be fragmented (opening), not a single full quad
    const plusX = outerPolys.filter((polygon) => polygon.normal.x > 0.9);
    expect(plusX.length).toBeGreaterThan(1);
  });

  it('keeps a sealed outer shell for a fully internal room', () => {
    const outer = makeBox('outer', 4, SolidOperation.Additive);
    const cutter = makeBox('cutter', 2, SolidOperation.Subtractive);
    const compiler = new SolidCsgCompiler();
    const polygons = compiler.compile([outer, cutter], { forceFull: true });
    const outerPolys = polygons.filter((polygon) => polygon.brushId === outer.id);
    const cutterPolys = polygons.filter((polygon) => polygon.brushId === cutter.id);
    expect(outerPolys.length).toBe(6);
    expect(cutterPolys.length).toBe(6);
  });
});
