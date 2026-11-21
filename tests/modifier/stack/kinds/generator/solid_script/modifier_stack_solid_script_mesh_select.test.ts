import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackMeshesShown } from '@/modifier/stack/meshes/modifier_stack_meshes.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import { MODIFIER_STACK_BAKE_MESH_KEY } from '@/modifier/stack/bake/modifier_stack_bake_meshes.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
  MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { ManagerViewportSync } from '@/layout/viewport/manager_viewport_sync.js';
import { SceneRaycaster } from '@/selection/object/scene_raycaster.js';
import { getOutlinerContentChildren } from '@/outliner/ui/outliner_tree_hierarchy.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';

/**
 * A SolidScript mesh a generator or modifier shows is already an editor helper,
 * and must stay out of object picking, box select and the outliner until it is
 * baked.
 */

const END: SolidScriptLine = { command: 'end' };

/**
 * Script that builds a mesh from the brushes it is given or creates.
 *
 * @param source 'input' reads Input Brushes; 'cube' builds a cube.
 * @returns Script that may be used both ways.
 */
function meshScript(source: 'input' | 'cube') {
  const inner: SolidScriptLine = source === 'input' ? { command: 'input_brushes' } : { command: 'cube' };
  return solidScriptDocumentUsesWith(
    solidScriptDocumentCreate([{ command: 'mesh_brushes' }, inner, END], 'Mesh From Brushes'),
    { generator: true, modifier: true },
  );
}

/**
 * Lists the meshes the viewport would offer for click and box select.
 *
 * @param world Scene world group.
 * @returns Selectable meshes.
 */
function selectableMeshes(world: THREE.Group): THREE.Mesh[] {
  const sync = new ManagerViewportSync(null, null, null, null);
  sync.setWorldObject(world);
  return sync.getWorldSelectableMeshes();
}

/**
 * Casts a downward ray through a mesh's world centre.
 *
 * @param mesh Mesh to aim at.
 * @param candidates Meshes offered to the picker.
 * @returns Hits, nearest first.
 */
function downwardHits(mesh: THREE.Mesh, candidates: readonly THREE.Mesh[]): THREE.Intersection[] {
  mesh.updateWorldMatrix(true, false);
  const origin = new THREE.Vector3();
  mesh.getWorldPosition(origin);
  origin.y += 20;
  return new SceneRaycaster().castRay(new THREE.Ray(origin, new THREE.Vector3(0, -1, 0)), [...candidates]);
}

/**
 * Checks that a shown mesh is a helper, stays out of selection lists, and would
 * still be hit if a picker were given it alone, because click picking does not
 * use the mesh's disabled raycast function.
 *
 * @param world Scene world group.
 * @param shown Shown generator or modifier mesh.
 * @param kept Objects that must stay selectable.
 */
function expectShownMeshUnselectable(world: THREE.Group, shown: THREE.Mesh, kept: readonly THREE.Object3D[]): void {
  expect(isEditorHelperObject(shown)).toBe(true);
  const selectable = selectableMeshes(world);
  expect(selectable).not.toContain(shown);
  for (const object of kept) expect(selectable).toContain(object);
  expect(getOutlinerContentChildren(shown.parent as THREE.Object3D)).not.toContain(shown);
  expect(downwardHits(shown, selectable).some((hit) => hit.object === shown)).toBe(false);
  expect(downwardHits(shown, [shown])[0]?.object).toBe(shown);
}

/**
 * Writes a script onto the first modifier of a volume or generator node.
 *
 * @param node Volume or generator node.
 * @param source Brush source for Mesh From Brushes.
 */
function writeMeshScript(node: THREE.Object3D, source: 'input' | 'cube'): void {
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected a modifier');
  const parameters = { ...first.parameters, script: meshScript(source) };
  ModifierVolume.write(node, { ...settings, modifiers: [{ ...first, parameters }, ...rest] });
}

/**
 * Builds a solid of three boxes and a SolidScript modifier volume that turns
 * them into a mesh, like the reported level.
 *
 * @returns World, volume, shown mesh and the objects that should stay
 *   selectable.
 */
function modifierOverBrushes() {
  const world = new THREE.Group();
  const model = new SolidModel('Select modifier test');
  world.add(model.root);
  const brushes = modifierTestBrushes(model);
  const volume = modifierTestVolume();
  world.add(volume);
  world.updateMatrixWorld(true);
  modifierStackCompile(model.getBrushes(), model.root);
  const shown = modifierStackMeshesShown(volume)[0];
  if (!shown) throw new Error('Expected a shown mesh');
  const kept = [volume, ...brushes.map((brush) => brush.mesh).filter((mesh): mesh is THREE.Mesh => !!mesh)];
  return { world, volume, shown, kept };
}

/**
 * Adds three box brushes in a row, without rebuilding after each one.
 *
 * @param model Solid.
 * @returns Brushes.
 */
function modifierTestBrushes(model: SolidModel) {
  return [0, 1, 2].map((index) => {
    const brush = model.addBoxBrush(1, SolidOperation.Additive, null, false);
    brush.mesh?.position.set(index * 2, 0, 0);
    return brush;
  });
}

/**
 * Creates a volume large enough to hold the three test brushes, running Mesh
 * From Brushes around Input Brushes.
 *
 * @returns Volume.
 */
function modifierTestVolume(): THREE.Mesh {
  const entry = modifierStackEntryCreate(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, []);
  entry.parameters['script'] = meshScript('input');
  const volume = ModifierVolume.create({ modifiers: [entry] });
  volume.position.set(2, 0, 0);
  volume.scale.setScalar(12);
  return volume;
}

/**
 * Builds an empty solid with a SolidScript generator that outputs a mesh.
 *
 * @returns World, node, shown mesh and the objects that should stay selectable.
 */
function generatorMeshScene() {
  const world = new THREE.Group();
  const model = new SolidModel('Select generator test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  writeMeshScript(node, 'cube');
  world.updateMatrixWorld(true);
  modifierStackCompile(model.getBrushes(), model.root);
  const shown = modifierStackMeshesShown(node)[0];
  if (!shown) throw new Error('Expected a shown mesh');
  return { world, node, shown, kept: [node] };
}

describe('SolidScript mesh output stays unselectable', () => {
  it('keeps a modifier Mesh From Brushes output out of click picking, box select and the outliner', () => {
    const fixture = modifierOverBrushes();
    expect(fixture.shown.name).toBe('Mesh From Brushes');
    expectShownMeshUnselectable(fixture.world, fixture.shown, fixture.kept);
  });

  it('keeps a generator Mesh From Brushes output out of those same lists', () => {
    const fixture = generatorMeshScene();
    expectShownMeshUnselectable(fixture.world, fixture.shown, fixture.kept);
  });

  it('lets a baked mesh be selected, listed and picked', () => {
    const fixture = generatorMeshScene();
    new CommandModifierVolumeBake(fixture.node).execute();
    const baked = fixture.world.children.find(
      (child): child is THREE.Mesh =>
        child instanceof THREE.Mesh && child.userData[MODIFIER_STACK_BAKE_MESH_KEY] === true,
    );
    if (!baked) throw new Error('Expected a baked mesh');
    expect(isEditorHelperObject(baked)).toBe(false);
    expect(selectableMeshes(fixture.world)).toContain(baked);
    expect(getOutlinerContentChildren(fixture.world)).toContain(baked);
    expect(downwardHits(baked, [baked])[0]?.object).toBe(baked);
  });
});
