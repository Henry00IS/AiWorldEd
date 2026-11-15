import { describe, it, expect } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

describe('partial intersect add does not wipe map (peer tables)', () => {
  it('two co-located add+∩ produce polygons on forceFull', () => {
    const model = new SolidModel('TwoCo');
    const a = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    const b = model.addBoxBrush(2, SolidOperation.Intersecting, null, false);
    a.position.set(7, 0, 0);
    b.position.set(7, 0, 0);
    a.pushTransformToMesh();
    b.pushTransformToMesh();
    model.markDirty();
    model.rebuild(true);
    const count = model.getResultMesh().geometry.getAttribute('position')?.count ?? 0;
    expect(count).toBeGreaterThan(0);
  });

  it('keeps geometry for partial ∩ add after positioned create', () => {
    const model = new SolidModel('DebugWipe');
    for (let index = 0; index < 10; index++) {
      const brush = model.addBoxBrush(2, SolidOperation.Additive, null, false);
      brush.position.set(index * 3.5, 0, 0);
      brush.pushTransformToMesh();
    }
    model.markDirty();
    model.rebuild(true);
    const before = model.getResultMesh().geometry.getAttribute('position')?.count ?? 0;
    expect(before).toBeGreaterThan(0);

    const target = model.getBrushes()[2]!;
    const inter = model.addBoxBrush(2, SolidOperation.Intersecting, null, false);
    inter.position.copy(target.position);
    inter.pushTransformToMesh();
    model.syncBrushOrderFromScene();
    model.markBrushesDirty([inter.id]);
    model.rebuild(true);
    const after = model.getResultMesh().geometry.getAttribute('position')?.count ?? 0;
    expect(after).toBeGreaterThan(0);
  });

  it('keeps geometry when default addBoxBrush rebuilds ∩ at origin then moves it', () => {
    const model = new SolidModel();
    for (let index = 0; index < 10; index++) {
      const brush = model.addBoxBrush(2, SolidOperation.Additive);
      brush.mesh!.position.set(index * 3.5, 0, 0);
    }
    model.syncBrushesFromScene();
    model.rebuild(true);

    const target = model.getBrushes()[2]!;
    const inter = model.addBoxBrush(2, SolidOperation.Intersecting);
    inter.mesh!.position.copy(target.mesh!.position);
    model.syncBrushesFromScene();
    model.markBrushesDirty([inter.id]);
    model.rebuild(true);

    const count = model.getResultMesh().geometry.getAttribute('position').count;
    expect(count, 'partial dirty after origin create wiped the solid').toBeGreaterThan(0);
  });
});
