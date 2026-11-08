import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { clipboardSceneCopy } from '@/clipboard/scene/clipboard_scene_data.js';
import { CommandClipboardScenePaste } from '@/clipboard/scene/command_clipboard_scene_paste.js';
import { clipboardScenePasteTargetResolve } from '@/clipboard/scene/clipboard_scene_paste_target.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';

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

  it('pastes plain meshes to the world and a brush whose model is gone into a new model', () => {
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
    const created = command.createdModel();
    if (!created) throw new Error('no model created');
    expect(created.root.parent).toBe(world);
    expect(created.getBrushCount()).toBe(1);
    const pasted = command.pasted();
    expect(pasted.map((object) => object.parent)).toEqual([world, created.root]);
    expect(pasted[0]?.uuid).not.toBe(plain.uuid);
    command.undo();
    expect(world.children).toEqual([plain]);
  });

  it('pastes a generator into the target model right after the anchor, like Duplicate', () => {
    const { world, model } = buildWorld();
    const source = modifierGeneratorNodeCreate('column');
    source.position.set(1, 2, 3);
    model.root.add(source);
    const anchor = model.getBrushes()[0]?.mesh;
    if (!anchor) throw new Error('brush mesh missing');
    const { data } = clipboardSceneCopy([source]);
    const target = clipboardScenePasteTargetResolve(world, anchor, null);
    expect(target).toEqual({ model, parent: model.root, after: anchor });
    const command = new CommandClipboardScenePaste(world, JSON.parse(JSON.stringify(data)), target);
    command.execute();
    const [pasted] = command.pasted();
    if (!pasted) throw new Error('nothing pasted');
    expect(ModifierVolume.isGenerator(pasted)).toBe(true);
    expect(pasted.parent).toBe(model.root);
    expect(model.root.children.indexOf(pasted)).toBe(model.root.children.indexOf(anchor) + 1);
    expect(pasted.position.toArray()).toEqual([1, 2, 3]);
    expect(command.createdModel()).toBeNull();
    command.undo();
    expect(pasted.parent).toBeNull();
  });

  it('pastes brushes and generators into a new model when none is around, undone and redone as one', () => {
    const { world, model } = buildWorld();
    const generator = modifierGeneratorNodeCreate('column');
    model.root.add(generator);
    const brush = model.getBrushes()[0]?.mesh;
    if (!brush) throw new Error('brush mesh missing');
    const { data } = clipboardSceneCopy([brush, generator]);
    world.remove(model.root);
    const target = clipboardScenePasteTargetResolve(world, null, null);
    const command = new CommandClipboardScenePaste(world, JSON.parse(JSON.stringify(data)), target);
    command.execute();
    const created = command.createdModel();
    if (!created) throw new Error('no model created');
    expect(world.children).toEqual([created.root]);
    expect(command.pasted().every((object) => object.parent === created.root)).toBe(true);
    expect(created.getBrushCount()).toBe(1);
    command.undo();
    expect(world.children).toEqual([]);
    command.execute();
    expect(command.createdModel()).toBe(created);
    expect(world.children).toEqual([created.root]);
    expect(created.getBrushCount()).toBe(1);
  });

  it('targets the active model when the selection is outside every model', () => {
    const { world, model } = buildWorld();
    const plain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    world.add(plain);
    expect(clipboardScenePasteTargetResolve(world, plain, model)).toEqual({ model, parent: model.root, after: null });
    world.remove(model.root);
    expect(clipboardScenePasteTargetResolve(world, plain, model).model).toBeNull();
  });
});
