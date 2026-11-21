import * as fs from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import type { SceneJSON } from '@/io/scene/io_types.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackMeshesShown } from '@/modifier/stack/meshes/modifier_stack_meshes.js';
import { CommandObjectVisibilityToggle } from '@/outliner/commands/command_object_visibility_toggle.js';
import { CommandObjectHierarchyDelete } from '@/outliner/commands/command_object_hierarchy_delete.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { modifierStackPatch } from '@/modifier/stack/modifier_stack_operations.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';

const FIXTURE = path.resolve('tests/fixtures/bug-ss-mesh-different-uvs-than-input-solids.json');

/**
 * Loads the transferred level: its solid and the SolidScript modifier volume.
 *
 * @returns World, solid, and volume.
 */
function loadLevel(): { world: THREE.Group; model: SolidModel; volume: THREE.Object3D } {
  const world = new THREE.Group();
  const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as SceneJSON;
  new SceneDeserializer().deserialize(data, world);
  world.updateMatrixWorld(true);
  const model = world.children.map((child) => SolidModel.fromObject(child)).find((found) => found !== null);
  const volume = world.children.find((child) => ModifierVolume.isVolume(child));
  if (!model || !volume) throw new Error('Expected a solid and a modifier volume');
  return { world, model, volume };
}

/**
 * Rebuilds the solid from scratch so the modifier's first evaluation is
 * current.
 *
 * @param model Solid.
 */
function compileLevel(model: SolidModel): void {
  model.markDirty();
  model.rebuild(true);
}

/**
 * Returns how many corners the solid's CSG result currently holds.
 *
 * @param model Solid.
 * @returns Position attribute count.
 */
function resultCorners(model: SolidModel): number {
  return model.getResultMesh().geometry.getAttribute('position')?.count ?? 0;
}

/**
 * Asserts whether the transferred brushes' CSG result is in the solid, and
 * whether the modifier's helper mesh is shown instead.
 *
 * @param model Solid.
 * @param volume Modifier volume, when it is still in the scene.
 * @param solids True when the brushes themselves should be visible.
 */
function expectSourceSolids(model: SolidModel, volume: THREE.Object3D | undefined, solids: boolean): void {
  expect(resultCorners(model) > 0).toBe(solids);
  if (volume) expect(modifierStackMeshesShown(volume).length > 0).toBe(!solids);
}

/**
 * Mutes or unmutes every modifier on a volume through the stack-edit command.
 *
 * @param volume Modifier volume.
 * @param enabled Whether each step is on.
 */
function muteModifiers(volume: THREE.Object3D, enabled: boolean): void {
  const before = ModifierVolume.read(volume);
  let after = before;
  for (const entry of before.modifiers) after = modifierStackPatch(after, entry.id, { enabled });
  new CommandModifierStackSet(volume, before, after).execute();
}

/**
 * Turns the volume itself on or off through the stack-edit command.
 *
 * @param volume Modifier volume.
 * @param enabled Whether the volume is on.
 */
function volumeEnabled(volume: THREE.Object3D, enabled: boolean): void {
  const before = ModifierVolume.read(volume);
  new CommandModifierStackSet(volume, before, { ...before, enabled }).execute();
}

/**
 * Builds a world with an empty solid holding one SolidScript generator that
 * shows a Mesh From Solids helper.
 *
 * @returns World, solid, and generator node.
 */
function meshGenerator(): { world: THREE.Group; model: SolidModel; node: THREE.Mesh } {
  const world = new THREE.Group();
  const model = new SolidModel('Generator hide test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  writeMeshFromBrushesScript(node);
  world.updateMatrixWorld(true);
  modifierStackCompile(model.getBrushes(), model.root);
  modifierBevelRefreshScene(world);
  return { world, model, node };
}

/**
 * Writes a Mesh From Solids script that builds a centred cube onto a generator.
 *
 * @param node Generator node.
 */
function writeMeshFromBrushesScript(node: THREE.Object3D): void {
  const lines: SolidScriptLine[] = [
    { command: 'mesh_from_solids' },
    { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
    { command: 'end' },
  ];
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected the generator modifier');
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [
      { ...first, parameters: { ...first.parameters, script: solidScriptDocumentCreate(lines, 'Mesh') } },
      ...rest,
    ],
  });
}

describe('hiding a Mesh From Solids modifier shows the source solids again', () => {
  it('rebuilds the solids as soon as the volume is hidden with the Eye, and hides them again when shown', () => {
    const { model, volume } = loadLevel();
    compileLevel(model);
    expectSourceSolids(model, volume, false);
    const hide = new CommandObjectVisibilityToggle(volume);
    hide.execute();
    expectSourceSolids(model, volume, true);
    hide.undo();
    expectSourceSolids(model, volume, false);
  });

  it('shows the solids again when the modifier steps are muted, and hides them when they are turned back on', () => {
    const { model, volume } = loadLevel();
    compileLevel(model);
    muteModifiers(volume, false);
    expectSourceSolids(model, volume, true);
    muteModifiers(volume, true);
    expectSourceSolids(model, volume, false);
  });

  it('shows the solids again when the volume is disabled, and hides them when it is enabled', () => {
    const { model, volume } = loadLevel();
    compileLevel(model);
    volumeEnabled(volume, false);
    expectSourceSolids(model, volume, true);
    volumeEnabled(volume, true);
    expectSourceSolids(model, volume, false);
  });

  it('shows the solids again when the volume is deleted, and hides them when the delete is undone', () => {
    const { model, volume } = loadLevel();
    compileLevel(model);
    const remove = new CommandObjectHierarchyDelete([volume]);
    remove.execute();
    expectSourceSolids(model, undefined, true);
    remove.undo();
    expectSourceSolids(model, volume, false);
  });
});

describe('hiding a SolidScript generator that shows a mesh', () => {
  it('removes the helper as soon as the generator is hidden with the Eye, and brings it back when shown', () => {
    const { node } = meshGenerator();
    expect(modifierStackMeshesShown(node)).toHaveLength(1);
    const hide = new CommandObjectVisibilityToggle(node);
    hide.execute();
    expect(modifierStackMeshesShown(node)).toHaveLength(0);
    hide.undo();
    expect(modifierStackMeshesShown(node)).toHaveLength(1);
  });

  it('removes the helper when the generator is disabled, and brings it back when enabled', () => {
    const { node } = meshGenerator();
    volumeEnabled(node, false);
    expect(modifierStackMeshesShown(node)).toHaveLength(0);
    volumeEnabled(node, true);
    expect(modifierStackMeshesShown(node)).toHaveLength(1);
  });
});
