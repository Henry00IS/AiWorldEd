import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecalModelLayer } from '@/decal/layer/decal_model_layer.js';
import { decalLayerSyncReportEmpty } from '@/decal/layer/decal_layer_sync_report.js';
import { SolidMeshChunkCache } from '@/solid/mesh/solid_mesh_chunk_cache.js';
import {
  decalTestBox,
  decalTestLevelCreate,
  decalTestLevelRebuild,
  decalTestProjector,
  decalTestServices,
  type DecalTestLevel,
} from '../decal_test_fixture.js';

/**
 * Places a projector pointing down at the floor near the wall.
 *
 * @param level Test level.
 * @returns Projector.
 */
function floorProjector(level: DecalTestLevel): THREE.Mesh {
  const projector = decalTestProjector({ facingLimit: 89 });
  projector.position.set(0, 0.5, 0);
  projector.scale.set(3, 3, 3);
  level.world.add(projector);
  level.world.updateMatrixWorld(true);
  return projector;
}

/**
 * Syncs a layer until no decal waits.
 *
 * @param layer Layer.
 * @param projector Projector.
 * @returns Changed brush count of the first pass.
 */
function settle(layer: DecalModelLayer, projector: THREE.Object3D): number {
  const report = decalLayerSyncReportEmpty();
  layer.sync([projector], 1e9, report);
  return report.changedBrushes;
}

/**
 * Returns the drawn positions of a projector's decal.
 *
 * @param layer Layer.
 * @param projector Projector.
 * @returns Positions.
 */
function drawn(layer: DecalModelLayer, projector: THREE.Object3D): number[] {
  const array = layer.presentationOf(projector)?.mesh.geometry.getAttribute('position')?.array;
  return array ? Array.from(array) : [];
}

describe('DecalModelLayer chunk changes', () => {
  it('reads only changed brushes and matches a fresh layer when brushes come and go', () => {
    const level = decalTestLevelCreate();
    const projector = floorProjector(level);
    const layer = new DecalModelLayer(
      level.model.getResultMesh(),
      level.model.getCollisionChunkSource(),
      decalTestServices(),
    );
    settle(layer, projector);
    const fragments = layer.presentationOf(projector)!.fragmentCount();
    const block = decalTestBox(level.model, new THREE.Vector3(0.5, 0.25, 0.5), new THREE.Vector3(0.5, 0.5, 0.5));
    decalTestLevelRebuild(level.world, level.model);
    expect(settle(layer, projector)).toBeGreaterThan(0);
    expect(layer.presentationOf(projector)!.fragmentCount()).toBeGreaterThan(fragments);
    const fresh = new DecalModelLayer(
      level.model.getResultMesh(),
      level.model.getCollisionChunkSource(),
      decalTestServices(),
    );
    settle(fresh, projector);
    expect(drawn(layer, projector)).toEqual(drawn(fresh, projector));
    level.model.removeBrush(block.id);
    decalTestLevelRebuild(level.world, level.model);
    settle(layer, projector);
    expect(layer.presentationOf(projector)!.fragmentCount()).toBe(fragments);
    const after = new DecalModelLayer(
      level.model.getResultMesh(),
      level.model.getCollisionChunkSource(),
      decalTestServices(),
    );
    settle(after, projector);
    expect(drawn(layer, projector)).toEqual(drawn(after, projector));
    fresh.dispose();
    after.dispose();
  });

  it('reports no changed brushes when nothing recompiled', () => {
    const source = decalTestLevelCreate().model.getCollisionChunkSource();
    const first = source.collisionChunkChangesSince!(-1);
    expect(first.brushIds).toBeNull();
    expect(source.collisionChunkChangesSince!(first.cursor).brushIds).toEqual([]);
  });
});

describe('SolidMeshChunkCache change log', () => {
  it('lists stores and drops since a cursor and asks for a full scan once the log is cut', () => {
    const cache = new SolidMeshChunkCache();
    const start = cache.changeCursor();
    cache.set('a', {} as never);
    cache.remove('missing');
    cache.remove('a');
    expect(cache.changesSince(start)).toEqual(['a', 'a']);
    const cursor = cache.changeCursor();
    for (let index = 0; index <= SolidMeshChunkCache.changeLogLimit; index++) cache.changeNote(`b${index}`);
    expect(cache.changesSince(cursor)).toBeNull();
    const late = cache.changeCursor();
    cache.clear();
    expect(cache.changesSince(late)).toBeNull();
    expect(cache.changesSince(cache.changeCursor())).toEqual([]);
  });
});
