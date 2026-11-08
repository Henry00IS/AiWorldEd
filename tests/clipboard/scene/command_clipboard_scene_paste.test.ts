import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { clipboardSceneCopy } from '@/clipboard/scene/clipboard_scene_data.js';
import { CommandClipboardScenePaste } from '@/clipboard/scene/command_clipboard_scene_paste.js';

/**
 * Builds a world holding one solid model with two box brushes.
 *
 * @returns World and model.
 */
function buildWorld(): { world: THREE.Group; model: SolidModel } {
  const world = new THREE.Group();
  const model = new SolidModel('Solid');
  model.addBoxBrush(4, SolidOperation.Additive);
  model.addBoxBrush(2, SolidOperation.Subtractive);
  world.add(model.root);
  return { world, model };
}

describe('CommandClipboardScenePaste', () => {
  it('pastes a copied brush into its model with a fresh id and undoes it', () => {
    const { world, model } = buildWorld();
    const source = model.getBrushes()[0];
    const mesh = source?.mesh;
    if (!source || !mesh) throw new Error('brush mesh missing');
    mesh.position.set(1, 2, 3);
    const { data, skipped } = clipboardSceneCopy([mesh]);
    expect(skipped).toBe(0);
    expect(data.brushes).toHaveLength(1);
    const command = new CommandClipboardScenePaste(world, JSON.parse(JSON.stringify(data)));
    command.execute();
    expect(model.getBrushCount()).toBe(3);
    const pasted = command.pasted();
    expect(pasted).toHaveLength(1);
    const pastedMesh = pasted[0];
    expect(pastedMesh).not.toBe(mesh);
    expect(pastedMesh?.position.toArray()).toEqual([1, 2, 3]);
    const ids = new Set(model.getBrushes().map((brush) => brush.id));
    expect(ids.size).toBe(3);
    command.undo();
    expect(model.getBrushCount()).toBe(2);
  });

  it('pastes a whole solid model as a new model with fresh ids', () => {
    const { world, model } = buildWorld();
    const { data } = clipboardSceneCopy([model.root]);
    const command = new CommandClipboardScenePaste(world, JSON.parse(JSON.stringify(data)));
    command.execute();
    expect(world.children).toHaveLength(2);
    const root = command.pasted()[0];
    if (!root) throw new Error('nothing pasted');
    expect(root.uuid).not.toBe(model.root.uuid);
    const copy = SolidModel.fromObject(root);
    expect(copy).not.toBe(model);
    expect(copy?.getBrushCount()).toBe(2);
    command.undo();
    expect(world.children).toEqual([model.root]);
  });

  it('pastes plain meshes and skips brushes whose model is gone', () => {
    const { world, model } = buildWorld();
    const plain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    plain.name = 'Crate';
    world.add(plain);
    const brush = model.getBrushes()[0]?.mesh;
    if (!brush) throw new Error('brush mesh missing');
    const { data } = clipboardSceneCopy([plain, brush]);
    world.remove(model.root);
    const command = new CommandClipboardScenePaste(world, data);
    command.execute();
    expect(command.missing()).toBe(1);
    const pasted = command.pasted();
    expect(pasted.map((object) => object.name)).toEqual(['Crate']);
    expect(pasted[0]?.uuid).not.toBe(plain.uuid);
  });
});
