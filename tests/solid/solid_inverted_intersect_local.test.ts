import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidModel } from '@/solid/model/solid_model.js';

/**
 * Builds a box brush at a position.
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

describe('Inverted world + intersecting locality (peer tables)', () => {
  it('keeps non-touching later additives empty under inverted world after distant ∩', () => {
    const brushes = [
      makeBox('a', 2, SolidOperation.Additive, new THREE.Vector3(-10, 0, 0)),
      makeBox('b', 2, SolidOperation.Additive, new THREE.Vector3(0, 0, 0)),
      makeBox('c', 2, SolidOperation.Additive, new THREE.Vector3(10, 0, 0)),
    ];
    const compiler = new SolidCsgCompiler();
    compiler.compile(brushes, { forceFull: true, invertedWorld: true });
    brushes[1]!.operation = SolidOperation.Intersecting;
    compiler.compile(brushes, { forceFull: true, invertedWorld: true });
    expect(compiler.getCachedPolygons('b')?.length ?? 0).toBeGreaterThan(0);
    expect(compiler.getCachedPolygons('c')?.length ?? 0).toBe(0);
    brushes[2]!.position.x += 0.5;
    compiler.compile(brushes, { dirtyBrushIds: ['c'], invertedWorld: true });
    expect(compiler.getCachedPolygons('c')?.length ?? 0).toBe(0);
  });

  it('partial dirty of new ∩ overlapping an additive keeps shared volume', () => {
    const model = new SolidModel('PartialIntersect');
    for (let index = 0; index < 10; index++) {
      const brush = model.addBoxBrush(2, SolidOperation.Additive, null, false);
      brush.position.set(index * 3.5, 0, 0);
      brush.pushTransformToMesh();
    }
    model.markDirty();
    model.rebuild(true);
    expect(model.getResultMesh().geometry.getAttribute('position').count).toBeGreaterThan(0);

    const target = model.getBrushes()[2]!;
    const inter = model.addBoxBrush(2, SolidOperation.Intersecting, null, false);
    inter.position.copy(target.position);
    inter.pushTransformToMesh();
    model.syncBrushOrderFromScene();
    model.markBrushesDirty([inter.id]);
    model.rebuild(true);
    expect(model.getResultMesh().geometry.getAttribute('position').count).toBeGreaterThan(0);
  });
});
