import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { CommandSolidBrushSplit } from '@/solid/commands/brush/command_solid_brush_split.js';
import { CommandSolidBrushClip } from '@/solid/commands/brush/command_solid_brush_clip.js';

/** Regression coverage for clip display names and persistent brush identities. */
describe('clip brush identity', () => {
  it('allocates duplicate-style split names and ids through undo and redo', () => {
    const model = new SolidModel('Split names');
    const source = model.addBoxBrush(2);
    model.renameBrush(source.id, 'Pillar');
    const duplicate = model.duplicateBrush(source.id);
    expect(duplicate).not.toBeNull();
    const command = new CommandSolidBrushSplit(model, source.id, new THREE.Plane(new THREE.Vector3(1, 0, 0), 0));
    command.execute();
    expect(command.didSplit()).toBe(true);
    const pieces = model.getBrushes().filter((brush) => brush !== duplicate);
    expect(pieces).toHaveLength(2);
    for (const piece of pieces) {
      expect(piece.name).toMatch(/^Pillar\.[0-9A-F]{3,5}$/);
      expect(piece.id).toMatch(new RegExp(`^${model.root.uuid}-brush-`));
      expect(piece.mesh?.name).toBe(piece.name);
      const remote = SolidModelCodec.brushDecode(JSON.parse(JSON.stringify(SolidModelCodec.brushEncode(piece))));
      expect(remote.id).toBe(piece.id);
      expect(remote.name).toBe(piece.name);
      if (piece.mesh) expect(SolidBrushVisual.getBrushId(piece.mesh)).toBe(piece.id);
    }
    expect(duplicate?.name).toMatch(/^Pillar\.[0-9A-F]{3,5}$/);
    expect(new Set(model.getBrushes().map((brush) => brush.id)).size).toBe(3);
    expect(new Set(model.getBrushes().map((brush) => brush.name)).size).toBe(3);
    command.undo();
    expect(model.findBrush(source.id)?.name).toBe('Pillar');
    expect(model.getBrushes()).toHaveLength(2);
    command.execute();
    expect(command.didSplit()).toBe(true);
    expect(model.getBrushes()).toHaveLength(3);
    expect(model.getBrushes().every((brush) => /^Pillar\.[0-9A-F]{3,5}$/.test(brush.name))).toBe(true);
  });

  it.each([true, false])('keeps source name and id for single-side clip (%s)', (keepFront) => {
    const model = new SolidModel('Single clip names');
    const source = model.addBoxBrush(2);
    model.renameBrush(source.id, 'Custom pillar');
    const command = new CommandSolidBrushClip(
      model,
      source.id,
      new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
      keepFront,
    );
    for (let pass = 0; pass < 2; pass++) {
      command.execute();
      expect(command.didClip()).toBe(true);
      expect(model.getBrushes()).toHaveLength(1);
      expect(model.findBrush(source.id)?.name).toBe('Custom pillar');
      expect(model.findBrush(source.id)?.mesh?.name).toBe('Custom pillar');
      command.undo();
      expect(model.findBrush(source.id)?.name).toBe('Custom pillar');
    }
  });
});
