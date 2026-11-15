import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { SolidUpdateSetBuilder } from '@/solid/algorithm/compile/solid_update_set.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import { SolidAlgorithmBrushIntersection } from '@/solid/algorithm/routing/solid_algorithm_brush_intersection.js';
import { SOLID_BOUNDS_EPSILON, SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidBrushPreparer } from '@/solid/algorithm/compile/solid_brush_preparer.js';
import { SolidCompileCache } from '@/solid/algorithm/compile/solid_compile_cache.js';
import { SolidCompilePlanner } from '@/solid/algorithm/compile/solid_compile_planner.js';
import { BrushSpatialIndex } from '@/solid/algorithm/spatial/brush_spatial_index.js';

/**
 * Builds a box brush instance.
 *
 * @param id Brush id.
 * @param size Edge length.
 * @param op CSG operation.
 * @param pos Position.
 * @returns Brush instance.
 */
function makeBox(id: string, size: number, op: SolidOperation, pos: THREE.Vector3): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, op);
  instance.position.copy(pos);
  return instance;
}

/**
 * Classifies pair type for two prepared brushes.
 *
 * @param subject Subject instance.
 * @param other Other instance.
 * @returns Intersection type from subject.
 */
function classifyPair(subject: SolidBrushInstance, other: SolidBrushInstance): SolidAlgorithmIntersectionType {
  const cache = new SolidCompileCache();
  const preparer = new SolidBrushPreparer(cache);
  const planner = new SolidCompilePlanner(cache, SOLID_BOUNDS_EPSILON);
  const prepared = preparer.prepareBrushes([subject, other], { forceFull: true });
  const spatial = new BrushSpatialIndex();
  spatial.rebuild(prepared, SOLID_BOUNDS_EPSILON);
  planner.buildOverlapGraph(prepared, { forceFull: true }, false, new Set(), spatial);
  return SolidAlgorithmBrushIntersection.classify(
    prepared[0]!,
    1,
    prepared,
    SOLID_BOUNDS_EPSILON,
    SOLID_FAT_PLANE_EPSILON,
  );
}

/**
 * Subtractive last into earlier additive — brush invalidation and routing table
 * AInsideB/BInsideA/Intersection surface update rules.
 */
describe('subtractive last into earlier additive', () => {
  it('recompiles BInsideA chair when subtractive table fully contains it', () => {
    const chair = makeBox('chair', 1, SolidOperation.Additive, new THREE.Vector3(0, 0, 0));
    const table = makeBox('table', 4, SolidOperation.Subtractive, new THREE.Vector3(0, 0, 0));
    expect(classifyPair(table, chair)).toBe(SolidAlgorithmIntersectionType.BInsideA);

    const compiler = new SolidCsgCompiler();
    compiler.compile([chair, table], { forceFull: true });
    table.position.x += 0.01;
    const partial = compiler.compile([chair, table], { dirtyBrushIds: ['table'] });
    expect(compiler.getLastUpdateBrushIds().sort()).toEqual(['chair', 'table'].sort());
    // Solid is empty: chair fully removed, subtractive has no outer solid to bound cavity.
    expect(partial.filter((p) => p.brushId === 'chair').length).toBe(0);
  });

  it('does not expand AInsideB outer peers (table inside room cut)', () => {
    const updateSet = SolidUpdateSetBuilder.build(
      new Set(['table']),
      ['room', 'table', 'leg'],
      new Map([
        [
          'table',
          [
            { peerId: 'room', type: SolidAlgorithmIntersectionType.AInsideB },
            { peerId: 'leg', type: SolidAlgorithmIntersectionType.Intersection },
          ],
        ],
      ]),
      new Map([
        [
          'table',
          [
            { peerId: 'room', type: SolidAlgorithmIntersectionType.AInsideB },
            { peerId: 'leg', type: SolidAlgorithmIntersectionType.Intersection },
          ],
        ],
      ]),
    );
    expect(updateSet.has('table')).toBe(true);
    expect(updateSet.has('leg')).toBe(true);
    expect(updateSet.has('room')).toBe(false);
  });

  it('expands BInsideA peers (chair inside subtractive table)', () => {
    const updateSet = SolidUpdateSetBuilder.build(
      new Set(['table']),
      ['chair', 'table'],
      new Map([['table', [{ peerId: 'chair', type: SolidAlgorithmIntersectionType.BInsideA }]]]),
      new Map([['table', [{ peerId: 'chair', type: SolidAlgorithmIntersectionType.BInsideA }]]]),
    );
    expect(updateSet.has('table')).toBe(true);
    expect(updateSet.has('chair')).toBe(true);
  });

  it('Intersection-overlap subtractive recompiles both and matches full rebuild', () => {
    // Offset so volumes straddle (Intersection), not pure containment.
    const base = makeBox('base', 4, SolidOperation.Additive, new THREE.Vector3(0, 0, 0));
    const cutter = makeBox('cutter', 2, SolidOperation.Subtractive, new THREE.Vector3(2.5, 0, 0));
    expect(classifyPair(cutter, base)).toBe(SolidAlgorithmIntersectionType.Intersection);

    const compiler = new SolidCsgCompiler();
    compiler.compile([base, cutter], { forceFull: true });
    cutter.position.x += 0.15;
    const partial = compiler.compile([base, cutter], { dirtyBrushIds: ['cutter'] });
    const full = new SolidCsgCompiler().compile([base, cutter], { forceFull: true });
    expect(compiler.getLastUpdateBrushIds().sort()).toEqual(['base', 'cutter'].sort());
    expect(partial.length).toBe(full.length);
    expect(partial.some((p) => p.brushId === 'cutter' && p.category === SurfaceCategory.SelfReverseAligned)).toBe(true);
  });

  it('contained subtractive (AInsideB) only recompiles cutter; cavity still matches full', () => {
    const base = makeBox('base', 4, SolidOperation.Additive, new THREE.Vector3(0, 0, 0));
    const cutter = makeBox('cutter', 1, SolidOperation.Subtractive, new THREE.Vector3(0, 0, 0));
    expect(classifyPair(cutter, base)).toBe(SolidAlgorithmIntersectionType.AInsideB);

    const compiler = new SolidCsgCompiler();
    compiler.compile([base, cutter], { forceFull: true });
    cutter.position.x += 0.1;
    const partial = compiler.compile([base, cutter], { dirtyBrushIds: ['cutter'] });
    expect(compiler.getLastUpdateBrushIds()).toEqual(['cutter']);
    const full = new SolidCsgCompiler().compile([base, cutter], { forceFull: true });
    expect(partial.length).toBe(full.length);
    expect(partial.filter((p) => p.brushId === 'cutter').length).toBe(6);
    expect(partial.filter((p) => p.brushId === 'base').length).toBe(6);
  });
});
