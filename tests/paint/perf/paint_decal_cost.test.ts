import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { PaintAtlas } from '@/paint/bake/paint_atlas.js';
import { PaintDecalProvider } from '@/paint/decal/paint_decal_provider.js';
import { PaintSceneSystem } from '@/paint/scene/paint_scene_system.js';
import { PaintTileRaster } from '@/paint/raster/paint_tile_raster.js';
import { PAINT_IMAGE_SOURCE_NONE } from '@/paint/raster/paint_image.js';
import { paintBrushKey } from '@/paint/scene/paint_brush_key.js';
import { testFloorStroke } from '../paint_test_strokes.js';

/** Slab top height. */
const SLAB_TOP = -1;

/**
 * Builds 200 small blocks, a 30 × 15 m slab (top at y = -1) painted all over, a
 * 1 m decal lying on the slab and a decal floating far above everything.
 *
 * @returns Parts.
 */
function level(): {
  world: THREE.Group;
  scene: THREE.Scene;
  model: SolidModel;
  slab: SolidBrushInstance;
  touching: THREE.Mesh;
  floating: THREE.Mesh;
  system: PaintSceneSystem;
} {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const model = new SolidModel('Level');
  world.add(model.root);
  for (let index = 0; index < 200; index++) {
    const brush = model.addBoxBrush(1, SolidOperation.Additive, null, false);
    brush.mesh?.position.set((index % 20) * 1.5, 3, Math.floor(index / 20) * 1.5);
    brush.mesh?.updateMatrixWorld(true);
  }
  const slab = new SolidBrushInstance(
    'slab',
    'Slab',
    SolidBrushFactory.createBox(new THREE.Vector3(-1, SLAB_TOP - 0.2, -1), new THREE.Vector3(29, SLAB_TOP, 14)),
    SolidOperation.Additive,
  );
  model.addBrushInstance(slab);
  model.rebuild(true);
  // Paint covering the whole slab top, so a full rebake of the slab touches every tile.
  const cover: [number, number, number][] = [];
  for (let x = -0.8; x <= 28.8; x += 0.6) for (let z = -0.8; z <= 13.8; z += 0.6) cover.push([x, SLAB_TOP, z]);
  slab.paint.add(testFloorStroke('cover', 1, cover, { radius: 0.5, opacity: 0.5 }));
  const touching = modifierVolumeTemplateCreate('decal');
  touching.position.set(5, SLAB_TOP, 5);
  world.add(touching);
  const floating = modifierVolumeTemplateCreate('decal');
  floating.position.set(10, 60, 10);
  floating.scale.set(4, 1, 4);
  world.add(floating);
  world.updateMatrixWorld(true);
  const system = new PaintSceneSystem(scene, () => world, PAINT_IMAGE_SOURCE_NONE);
  system.setLayerProvider(new PaintDecalProvider(() => world, PAINT_IMAGE_SOURCE_NONE));
  system.update();
  system.update();
  return { world, scene, model, slab, touching, floating, system };
}

/**
 * Counts paint work.
 *
 * @returns Reader of the counts since the call.
 */
function watchWork(): () => { tiles: number; layers: number; faces: number; bakes: number } {
  const tiles = vi.spyOn(PaintTileRaster.prototype, 'prepare');
  const layers = vi.spyOn(PaintDecalProvider.prototype, 'layersFor');
  const faces = vi.spyOn(SolidBrush.prototype, 'getFaceVertices');
  const bakes = vi.spyOn(PaintAtlas.prototype, 'bakeBrush');
  return () => ({
    tiles: tiles.mock.calls.length,
    layers: layers.mock.calls.length,
    faces: faces.mock.calls.length,
    bakes: bakes.mock.calls.length,
  });
}

/**
 * Samples the slab's top on a grid.
 *
 * @param system Paint system.
 * @param model Model.
 * @param slab Slab.
 * @returns Shown blend factors per point, or null where nothing is baked.
 */
function slabSamples(system: PaintSceneSystem, model: SolidModel, slab: SolidBrushInstance): (number[] | null)[] {
  const top = slab.brush.planes.findIndex((plane) => plane.normal.y > 0.9);
  const out = new Float32Array(6);
  const samples: (number[] | null)[] = [];
  for (let x = 0; x <= 12; x += 0.25) {
    for (let z = 0; z <= 10; z += 0.25) {
      const hit = system.atlas.sampleAffine(paintBrushKey(model, slab), top, new THREE.Vector3(x, SLAB_TOP, z), out);
      samples.push(hit ? [...out].map((value) => Math.round(value * 255)) : null);
    }
  }
  return samples;
}

/**
 * Bakes the current world from scratch.
 *
 * @param scene Scene.
 * @param world World.
 * @returns Fresh system.
 */
function freshSystem(scene: THREE.Scene, world: THREE.Group): PaintSceneSystem {
  const fresh = new PaintSceneSystem(scene, () => world, PAINT_IMAGE_SOURCE_NONE);
  fresh.setLayerProvider(new PaintDecalProvider(() => world, PAINT_IMAGE_SOURCE_NONE));
  fresh.update();
  return fresh;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// Each case bakes a painted 30 × 15 m slab twice (setup and a fresh comparison).
describe('Decal frame cost', { timeout: 30_000 }, () => {
  it('costs nothing per brush while a decal that touches nothing moves', () => {
    const { world, floating, system } = level();
    floating.position.x += 0.1;
    world.updateMatrixWorld(true);
    system.update();
    const work = watchWork();
    for (let frame = 0; frame < 30; frame++) {
      floating.position.x += 0.1;
      floating.updateMatrixWorld(true);
      system.update();
    }
    expect(work()).toEqual({ tiles: 0, layers: 0, faces: 0, bakes: 0 });
  });

  it('only rebakes the tiles under a decal moving across a large slab', () => {
    const { scene, world, model, slab, touching, system } = level();
    const work = watchWork();
    const frames = 10;
    for (let frame = 0; frame < frames; frame++) {
      touching.position.x += 0.1;
      touching.updateMatrixWorld(true);
      system.update();
    }
    const counts = work();
    // A 1 m box spans at most 4 × 4 tiles (gutters included); old and new box per frame.
    expect(counts.tiles).toBeLessThanOrEqual(frames * 2 * 16);
    expect(counts.layers).toBeLessThanOrEqual(frames);
    vi.restoreAllMocks();
    const fresh = freshSystem(scene, world);
    expect(slabSamples(system, model, slab)).toEqual(slabSamples(fresh, model, slab));
    fresh.dispose();
  });

  it('only rebakes the tiles under a decal when the slab below it moves', () => {
    const { scene, world, model, slab, system } = level();
    const work = watchWork();
    const frames = 6;
    for (let frame = 0; frame < frames; frame++) {
      slab.mesh?.position.set(0.1 * (frame + 1), 0, 0);
      slab.pullTransformFromMesh();
      model.markBrushesDirty([slab.id]);
      model.rebuild(true);
      system.update();
    }
    const counts = work();
    expect(counts.tiles).toBeLessThanOrEqual(frames * 2 * 16);
    vi.restoreAllMocks();
    const fresh = freshSystem(scene, world);
    expect(slabSamples(system, model, slab)).toEqual(slabSamples(fresh, model, slab));
    fresh.dispose();
  });

  it('leaves exactly a fresh bake after a touching decal moves to the slab corner and is deleted', () => {
    const { scene, world, model, slab, touching, system } = level();
    touching.position.set(28.5, SLAB_TOP, 13.5);
    touching.updateMatrixWorld(true);
    system.update();
    world.remove(touching);
    system.update();
    const fresh = freshSystem(scene, world);
    expect(slabSamples(system, model, slab)).toEqual(slabSamples(fresh, model, slab));
    expect(system.atlas.tileCount).toBe(fresh.atlas.tileCount);
    fresh.dispose();
  });
});
