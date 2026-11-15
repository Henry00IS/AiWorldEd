import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds a box brush instance.
 *
 * @param id Brush id.
 * @param size Edge length.
 * @param operation CSG operation.
 * @param position Optional position.
 * @returns Configured instance.
 */
function makeBox(id: string, size: number, operation: SolidOperation, position?: THREE.Vector3): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  if (position) {
    instance.position.copy(position);
  }
  return instance;
}

describe('inverted subtractive + intersecting (infinite brush + routing tables)', () => {
  it('keeps room while inter is apart; hull-sized inter clips without total wipe', () => {
    const model = new SolidModel('InvSubInter');
    model.setInvertedWorld(true);
    const sub = model.addBoxBrush(4, SolidOperation.Subtractive, null, false);
    sub.position.set(0, 0, 0);
    sub.pushTransformToMesh();
    const inter = model.addBoxBrush(2, SolidOperation.Intersecting, null, false);
    inter.position.set(20, 0, 0);
    inter.pushTransformToMesh();
    model.markDirty();
    model.rebuild(true);

    const polys = (id: string): number =>
      (
        model as unknown as {
          pipeline: { compiler: { getCachedPolygons: (brushId: string) => unknown[] | undefined } };
        }
      ).pipeline.compiler.getCachedPolygons(id)?.length ?? 0;

    expect(polys(sub.id), 'room must exist while apart').toBeGreaterThan(0);
    expect(polys(inter.id), 'inter solid must exist while apart').toBeGreaterThan(0);

    inter.position.set(0, 0, 0);
    inter.scale.set(6, 6, 6);
    inter.pushTransformToMesh();
    model.markBrushesDirty([inter.id]);
    model.rebuild(true);

    expect(polys(sub.id), 'room walls remain inside large hull ∩').toBeGreaterThan(0);
    expect(model.getResultMesh().geometry.getAttribute('position')?.count ?? 0).toBeGreaterThan(0);
  });

  it('clips intersecting brush against prior solid under inverted world', () => {
    const sub = makeBox('sub', 4, SolidOperation.Subtractive, new THREE.Vector3(0, 0, 0));
    const inter = makeBox('inter', 8, SolidOperation.Intersecting, new THREE.Vector3(0, 0, 0));
    const compiler = new SolidCsgCompiler();
    const polygons = compiler.compile([sub, inter], { forceFull: true, invertedWorld: true });
    expect(compiler.getCachedPolygons('sub')?.length ?? 0).toBeGreaterThan(0);
    expect(polygons.length).toBeGreaterThan(0);
  });

  it('keeps far non-touching additives empty under inverted world after distant ∩', () => {
    const a = makeBox('a', 2, SolidOperation.Additive, new THREE.Vector3(-10, 0, 0));
    const b = makeBox('b', 2, SolidOperation.Intersecting, new THREE.Vector3(0, 0, 0));
    const c = makeBox('c', 2, SolidOperation.Additive, new THREE.Vector3(10, 0, 0));
    const compiler = new SolidCsgCompiler();
    compiler.compile([a, b, c], { forceFull: true, invertedWorld: true });
    expect(compiler.getCachedPolygons('b')?.length ?? 0).toBeGreaterThan(0);
    expect(compiler.getCachedPolygons('c')?.length ?? 0).toBe(0);
  });
});
