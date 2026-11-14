import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecalModelLayer } from '@/decal/layer/decal_model_layer.js';
import { decalLayerSyncReportEmpty } from '@/decal/layer/decal_layer_sync_report.js';
import { DecalProjectorSettingsStore } from '@/decal/settings/decal_projector_settings.js';
import {
  decalTestLevelCreate,
  decalTestBrushMoveLive,
  decalTestServices,
  decalTestServicesWithoutTime,
  decalTestProjector,
  decalTestParametersSet,
  type DecalTestLevel,
} from '../decal_test_fixture.js';

/**
 * Places a projector over the corner where the wall meets the floor, pointing
 * down and toward the wall so it reaches both.
 *
 * @param level Test level.
 * @returns Projector.
 */
function cornerProjector(level: DecalTestLevel): THREE.Mesh {
  const projector = decalTestProjector({ facingLimit: 89 });
  projector.position.set(level.wallFrontX, level.floorTop + 0.5, 0);
  projector.rotation.z = -Math.PI / 4;
  projector.scale.set(2, 2, 2);
  level.world.add(projector);
  level.world.updateMatrixWorld(true);
  return projector;
}

/**
 * Creates a layer for a level's model.
 *
 * @param level Test level.
 * @param services Optional services.
 * @returns Layer.
 */
function layerFor(level: DecalTestLevel, services = decalTestServices()): DecalModelLayer {
  return new DecalModelLayer(level.model.getResultMesh(), level.model.getCollisionChunkSource(), services);
}

/**
 * Returns the world-space bounds of a presentation mesh.
 *
 * @param mesh Presentation mesh.
 * @returns Bounds.
 */
function worldBounds(mesh: THREE.Mesh): THREE.Box3 {
  mesh.updateWorldMatrix(true, false);
  return new THREE.Box3().setFromObject(mesh);
}

describe('DecalModelLayer', () => {
  it('draws a projector on both surfaces of a corner it reaches', () => {
    const level = decalTestLevelCreate();
    const projector = cornerProjector(level);
    const layer = layerFor(level);
    const report = decalLayerSyncReportEmpty();
    layer.sync([projector], 50, report);
    const presentation = layer.presentationOf(projector);
    expect(report.rebuiltDecals).toBe(1);
    expect(presentation?.fragmentCount()).toBe(2);
    expect(presentation?.mesh.parent).toBe(level.model.getResultMesh());
    expect(presentation?.triangleCount()).toBeGreaterThan(0);
  });

  it('does no work when nothing changed and only recuts decals touched by a brush change', () => {
    const level = decalTestLevelCreate();
    const projector = cornerProjector(level);
    const layer = layerFor(level);
    layer.sync([projector], 50, decalLayerSyncReportEmpty());
    const idle = decalLayerSyncReportEmpty();
    layer.sync([projector], 50, idle);
    expect(idle).toEqual(decalLayerSyncReportEmpty());
    decalTestBrushMoveLive(level, level.pillar, new THREE.Vector3(0.5, 0, 0));
    const farChange = decalLayerSyncReportEmpty();
    layer.sync([projector], 50, farChange);
    expect(farChange.changedBrushes).toBeGreaterThan(0);
    expect(farChange.rebuiltDecals).toBe(0);
  });

  it('follows a brush that moves under the decal', () => {
    const level = decalTestLevelCreate();
    const projector = cornerProjector(level);
    const layer = layerFor(level);
    layer.sync([projector], 50, decalLayerSyncReportEmpty());
    const presentation = layer.presentationOf(projector);
    if (!presentation) throw new Error('expected a presentation');
    const before = worldBounds(presentation.mesh).min.x;
    decalTestBrushMoveLive(level, level.wall, new THREE.Vector3(-0.25, 0, 0));
    const report = decalLayerSyncReportEmpty();
    layer.sync([projector], 50, report);
    expect(report.rebuiltDecals).toBe(1);
    expect(worldBounds(presentation.mesh).min.x).toBeLessThan(before - 0.2);
  });

  it('lifts surface mesh decals off the floor by the surface offset', () => {
    const level = decalTestLevelCreate();
    const projector = cornerProjector(level);
    const offset = DecalProjectorSettingsStore.liftOffset(DecalProjectorSettingsStore.read(projector), 0);
    const layer = layerFor(level);
    layer.sync([projector], 50, decalLayerSyncReportEmpty());
    const presentation = layer.presentationOf(projector);
    if (!presentation) throw new Error('expected a presentation');
    expect(worldBounds(presentation.mesh).min.y).toBeGreaterThanOrEqual(level.floorTop + offset - 1e-5);
    expect(worldBounds(presentation.mesh).min.x).toBeGreaterThanOrEqual(level.wallFrontX + offset - 1e-5);
  });

  it('stacks overlapping decals by layer first and scene order second', () => {
    const level = decalTestLevelCreate();
    const lower = cornerProjector(level);
    const upper = cornerProjector(level);
    const sameLayerLater = cornerProjector(level);
    decalTestParametersSet(upper, { layer: 1 });
    const layer = layerFor(level);
    layer.sync([upper, lower, sameLayerLater], 50, decalLayerSyncReportEmpty());
    const order = (projector: THREE.Object3D) => layer.presentationOf(projector)?.mesh.renderOrder ?? Number.NaN;
    expect(order(upper)).toBeGreaterThan(order(sameLayerLater));
    expect(order(sameLayerLater)).toBeGreaterThan(order(lower));
  });

  it('always recuts one decal, defers the rest once the budget is spent, and removes decals that are gone', () => {
    const level = decalTestLevelCreate();
    const projector = cornerProjector(level);
    const second = cornerProjector(level);
    const layer = layerFor(level, decalTestServicesWithoutTime());
    const deferred = decalLayerSyncReportEmpty();
    layer.sync([projector, second], 1, deferred);
    expect(deferred.rebuiltDecals).toBe(1);
    expect(deferred.deferredDecals).toBe(1);
    const resumed = decalLayerSyncReportEmpty();
    layer.sync([projector, second], 1, resumed);
    expect(resumed.rebuiltDecals).toBe(1);
    expect(resumed.deferredDecals).toBe(0);
    const presentation = layer.presentationOf(projector);
    layer.sync([], 1, decalLayerSyncReportEmpty());
    expect(layer.presentationOf(projector)).toBeUndefined();
    expect(presentation?.mesh.parent).toBeNull();
  });
});

describe('DecalModelLayer lift', () => {
  it('lifts decals by their lift and lays them on the surface at 0', () => {
    const level = decalTestLevelCreate();
    const projector = cornerProjector(level);
    decalTestParametersSet(projector, { lift: 0.01 });
    const layer = layerFor(level);
    layer.sync([projector], 50, decalLayerSyncReportEmpty());
    const presentation = layer.presentationOf(projector);
    if (!presentation) throw new Error('expected a presentation');
    expect(worldBounds(presentation.mesh).min.y).toBeGreaterThanOrEqual(level.floorTop + 0.01 - 1e-5);
    decalTestParametersSet(projector, { lift: 0 });
    layer.sync([projector], 50, decalLayerSyncReportEmpty());
    expect(worldBounds(presentation.mesh).min.y).toBeCloseTo(level.floorTop, 5);
  });

  it('stacks overlapping decals by layer lift, ordered by layer then scene order', () => {
    const level = decalTestLevelCreate();
    const top = cornerProjector(level);
    const bottom = cornerProjector(level);
    const middle = cornerProjector(level);
    decalTestParametersSet(top, { layer: 2, lift: 0.001, layerLift: 0.003 });
    decalTestParametersSet(bottom, { layer: 0, lift: 0.001, layerLift: 0.003 });
    decalTestParametersSet(middle, { layer: 0, lift: 0.001, layerLift: 0.003 });
    const layer = layerFor(level);
    layer.sync([top, bottom, middle], 1000, decalLayerSyncReportEmpty());
    const floorOf = (projector: THREE.Object3D) =>
      worldBounds(layer.presentationOf(projector)!.mesh).min.y - level.floorTop;
    expect(floorOf(bottom)).toBeCloseTo(0.001, 4);
    expect(floorOf(middle)).toBeCloseTo(0.004, 4);
    expect(floorOf(top)).toBeCloseTo(0.007, 4);
    decalTestParametersSet(bottom, { layer: 5 });
    layer.sync([top, bottom, middle], 1000, decalLayerSyncReportEmpty());
    expect(floorOf(bottom)).toBeCloseTo(0.007, 4);
    expect(floorOf(middle)).toBeCloseTo(0.001, 4);
  });
});
