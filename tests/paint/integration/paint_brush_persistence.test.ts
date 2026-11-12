import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandSolidBrushSplit } from '@/solid/commands/brush/command_solid_brush_split.js';
import { sceneTextureIds } from '@/io/scene/scene_texture_ids.js';
import { testFloorStroke } from '../paint_test_strokes.js';

/**
 * Builds a model with one painted box brush.
 *
 * @returns Model and brush.
 */
function paintedModel(): { model: SolidModel; brushId: string } {
  const model = new SolidModel('Painted');
  const brush = model.addBoxBrush(2, SolidOperation.Additive);
  brush.paint.add(testFloorStroke('left', 1, [[-0.5, 1, 0]], { color: 0x3366ff }));
  brush.paint.add(testFloorStroke('right', 2, [[0.5, 1, 0]], { mode: 'erase' }));
  return { model, brushId: brush.id };
}

describe('Paint on brushes', () => {
  it('survives saving and loading the model', () => {
    const { model, brushId } = paintedModel();
    const saved = JSON.parse(JSON.stringify(SolidModelCodec.encode(model)));
    const loaded = SolidModelCodec.decode(saved, 'Loaded');
    const brush = loaded.findBrush(brushId);
    expect(brush?.paint.ordered().map((stroke) => [stroke.id, stroke.mode, stroke.color])).toEqual([
      ['left', 'paint', 0x3366ff],
      ['right', 'erase', 0xff0000],
    ]);
    const original = model.findBrush(brushId)?.paint.get('left');
    expect(Array.from(brush?.paint.get('left')?.dabs ?? [])).toEqual(Array.from(original?.dabs ?? []));
  });

  it('names its stencil and stamp textures so saves and rooms carry them', () => {
    const { model, brushId } = paintedModel();
    const brush = model.findBrush(brushId);
    brush?.paint.add(testFloorStroke('masked', 3, [[0, 1, 0]], { stencilTextureId: 'emb:stencil', stencilScale: 2 }));
    brush?.paint.add(testFloorStroke('stamp', 4, [[0, 1, 0]], { shape: 'image', stampTextureId: 'emb:logo' }));
    const ids = sceneTextureIds(SolidModelCodec.encode(model));
    expect(ids.has('emb:stencil')).toBe(true);
    expect(ids.has('emb:logo')).toBe(true);
  });

  it('is left out of brushes without paint', () => {
    const model = new SolidModel('Plain');
    model.addBoxBrush(2, SolidOperation.Additive);
    expect('paint' in (SolidModelCodec.encode(model).brushes[0] ?? {})).toBe(false);
  });

  it('is carried by duplicates', () => {
    const { model, brushId } = paintedModel();
    const copy = model.duplicateBrush(brushId, new THREE.Vector3(4, 0, 0));
    expect(copy?.paint.size).toBe(2);
    copy?.paint.remove('left');
    expect(model.findBrush(brushId)?.paint.size).toBe(2);
  });

  it('follows the pieces of a split brush and comes back on undo', () => {
    const { model, brushId } = paintedModel();
    const split = new CommandSolidBrushSplit(model, brushId, new THREE.Plane(new THREE.Vector3(1, 0, 0), 0));
    split.execute();
    expect(split.didSplit()).toBe(true);
    const pieces = model.getBrushes();
    const strokeSets = pieces.map((piece) => piece.paint.ordered().map((stroke) => stroke.id)).sort();
    expect(strokeSets).toEqual([['left'], ['right']]);
    split.undo();
    expect(model.findBrush(brushId)?.paint.size).toBe(2);
  });
});
