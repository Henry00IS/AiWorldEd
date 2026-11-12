import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrush } from '@/solid/brush/solid_brush.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { PaintAtlas } from '@/paint/bake/paint_atlas.js';
import { PaintDecalProvider } from '@/paint/decal/paint_decal_provider.js';
import { PaintSceneSystem } from '@/paint/scene/paint_scene_system.js';
import { PAINT_IMAGE_SOURCE_NONE } from '@/paint/raster/paint_image.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { testFloorStroke } from '../paint_test_strokes.js';

/**
 * Builds a 20 × 10 grid of 1 m blocks (tops at y = 0.5); every fourth block is
 * painted and a decal covers the first row.
 *
 * @returns Parts.
 */
function grid(): {
  root: THREE.Group;
  model: SolidModel;
  brushes: SolidBrushInstance[];
  decal: THREE.Mesh;
  system: PaintSceneSystem;
} {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const model = new SolidModel('Grid');
  root.add(model.root);
  const brushes: SolidBrushInstance[] = [];
  for (let index = 0; index < 200; index++) {
    const brush = model.addBoxBrush(1, SolidOperation.Additive, null, false);
    brush.mesh?.position.set((index % 20) * 1.5, 0, Math.floor(index / 20) * 1.5);
    brush.mesh?.updateMatrixWorld(true);
    brushes.push(brush);
  }
  model.rebuild(true);
  brushes.forEach((brush, index) => {
    const [x, , z] = [(index % 20) * 1.5, 0, Math.floor(index / 20) * 1.5];
    if (index % 4 === 0) brush.paint.add(testFloorStroke(`s${index}`, index + 1, [[x, 0.5, z]], { radius: 0.3 }));
  });
  const decal = modifierVolumeTemplateCreate('decal');
  decal.position.set(14, 0.5, 0);
  decal.scale.set(30, 1, 1);
  root.add(decal);
  root.updateMatrixWorld(true);
  const system = new PaintSceneSystem(scene, () => root, PAINT_IMAGE_SOURCE_NONE);
  system.setLayerProvider(new PaintDecalProvider(() => root, PAINT_IMAGE_SOURCE_NONE));
  system.update();
  system.update();
  return { root, model, brushes, decal, system };
}

/**
 * Counts per-brush paint work.
 *
 * @returns Reader of the counts since the call.
 */
function watchWork(): () => { layers: number; faces: number; bakes: number } {
  const layers = vi.spyOn(PaintDecalProvider.prototype, 'layersFor');
  const faces = vi.spyOn(SolidBrush.prototype, 'getFaceVertices');
  const bakes = vi.spyOn(PaintAtlas.prototype, 'bakeBrush');
  return () => ({
    layers: layers.mock.calls.length,
    faces: faces.mock.calls.length,
    bakes: bakes.mock.calls.length,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Paint frame cost', () => {
  it('does no per-brush work on frames where nothing changed', () => {
    const { system } = grid();
    const work = watchWork();
    for (let frame = 0; frame < 120; frame++) system.update();
    expect(work()).toEqual({ layers: 0, faces: 0, bakes: 0 });
  });

  it('only revisits the brush that was painted', () => {
    const { brushes, system } = grid();
    const work = watchWork();
    brushes[1]!.paint.add(testFloorStroke('new', 999, [[1.5, 0.5, 0]], { radius: 0.3 }));
    system.update();
    system.update();
    const counts = work();
    expect(counts.bakes).toBe(1);
    expect(counts.layers).toBeLessThanOrEqual(1);
  });

  it('rebakes after a decal moves and then goes idle again', () => {
    const { decal, system } = grid();
    const work = watchWork();
    decal.position.z = 1.5;
    decal.updateMatrixWorld(true);
    system.update();
    expect(work().bakes).toBeGreaterThan(0);
    const after = work();
    for (let frame = 0; frame < 60; frame++) system.update();
    expect(work()).toEqual(after);
  });

  it('keeps a growing stroke over existing tiles to the painted brush', () => {
    const { model, brushes, system } = grid();
    const points: [number, number, number][] = [[0, 0.5, 0]];
    system.previewSet(model, brushes[0]!, [testFloorStroke('live', 2000, points, { radius: 0.3 })]);
    system.update();
    const tiles = system.atlas.tileCount;
    const brushScans = vi.spyOn(SolidModel.prototype, 'getBrushes');
    const overlayScans = vi.spyOn(PaintAtlas.prototype, 'hasBrush');
    const bakes = vi.spyOn(PaintAtlas.prototype, 'bakeBrush');
    const frames = 30;
    for (let frame = 0; frame < frames; frame++) {
      points.push([0.01 * (frame % 3), 0.5, 0]);
      system.previewSet(model, brushes[0]!, [testFloorStroke('live', 2000, points, { radius: 0.3 })]);
      system.update();
    }
    expect(system.atlas.tileCount).toBe(tiles);
    expect(bakes.mock.calls.length).toBe(frames);
    // One walk of the brush list per frame (finding what changed), none per painted brush or overlay.
    expect(brushScans.mock.calls.length).toBeLessThanOrEqual(frames);
    expect(overlayScans.mock.calls.length).toBe(0);
  });

  it('backs off retrying a brush whose stamp image never arrives', () => {
    const { brushes, system } = grid();
    brushes[2]!.paint.add(
      testFloorStroke('stamp', 1000, [[3, 0.5, 0]], { radius: 0.3, shape: 'image', stampTextureId: 'missing' }),
    );
    system.update();
    const bakes = vi.spyOn(PaintAtlas.prototype, 'bakeBrush').mockName('bakes');
    for (let frame = 0; frame < 1800; frame++) system.update();
    // Retrying every 30 frames would rebake it 60 times in these 30 s at 60 Hz.
    expect(bakes.mock.calls.length).toBeLessThanOrEqual(6);
  });
});
