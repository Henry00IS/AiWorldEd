import { describe, expect, it } from 'vitest';
import { DecalSceneSync } from '@/decal/scene/decal_scene_sync.js';
import { decalTestLevelCreate, decalTestProjector, decalTestServices } from '../decal_test_fixture.js';

describe('DecalSceneSync', () => {
  it('finds visible projectors in a world and draws them on its solid model', () => {
    const level = decalTestLevelCreate();
    const shown = decalTestProjector();
    shown.position.set(1, 0, 1);
    const hidden = decalTestProjector();
    hidden.visible = false;
    level.world.add(shown, hidden);
    expect(DecalSceneSync.projectorsCollect(level.world)).toEqual([shown]);
    const sync = new DecalSceneSync(decalTestServices());
    const report = sync.sync(level.world);
    expect(report.rebuiltDecals).toBe(1);
    expect(sync.layerOf(level.model)?.presentationOf(shown)?.triangleCount()).toBeGreaterThan(0);
  });

  it('removes a model layer when the model leaves the world', () => {
    const level = decalTestLevelCreate();
    level.world.add(decalTestProjector());
    const sync = new DecalSceneSync(decalTestServices());
    sync.sync(level.world);
    expect(sync.layerOf(level.model)).toBeDefined();
    level.world.remove(level.model.root);
    sync.sync(level.world);
    expect(sync.layerOf(level.model)).toBeUndefined();
  });
});
