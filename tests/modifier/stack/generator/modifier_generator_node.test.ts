import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { getSolidGroupOperation } from '@/solid/model/solid_group.js';
import { ModifierVolume, modifierVolumesActive } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import { stackFixtureEntries } from '../modifier_stack_fixture.js';

/**
 * Builds a world with one solid holding a box brush and a generator node.
 *
 * @param kind Generator kind.
 * @returns Fixture parts.
 */
function nodeFixture(kind = 'column') {
  const world = new THREE.Group();
  const model = new SolidModel('Generator test');
  world.add(model.root);
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  const node = modifierGeneratorNodeCreate(kind);
  node.position.set(0, 0, 0);
  model.root.add(node);
  const compile = () => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  const pieces = () => compile().instances.filter((brush) => brush.id.startsWith(`${node.uuid}#`));
  return { world, model, source, node, compile, pieces };
}

/**
 * Sets one parameter of the node's generator.
 *
 * @param node Generator node.
 * @param patch Parameters.
 */
function generatorSet(node: THREE.Object3D, patch: Record<string, unknown>): void {
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...first!, parameters: { ...first!.parameters, ...patch } }, ...rest],
  });
}

describe('generator nodes', () => {
  it('are their own node type: generator role, own colour, not a capturing volume', () => {
    const { node, world } = nodeFixture();
    expect(ModifierVolume.isVolume(node)).toBe(true);
    expect(ModifierVolume.isGenerator(node)).toBe(true);
    expect(ModifierVolume.read(node).role).toBe('generator');
    expect(ModifierVolume.read(node).modifiers.map((step) => step.kind)).toEqual(['column']);
    expect(modifierVolumesActive(world)).toEqual([]);
    const plain = ModifierVolume.create({});
    expect(ModifierVolume.isGenerator(plain)).toBe(false);
    expect(ModifierVolume.read(plain).role).toBeUndefined();
    expect((node.material as THREE.MeshBasicMaterial).color.getHex()).not.toBe(
      (plain.material as THREE.MeshBasicMaterial).color.getHex(),
    );
  });

  it('builds every kind inside its box, captures nothing, and leaves overlapping brushes alone', () => {
    for (const kind of ['column', 'stairs', 'arch']) {
      const fixture = nodeFixture(kind);
      const result = fixture.compile();
      const made = fixture.pieces();
      expect(made.length).toBeGreaterThan(0);
      const box = new THREE.Box3().setFromObject(fixture.node).expandByScalar(1e-4);
      for (const piece of made) for (const vertex of piece.brush.vertices) expect(box.containsPoint(vertex)).toBe(true);
      const authored = result.instances.find((brush) => brush.id === fixture.source.id);
      expect(authored?.visible).toBe(true);
      expect(authored?.brush.vertices.length).toBe(8);
    }
  });

  it('uses its Add, Subtract, or Intersect operation', () => {
    const fixture = nodeFixture('arch');
    expect(fixture.pieces().every((piece) => piece.operation === SolidOperation.Additive)).toBe(true);
    generatorSet(fixture.node, { operation: 'subtract' });
    expect(fixture.pieces().every((piece) => piece.operation === SolidOperation.Subtractive)).toBe(true);
    generatorSet(fixture.node, { operation: 'intersect' });
    const group = fixture.pieces()[0]?.mesh?.parent;
    expect(group && getSolidGroupOperation(group)).toBe(SolidOperation.Intersecting);
    expect(fixture.pieces().every((piece) => piece.mesh?.parent === group)).toBe(true);
  });

  it('sits in CSG order at its place in the model', () => {
    const fixture = nodeFixture('column');
    const result = fixture.compile();
    const order: string[] = [];
    result.root.traverse((node) => order.push(node.uuid));
    const first = fixture.pieces()[0]!;
    expect(order.indexOf(first.mesh!.uuid)).toBeGreaterThan(order.indexOf(fixture.source.mesh!.uuid));
    fixture.model.root.children.splice(fixture.model.root.children.indexOf(fixture.node), 1);
    fixture.model.root.children.unshift(fixture.node);
    const moved: string[] = [];
    fixture.compile().root.traverse((node) => moved.push(node.uuid));
    expect(moved.indexOf(fixture.pieces()[0]!.mesh!.uuid)).toBeLessThan(moved.indexOf(fixture.source.mesh!.uuid));
  });

  it('builds nothing while hidden or disabled', () => {
    const fixture = nodeFixture();
    fixture.node.visible = false;
    expect(fixture.pieces()).toEqual([]);
    fixture.node.visible = true;
    ModifierVolume.write(fixture.node, { ...ModifierVolume.read(fixture.node), enabled: false });
    expect(fixture.pieces()).toEqual([]);
    ModifierVolume.write(fixture.node, { ...ModifierVolume.read(fixture.node), enabled: true });
    expect(fixture.pieces().length).toBeGreaterThan(0);
  });

  it('runs its own modifier stack in order after the generator', () => {
    const fixture = nodeFixture('column');
    const alone = fixture.pieces().length;
    const settings = ModifierVolume.read(fixture.node);
    const array = { ...modifierStackEntryCreate('linear', settings.modifiers), parameters: {} };
    const [linear] = stackFixtureEntries([{ kind: 'linear', parameters: { mode: 'fixed', offsetX: 2, count: 3 } }]);
    ModifierVolume.write(fixture.node, {
      ...settings,
      modifiers: [...settings.modifiers, { ...array, ...linear!, id: array.id }],
    });
    expect(fixture.pieces().length).toBe(alone * 3);
  });

  it('is still affected by modifier volumes around it', () => {
    const fixture = nodeFixture('column');
    const alone = fixture.pieces().length;
    const volume = ModifierVolume.create({
      modifiers: stackFixtureEntries([{ kind: 'linear', parameters: { mode: 'fixed', offsetX: 3, count: 2 } }]),
    });
    volume.scale.set(1.5, 4, 1.5);
    volume.position.set(0, 0, 0);
    fixture.world.add(volume);
    const result = fixture.compile();
    const copies = result.instances.filter((brush) => brush.id.includes(`#${volume.uuid}`));
    expect(copies.length).toBe(alone + 1);
    const order: string[] = [];
    result.root.traverse((node) => order.push(node.uuid));
    const piece = fixture.pieces()[0]!;
    expect(order.indexOf(piece.mesh!.uuid)).toBeGreaterThan(-1);
    volume.position.set(20, 0, 0);
    const moved = fixture.compile().instances.filter((brush) => brush.id.includes(`#${volume.uuid}`));
    expect(moved.length).toBe(0);
  });

  it('is bevelled by a bevel volume over it', () => {
    const fixture = nodeFixture('stairs');
    const plain = fixture.pieces().map((piece) => piece.brush.vertices.length);
    const volume = ModifierVolume.create({ modifiers: stackFixtureEntries(['bevel']) });
    volume.scale.set(10, 10, 10);
    fixture.world.add(volume);
    const bevelled = fixture.pieces().map((piece) => piece.brush.vertices.length);
    expect(bevelled.some((count, index) => count > plain[index]!)).toBe(true);
  });

  it('round-trips its role through the saved stack', () => {
    const fixture = nodeFixture('arch');
    const saved = ModifierVolume.read(fixture.node);
    const loaded = ModifierVolume.create(JSON.parse(JSON.stringify(saved)));
    expect(ModifierVolume.isGenerator(loaded)).toBe(true);
    expect(ModifierVolume.read(loaded)).toEqual(saved);
  });

  it('bakes into authored brushes at its place and undoes', () => {
    const fixture = nodeFixture('stairs');
    const count = fixture.pieces().length;
    const before = fixture.model.getBrushCount();
    const bake = new CommandModifierVolumeBake(fixture.node);
    expect(bake.createdCount()).toBe(count);
    bake.execute();
    expect(fixture.node.parent).toBeNull();
    expect(fixture.model.getBrushCount()).toBe(before + count);
    bake.undo();
    expect(fixture.node.parent).toBe(fixture.model.root);
    expect(fixture.model.getBrushCount()).toBe(before);
  });
});
