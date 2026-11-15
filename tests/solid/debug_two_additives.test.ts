import { describe, it, expect } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

describe('two overlapping additives (routing)', () => {
  it('both overlapping additives emit polygons', () => {
    const model = new SolidModel('TwoAdd');
    const base = model.addBoxBrush(4, SolidOperation.Additive, null, false);
    const mover = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    mover.position.set(1.5, 0, 0);
    mover.pushTransformToMesh();
    model.markDirty();
    model.rebuild(true);
    const poly = (id: string) =>
      (
        model as unknown as {
          pipeline: { compiler: { getCachedPolygons: (x: string) => unknown[] | undefined } };
        }
      ).pipeline.compiler.getCachedPolygons(id)?.length ?? 0;
    expect(poly(base.id), 'base').toBeGreaterThan(0);
    expect(poly(mover.id), 'mover').toBeGreaterThan(0);
  });

  it('live rebuild keeps both brush sources after nested-then-move path', () => {
    const model = new SolidModel('LiveBoth');
    const base = model.addBoxBrush(4, SolidOperation.Additive);
    const mover = model.addBoxBrush(2, SolidOperation.Additive);
    mover.position.set(1.5, 0, 0);
    mover.pushTransformToMesh();
    model.syncBrushesFromScene();
    model.rebuild(true);
    mover.mesh!.position.x = 2.2;
    model.prepareLiveBrushEdit([mover.mesh!]);
    model.rebuildLive();
    const sources = model.getResultMesh().userData['solidTriangleSources'] as Array<{ brushId: string }> | undefined;
    const brushIds = new Set((sources ?? []).map((source) => source.brushId));
    expect(brushIds.has(base.id)).toBe(true);
    expect(brushIds.has(mover.id)).toBe(true);
  });
});
