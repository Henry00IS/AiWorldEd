import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { SolidBrushPreparer } from '@/solid/algorithm/compile/solid_brush_preparer.js';
import { SolidCompileCache } from '@/solid/algorithm/compile/solid_compile_cache.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';

/**
 * Builds a box brush instance.
 *
 * @param id Brush id.
 * @param size Edge length.
 * @param operation CSG operation.
 * @param position Local position.
 * @returns Brush instance.
 */
function makeBox(id: string, size: number, operation: SolidOperation, position: THREE.Vector3): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  instance.position.copy(position);
  return instance;
}

/**
 * Counts compiled polygons whose centroid lies strictly inside a brush volume.
 *
 * @param polys Polygons to test.
 * @param volumeBrush Prepared brush used as the volume.
 * @returns Count of polygons classified Inside.
 */
function countCentroidsInside(
  polys: { vertices: THREE.Vector3[]; normal: THREE.Vector3 }[],
  volumeBrush: { planes: { signedDistance: (p: THREE.Vector3) => number }[] },
): number {
  let inside = 0;
  for (const poly of polys) {
    const centroid = BrushMembership.polygonCentroid(poly.vertices);
    if (BrushMembership.classifyPoint(centroid, volumeBrush as never, poly.normal) === SurfaceCategory.Inside) {
      inside++;
    }
  }
  return inside;
}

/**
 * Partial updates after tree-order remapping. Moving a brush To Last must rebin
 * the prepared-index spatial grid so newly overlapping peers enter the update
 * set and receive surface recompilation.
 */
describe('SolidCsgCompiler reorder partial peers', () => {
  it('To Last remaps spatial peers so a moved subtractive cuts an earlier additive', () => {
    const farA = makeBox('far-a', 1, SolidOperation.Additive, new THREE.Vector3(-20, 0, 0));
    const farB = makeBox('far-b', 1, SolidOperation.Additive, new THREE.Vector3(-16, 0, 0));
    const chair = makeBox('chair', 2, SolidOperation.Additive, new THREE.Vector3(0, 0, 0));
    const table = makeBox('table', 1, SolidOperation.Additive, new THREE.Vector3(10, 0, 0));
    let brushes = [farA, farB, table, chair];

    const compiler = new SolidCsgCompiler();
    compiler.compile(brushes, { forceFull: true });

    table.operation = SolidOperation.Subtractive;
    table.position.set(0.75, 0, 0);
    table.pushTransformToMesh();
    table.pullTransformFromMesh();
    brushes = [farA, farB, chair, table];
    compiler.clearRoutingTables();

    compiler.compile(brushes, { dirtyBrushIds: [table.id] });
    const updateIds = new Set(compiler.getLastUpdateBrushIds());
    expect(updateIds.has(table.id)).toBe(true);
    expect(updateIds.has(chair.id)).toBe(true);

    const chairPolys = compiler.getCachedPolygons(chair.id) ?? [];
    const full = new SolidCsgCompiler().compile(brushes, { forceFull: true });
    const fullChair = full.filter((polygon) => polygon.brushId === chair.id);
    expect(chairPolys.length).toBe(fullChair.length);

    const prepared = new SolidBrushPreparer(new SolidCompileCache()).prepareBrushes(brushes, {
      forceFull: true,
    });
    const tableBrush = prepared.find((entry) => entry.instance.id === table.id)!.brush;
    expect(countCentroidsInside(chairPolys, tableBrush)).toBe(0);
    expect(countCentroidsInside(fullChair, tableBrush)).toBe(0);
  });

  it('move without reorder still expands newly overlapping peers', () => {
    const chair = makeBox('chair', 2, SolidOperation.Additive, new THREE.Vector3(0, 0, 0));
    const table = makeBox('table', 1, SolidOperation.Subtractive, new THREE.Vector3(10, 0, 0));
    const brushes = [chair, table];
    const compiler = new SolidCsgCompiler();
    compiler.compile(brushes, { forceFull: true });

    table.position.set(0.75, 0, 0);
    table.pushTransformToMesh();
    table.pullTransformFromMesh();
    compiler.compile(brushes, { dirtyBrushIds: [table.id] });

    expect(compiler.getLastUpdateBrushIds().sort()).toEqual(['chair', 'table'].sort());
  });
});
