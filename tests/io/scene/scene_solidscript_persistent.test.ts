import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
  MODIFIER_STACK_SOLID_SCRIPT_PERSISTENT_KEY,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Builds the script used to print stored persistent values in these tests.
 *
 * @returns Script document.
 */
function scriptOf() {
  return solidScriptDocumentCreate([
    { command: 'echo', values: { value: '[$Persistent.Count] [$Persistent.Note]' } },
    { command: 'cube', values: {} },
  ]);
}

/**
 * Builds the parameter fields that hold the script and stored values.
 *
 * @param inputs Stored input values, including older persistent keys when
 *   testing a saved map.
 * @param persistent Structured persistent record, when already migrated.
 * @returns Parameter fields to write on the generator.
 */
function storedParameters(inputs: Record<string, string>, persistent?: Record<string, unknown>) {
  return {
    [MODIFIER_STACK_SOLID_SCRIPT_KEY]: scriptOf(),
    [MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]: inputs,
    ...(persistent ? { [MODIFIER_STACK_SOLID_SCRIPT_PERSISTENT_KEY]: persistent } : {}),
  };
}

/**
 * Writes a script and stored values onto the first modifier of a generator.
 *
 * @param node Generator node.
 * @param inputs Stored input values.
 * @param persistent Structured persistent record, when already migrated.
 */
function generatorStore(
  node: THREE.Object3D,
  inputs: Record<string, string>,
  persistent?: Record<string, unknown>,
): void {
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected the generator modifier');
  const parameters = { ...first.parameters, ...storedParameters(inputs, persistent) };
  ModifierVolume.write(node, { ...settings, modifiers: [{ ...first, parameters }, ...rest] });
}

/**
 * Builds a world with a Solid Script generator holding a script and stored
 * values.
 *
 * @param inputs Stored input values, including older persistent keys when
 *   testing a saved map.
 * @param persistent Structured persistent record, when already migrated.
 * @returns World and the generator node.
 */
function worldOf(inputs: Record<string, string>, persistent?: Record<string, unknown>) {
  const world = new THREE.Group();
  const model = new SolidModel('Persistent test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  generatorStore(node, inputs, persistent);
  return { world, node };
}

/**
 * Saves a world and loads it into a new group, then rebuilds its stacks.
 *
 * @param world World to save.
 * @returns Loaded generator node.
 */
function load(world: THREE.Group): THREE.Object3D {
  const loaded = new THREE.Group();
  new SceneDeserializer().deserialize(new SceneSerializer().serialize(world) as never, loaded);
  const [model] = [...SolidModelRegistry.collectUnder(loaded)];
  const node = model?.root.children.find((child) => ModifierVolume.isGenerator(child));
  if (!node || !model) throw new Error('Expected the loaded generator');
  loaded.updateMatrixWorld(true);
  modifierStackCompile(model.getBrushes(), model.root);
  return node;
}

/**
 * Echoes the persistent values a generator holds after a load.
 *
 * @param node Loaded generator.
 * @returns Printed text.
 */
function printed(node: THREE.Object3D): string {
  const parameters = ModifierVolume.read(node).modifiers[0]?.parameters ?? {};
  const result = solidScriptProgramRun(scriptOf(), {
    inputs: (parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY] as Record<string, string> | undefined) ?? {},
    persistent: (parameters[MODIFIER_STACK_SOLID_SCRIPT_PERSISTENT_KEY] as Record<string, unknown> | undefined) ?? {},
  });
  if (result.error) throw new Error(result.error.message);
  return result.messages[0] ?? '';
}

describe('Solid Script persistent values in a saved level', () => {
  it('keeps a structured persistent record when the level is saved and loaded', () => {
    const { world, node } = worldOf({}, { count: 4, note: 'He said "hello"\nand then goodbye' });
    expect(printed(load(world))).toBe('4 He said "hello"\nand then goodbye');
    expect(ModifierVolume.read(node).modifiers[0]?.parameters[MODIFIER_STACK_SOLID_SCRIPT_PERSISTENT_KEY]).toEqual({
      count: 4,
      note: 'He said "hello"\nand then goodbye',
    });
  });

  it('loads older $persistent keys from a saved map into the structured record', () => {
    const { world } = worldOf({
      '$persistent.count': '4',
      '$persistent.note': '"saved"',
    });
    const loaded = load(world);
    const parameters = ModifierVolume.read(loaded).modifiers[0]?.parameters ?? {};
    expect(parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]).toEqual({});
    expect(parameters[MODIFIER_STACK_SOLID_SCRIPT_PERSISTENT_KEY]).toEqual({ count: 4, note: 'saved' });
    expect(printed(loaded)).toBe('4 saved');
  });
});
