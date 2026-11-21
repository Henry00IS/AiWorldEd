import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackMeshesShown } from '@/modifier/stack/meshes/modifier_stack_meshes.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import { MODIFIER_STACK_BAKE_MESH_KEY } from '@/modifier/stack/bake/modifier_stack_bake_meshes.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { readContentMeshTextureId } from '@/texture/uv/content_mesh_texture.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * Builds a world with an empty solid holding one SolidScript generator node
 * running the given lines.
 *
 * @param lines Script lines.
 * @returns Fixture parts.
 */
function meshFixture(...lines: SolidScriptLine[]) {
  const world = new THREE.Group();
  const model = new SolidModel('Mesh test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  node.position.set(4, 0, 0);
  const set = (patch: Record<string, unknown>, enabled = true) => {
    const settings = ModifierVolume.read(node);
    const [first, ...rest] = settings.modifiers;
    if (!first) throw new Error('Expected the generator modifier');
    ModifierVolume.write(node, {
      ...settings,
      modifiers: [{ ...first, enabled, parameters: { ...first.parameters, ...patch } }, ...rest],
    });
  };
  set({ script: solidScriptDocumentCreate(lines, 'Mesh') });
  const compile = () => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  return { world, model, node, set, compile };
}

/**
 * World bounds of a mesh object's document.
 *
 * @param mesh Mesh object.
 * @returns Bounds.
 */
function worldBounds(mesh: THREE.Mesh): THREE.Box3 {
  mesh.updateWorldMatrix(true, false);
  const document = readPersistentMeshDocument(mesh);
  if (!document) throw new Error('Expected a mesh document');
  const positions = document.getTopology().getPositions();
  const box = new THREE.Box3();
  for (let index = 0; index < positions.length; index += 3)
    box.expandByPoint(new THREE.Vector3().fromArray(positions, index).applyMatrix4(mesh.matrixWorld));
  return box;
}

describe('SolidScript generator meshes', () => {
  it('shows a mesh the script builds at the generator, as an unsaved helper, next to its brushes', () => {
    const fixture = meshFixture(
      { command: 'mesh_from_solids' },
      { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
      END,
      {
        command: 'sphere',
      },
    );
    const compiled = fixture.compile();
    expect(compiled.instances.filter((brush) => brush.id.startsWith(`${fixture.node.uuid}#`))).toHaveLength(1);
    const [shown, ...others] = modifierStackMeshesShown(fixture.node);
    expect(others).toHaveLength(0);
    if (!shown) throw new Error('Expected a shown mesh');
    expect(shown.name).toBe('Mesh From Solids');
    expect(isEditorHelperObject(shown)).toBe(true);
    expect(readPersistentMeshDocument(shown)?.getTopology().getFaceCount()).toBe(6);
    const box = worldBounds(shown);
    const centre = new THREE.Box3()
      .setFromObject(new THREE.Mesh(fixture.node.geometry))
      .getCenter(new THREE.Vector3())
      .add(fixture.node.position);
    expect(box.getCenter(new THREE.Vector3()).distanceTo(centre)).toBeLessThan(1e-4);
    expect(
      box
        .getSize(new THREE.Vector3())
        .toArray()
        .map((value) => Math.round(value * 1000) / 1000),
    ).toEqual([2, 2, 2]);
    const saved = JSON.stringify(new SceneSerializer().serialize(fixture.world));
    expect(saved).not.toContain('Mesh From Solids');
  });

  it('replaces the shown mesh on every rebuild and removes it when the generator is off', () => {
    const fixture = meshFixture(
      { command: 'mesh' },
      ...[0, 1, 2].map((i) => ({ command: 'vertex', values: { position: `${i}, ${i % 2}, 0` } })),
      { command: 'face', values: { corners: '0, 1, 2' } },
      END,
    );
    fixture.compile();
    fixture.compile();
    expect(modifierStackMeshesShown(fixture.node)).toHaveLength(1);
    fixture.set({}, false);
    fixture.compile();
    expect(modifierStackMeshesShown(fixture.node)).toHaveLength(0);
  });

  it('paints a mesh with the Texture around Project UVs, shown and baked', () => {
    const texture: SolidScriptLine = { command: 'texture', values: { texture: 'Base/Blakm_d.bmp' } };
    const fromBrushes: SolidScriptLine = { command: 'mesh_from_solids' };
    const torus: SolidScriptLine[] = [
      { command: 'rotate_extrude', values: { angle: '360', sides: '16' } },
      { command: 'transform', values: { move: '1, 0, 0' } },
      { command: 'circle', values: { r: '0.5', sides: '8' } },
      END,
      END,
    ];
    const selectBrushes: SolidScriptLine = { command: 'select_objects' };
    const select: SolidScriptLine = { command: 'select_faces', values: { which: 'All' } };
    const project: SolidScriptLine = { command: 'project_uvs', values: { size: '1' } };
    const orders: SolidScriptLine[][] = [
      [texture, fromBrushes, ...torus, END, selectBrushes, select, project, END],
      [fromBrushes, texture, ...torus, END, END, selectBrushes, select, project],
    ];
    for (const order of orders) {
      const fixture = meshFixture(...order);
      fixture.compile();
      const [shown] = modifierStackMeshesShown(fixture.node);
      if (!shown) throw new Error('Expected a shown mesh');
      expect(readContentMeshTextureId(shown)).toBe('Base/Blakm_d.bmp');
      new CommandModifierVolumeBake(fixture.node).execute();
      const baked = fixture.world.children.find(
        (child): child is THREE.Mesh =>
          child instanceof THREE.Mesh && child.userData[MODIFIER_STACK_BAKE_MESH_KEY] === true,
      );
      expect(baked && readContentMeshTextureId(baked)).toBe('Base/Blakm_d.bmp');
    }
  });

  it('bakes shown meshes into regular editable meshes beside the solid, and undo takes them away', () => {
    const fixture = meshFixture(
      { command: 'mesh_from_solids' },
      { command: 'cube' },
      END,
      { command: 'select_objects' },
      { command: 'subdivide' },
    );
    fixture.compile();
    const shown = modifierStackMeshesShown(fixture.node)[0];
    if (!shown) throw new Error('Expected a shown mesh');
    const before = worldBounds(shown);
    const bake = new CommandModifierVolumeBake(fixture.node);
    expect(bake.createdCount()).toBe(1);
    bake.execute();
    const baked = fixture.world.children.filter(
      (child): child is THREE.Mesh =>
        child instanceof THREE.Mesh && child.userData[MODIFIER_STACK_BAKE_MESH_KEY] === true,
    );
    expect(baked).toHaveLength(1);
    expect(isEditorHelperObject(baked[0]!)).toBe(false);
    expect(baked[0]!.name).toMatch(/Mesh|Subdivide|Cube|mesh/);
    const after = worldBounds(baked[0]!);
    for (const key of ['min', 'max'] as const) expect(after[key].distanceTo(before[key])).toBeLessThan(1e-4);
    expect(JSON.stringify(new SceneSerializer().serialize(fixture.world))).toContain(baked[0]!.uuid);
    bake.undo();
    expect(fixture.world.children.some((child) => child === baked[0])).toBe(false);
    bake.execute();
    expect(fixture.world.children.some((child) => child === baked[0])).toBe(true);
  });
});
