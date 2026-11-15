import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidUpdateSetBuilder } from '@/solid/algorithm/compile/solid_update_set.js';
import { BrushOverlapGraph } from '@/solid/algorithm/spatial/brush_overlap_graph.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';

/**
 * Builds a solid brush instance from a box with optional transform and
 * operation.
 *
 * @param id Brush id.
 * @param size Box edge length.
 * @param operation CSG operation.
 * @param position Optional local position.
 * @returns Configured brush instance.
 */
function makeBoxBrush(
  id: string,
  size: number,
  operation: SolidOperation,
  position?: THREE.Vector3,
): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  if (position) instance.position.copy(position);
  return instance;
}

/**
 * Builds many non-overlapping additive boxes on a grid.
 *
 * @param count Number of boxes.
 * @param spacing Center-to-center spacing (must exceed size).
 * @param size Box edge length.
 * @returns Brush instances in tree order.
 */
function makeGridBrushes(count: number, spacing: number, size: number): SolidBrushInstance[] {
  const brushes: SolidBrushInstance[] = [];
  const columns = Math.ceil(Math.sqrt(count));
  for (let index = 0; index < count; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    brushes.push(
      makeBoxBrush(
        `brush-${index}`,
        size,
        SolidOperation.Additive,
        new THREE.Vector3(column * spacing, 0, row * spacing),
      ),
    );
  }
  return brushes;
}

/**
 * Sorts polygons into a stable comparison key list.
 *
 * @param polygons Compiled polygons.
 * @returns Sorted string keys for equality checks.
 */
function polygonSignature(polygons: SolidCompiledPolygon[]): string[] {
  return polygons
    .map((polygon) => {
      const center = new THREE.Vector3();
      for (const vertex of polygon.vertices) center.add(vertex);
      center.multiplyScalar(1 / polygon.vertices.length);
      return [
        polygon.brushId,
        polygon.surfaceIndex,
        polygon.category,
        center.x.toFixed(4),
        center.y.toFixed(4),
        center.z.toFixed(4),
        polygon.normal.x.toFixed(4),
        polygon.normal.y.toFixed(4),
        polygon.normal.z.toFixed(4),
        polygon.vertices.length,
      ].join('|');
    })
    .sort();
}

/** Unit tests for partial solid CSG updates and touch-set expansion. */
describe('SolidCsgCompiler partial updates', () => {
  it('recompiles only the moved brush among many non-overlapping solids', () => {
    const brushes = makeGridBrushes(64, 4, 2);
    const compiler = new SolidCsgCompiler();
    compiler.compile(brushes, { forceFull: true });
    const firstStats = compiler.getLastCompileStats();
    expect(firstStats.fullRebuild).toBe(true);
    expect(firstStats.recompiledBrushCount).toBe(64);

    brushes[0]!.position.x += 0.25;
    const partial = compiler.compile(brushes, {
      dirtyBrushIds: [brushes[0]!.id],
    });
    const partialStats = compiler.getLastCompileStats();
    expect(partialStats.fullRebuild).toBe(false);
    expect(partialStats.recompiledBrushCount).toBe(1);
    expect(partialStats.reusedBrushCount).toBe(63);

    const fullCompiler = new SolidCsgCompiler();
    const full = fullCompiler.compile(brushes, { forceFull: true });
    expect(polygonSignature(partial)).toEqual(polygonSignature(full));
  });

  it('recompiles previous and new neighbors when a brush enters contact', () => {
    const left = makeBoxBrush('left', 2, SolidOperation.Additive, new THREE.Vector3(-3, 0, 0));
    const right = makeBoxBrush('right', 2, SolidOperation.Additive, new THREE.Vector3(3, 0, 0));
    const mover = makeBoxBrush('mover', 2, SolidOperation.Additive, new THREE.Vector3(0, 0, 0));
    const brushes = [left, right, mover];
    const compiler = new SolidCsgCompiler();
    compiler.compile(brushes, { forceFull: true });
    expect(compiler.getCachedTouchPeerIds('mover')).toHaveLength(0);

    mover.position.x = 2.5;
    const partial = compiler.compile(brushes, { dirtyBrushIds: ['mover'] });
    const stats = compiler.getLastCompileStats();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeGreaterThanOrEqual(2);
    expect(compiler.getCachedTouchPeerIds('mover')).toContain('right');

    const full = new SolidCsgCompiler().compile(brushes, { forceFull: true });
    expect(polygonSignature(partial)).toEqual(polygonSignature(full));
  });

  it('matches full rebuild after subtractive carve moves between targets', () => {
    const baseA = makeBoxBrush('base-a', 4, SolidOperation.Additive, new THREE.Vector3(-3, 0, 0));
    const baseB = makeBoxBrush('base-b', 4, SolidOperation.Additive, new THREE.Vector3(3, 0, 0));
    const cutter = makeBoxBrush('cutter', 2, SolidOperation.Subtractive, new THREE.Vector3(-3, 0, 0));
    const brushes = [baseA, baseB, cutter];
    const compiler = new SolidCsgCompiler();
    compiler.compile(brushes, { forceFull: true });

    cutter.position.x = 3;
    const partial = compiler.compile(brushes, { dirtyBrushIds: ['cutter'] });
    const stats = compiler.getLastCompileStats();
    expect(stats.fullRebuild).toBe(false);
    // Fully contained AInsideB pairs do not expand the update set (surface
    // loops are only emitted for Intersection pairs).
    // The cavity is owned by the cutter brush surfaces.
    expect(stats.recompiledBrushCount).toBeGreaterThanOrEqual(1);
    expect(stats.recompiledBrushCount).toBeLessThanOrEqual(3);

    const full = new SolidCsgCompiler().compile(brushes, { forceFull: true });
    expect(polygonSignature(partial)).toEqual(polygonSignature(full));
  });

  it('matches full rebuild when moving a peer of an intersecting brush', () => {
    const far = makeBoxBrush('far', 2, SolidOperation.Additive, new THREE.Vector3(40, 0, 0));
    const a = makeBoxBrush('a', 2, SolidOperation.Additive, new THREE.Vector3(-0.5, 0, 0));
    const b = makeBoxBrush('b', 2, SolidOperation.Intersecting, new THREE.Vector3(0.5, 0, 0));
    const brushes = [far, a, b];
    const compiler = new SolidCsgCompiler();
    compiler.compile(brushes, { forceFull: true });
    expect(compiler.getCachedPolygons('far')?.length ?? 0, 'non-touching far keeps solid').toBeGreaterThan(0);
    a.position.x -= 0.1;
    const partial = compiler.compile(brushes, { dirtyBrushIds: ['a'] });
    const stats = compiler.getLastCompileStats();
    expect(stats.fullRebuild).toBe(false);
    expect(compiler.getCachedPolygons('far')?.length ?? 0).toBeGreaterThan(0);
    const full = new SolidCsgCompiler().compile(brushes, { forceFull: true });
    expect(polygonSignature(partial)).toEqual(polygonSignature(full));
  });

  it('matches full rebuild when only the intersecting brush moves', () => {
    const far = makeBoxBrush('far', 2, SolidOperation.Additive, new THREE.Vector3(40, 0, 0));
    const a = makeBoxBrush('a', 2, SolidOperation.Additive, new THREE.Vector3(-0.5, 0, 0));
    const b = makeBoxBrush('b', 2, SolidOperation.Intersecting, new THREE.Vector3(0.5, 0, 0));
    const brushes = [far, a, b];
    const compiler = new SolidCsgCompiler();
    compiler.compile(brushes, { forceFull: true });
    b.position.x += 0.15;
    const partial = compiler.compile(brushes, { dirtyBrushIds: ['b'] });
    const stats = compiler.getLastCompileStats();
    expect(stats.fullRebuild).toBe(false);
    expect(compiler.getCachedPolygons('far')?.length ?? 0, 'non-touching far keeps solid').toBeGreaterThan(0);
    const full = new SolidCsgCompiler().compile(brushes, { forceFull: true });
    expect(polygonSignature(partial)).toEqual(polygonSignature(full));
  });
});

/** Unit tests for touch-set expansion used by partial updates. */
describe('SolidUpdateSetBuilder', () => {
  it('includes Intersection and BInsideA peers but not AInsideB outer peers', () => {
    const updateSet = SolidUpdateSetBuilder.build(
      new Set(['a']),
      ['a', 'b', 'c', 'd', 'e', 'f'],
      new Map([
        [
          'a',
          [
            { peerId: 'c', type: SolidAlgorithmIntersectionType.Intersection },
            { peerId: 'e', type: SolidAlgorithmIntersectionType.AInsideB },
            { peerId: 'f', type: SolidAlgorithmIntersectionType.BInsideA },
          ],
        ],
      ]),
      new Map([
        [
          'a',
          [
            { peerId: 'b', type: SolidAlgorithmIntersectionType.Intersection },
            { peerId: 'e', type: SolidAlgorithmIntersectionType.AInsideB },
          ],
        ],
      ]),
    );
    expect(updateSet.has('a')).toBe(true);
    expect(updateSet.has('b')).toBe(true);
    expect(updateSet.has('c')).toBe(true);
    expect(updateSet.has('d')).toBe(false);
    expect(updateSet.has('e')).toBe(false);
    expect(updateSet.has('f')).toBe(true);
  });
});

/** Unit tests for grid-accelerated overlap adjacency. */
describe('BrushOverlapGraph', () => {
  it('finds the same overlaps as pairwise for a sparse grid', () => {
    const entries = [];
    const count = 40;
    const spacing = 5;
    const size = 1;
    for (let index = 0; index < count; index++) {
      const column = index % 8;
      const row = Math.floor(index / 8);
      const min = new THREE.Vector3(column * spacing - size, -size, row * spacing - size);
      const max = new THREE.Vector3(column * spacing + size, size, row * spacing + size);
      entries.push({
        bounds: new THREE.Box3(min, max),
        overlappingPeerIndices: [] as number[],
      });
    }
    entries[0]!.bounds.translate(new THREE.Vector3(spacing - 0.5, 0, 0));
    BrushOverlapGraph.build(entries, 0.01);
    expect(entries[0]!.overlappingPeerIndices).toContain(1);
    expect(entries[1]!.overlappingPeerIndices).toContain(0);
    for (let index = 2; index < count; index++) {
      expect(entries[index]!.overlappingPeerIndices).toHaveLength(0);
    }
  });
});
