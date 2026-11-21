import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import { MODIFIER_STACK_BAKE_MESH_KEY } from '@/modifier/stack/bake/modifier_stack_bake_meshes.js';
import { getOutlinerContentChildren } from '@/outliner/ui/outliner_tree_hierarchy.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { PanelPropertiesModifierStackSection } from '@/modifier/stack/ui/panel_properties_modifier_stack_section.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * Writes a SolidScript onto a generator node.
 *
 * @param node Generator node.
 * @param lines Script lines.
 */
function writeScript(node: THREE.Object3D, lines: SolidScriptLine[]): void {
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected the generator modifier');
  const script = solidScriptDocumentCreate(lines, 'Mesh Only');
  const parameters = { ...first.parameters, script };
  ModifierVolume.write(node, { ...settings, modifiers: [{ ...first, parameters }, ...rest] });
}

/**
 * Builds a scene with a world group, the way the editor parents content, and a
 * SolidScript generator that produces only a mesh.
 *
 * @returns Fixture parts.
 */
function sceneFixture() {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  world.name = 'World';
  scene.add(world);
  const model = new SolidModel('Bake mesh test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  writeScript(node, [{ command: 'mesh_from_solids' }, { command: 'cube', values: { size: '2, 2, 2' } }, END]);
  scene.updateMatrixWorld(true);
  modifierStackCompile(model.getBrushes(), model.root);
  return { scene, world, model, node };
}

/**
 * Lists meshes the bake made that sit under a parent.
 *
 * @param parent Parent to search.
 * @returns Baked meshes.
 */
function bakedUnder(parent: THREE.Object3D): THREE.Mesh[] {
  return parent.children.filter(
    (child): child is THREE.Mesh =>
      child instanceof THREE.Mesh && child.userData[MODIFIER_STACK_BAKE_MESH_KEY] === true,
  );
}

describe('Convert to Brush of script meshes', () => {
  it('puts the baked mesh in the world so the outliner lists it, and undo restores both', () => {
    const { scene, world, node } = sceneFixture();
    expect(getOutlinerContentChildren(world)).toContain(node.parent);
    const bake = new CommandModifierVolumeBake(node);
    bake.execute();
    const baked = bakedUnder(world);
    expect(baked).toHaveLength(1);
    const mesh = baked[0];
    if (!mesh) throw new Error('Expected a baked mesh');
    expect(bakedUnder(scene)).toHaveLength(0);
    expect(mesh.parent).toBe(world);
    expect(getOutlinerContentChildren(world)).toContain(mesh);
    expect(getOutlinerContentChildren(world)).not.toContain(node);
    expect(isEditorHelperObject(mesh)).toBe(false);
    expect(node.parent).toBeNull();
    bake.undo();
    expect(mesh.parent).toBeNull();
    expect(getOutlinerContentChildren(world)).not.toContain(mesh);
    expect(node.parent).not.toBeNull();
    expect(getOutlinerContentChildren(world)).toContain(node.parent);
    bake.execute();
    expect(mesh.parent).toBe(world);
    expect(getOutlinerContentChildren(world)).toContain(mesh);
  });

  it('does the same through the inspector Convert to Brush button', () => {
    const { world, node } = sceneFixture();
    const section = new PanelPropertiesModifierStackSection(
      () => document.createElement('section'),
      (title) => Object.assign(document.createElement('header'), { textContent: title }),
    );
    const stack = new CommandStack(32);
    section.setCommandStack(stack);
    document.body.replaceChildren(section.getElement());
    section.updateFromObjects([node]);
    const button = section.getElement().querySelector<HTMLButtonElement>('button[data-generator-convert]');
    expect(button).not.toBeNull();
    button?.click();
    const [mesh] = bakedUnder(world);
    if (!mesh) throw new Error('Expected a baked mesh');
    expect(getOutlinerContentChildren(world)).toContain(mesh);
    expect(node.parent).toBeNull();
    stack.undo();
    expect(mesh.parent).toBeNull();
    expect(node.parent).not.toBeNull();
    stack.redo();
    expect(mesh.parent).toBe(world);
    expect(getOutlinerContentChildren(world)).toContain(mesh);
  });
});
