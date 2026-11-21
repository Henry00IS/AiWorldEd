import * as fs from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import type { SceneJSON } from '@/io/scene/io_types.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierStackMeshesShown } from '@/modifier/stack/meshes/modifier_stack_meshes.js';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import { modelExportBuild } from '@/io/export/model_export_build.js';
import { exportTargetFind } from '@/io/export/export_targets.js';
import type { ModelExportFormat } from '@/io/export/model_export_options.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
  MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';

const FIXTURE = path.resolve('tests/fixtures/bug-ss-mesh-different-uvs-than-input-solids.json');
const FORMATS: ModelExportFormat[] = ['fbx', 'obj', 'gltf', 'glb'];

/**
 * A script that may be used as a generator or a modifier.
 *
 * @param lines Script lines.
 * @returns Script document.
 */
function scriptDocument(...lines: SolidScriptLine[]) {
  return solidScriptDocumentUsesWith(solidScriptDocumentCreate(lines, 'Mesh'), { generator: true, modifier: true });
}

/**
 * Collects every mesh under a root.
 *
 * @param root Scene or export root.
 * @returns Meshes in traverse order.
 */
function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

/**
 * Counts position vertices on a mesh.
 *
 * @param mesh Mesh.
 * @returns Vertex count, or zero when none.
 */
function vertexCount(mesh: THREE.Mesh): number {
  return mesh.geometry.getAttribute('position')?.count ?? 0;
}

/**
 * World-space bounds of a mesh's geometry.
 *
 * @param mesh Mesh.
 * @returns Bounds.
 */
function worldBounds(mesh: THREE.Mesh): THREE.Box3 {
  mesh.updateWorldMatrix(true, false);
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
}

/**
 * Expects two boxes to match within a tight tolerance.
 *
 * @param actual Bounds to check.
 * @param expected Bounds to match.
 */
function expectBoundsMatch(actual: THREE.Box3, expected: THREE.Box3): void {
  expect(actual.min.distanceTo(expected.min)).toBeLessThan(1e-4);
  expect(actual.max.distanceTo(expected.max)).toBeLessThan(1e-4);
}

/**
 * Builds the files of one export, ASCII FBX and no OBJ materials.
 *
 * @param world Live world.
 * @param format Format to write.
 * @returns The model file's bytes, and its text (the GLB JSON chunk too).
 */
async function exportModel(
  world: THREE.Group,
  format: ModelExportFormat,
): Promise<{ text: string; bytes: Uint8Array }> {
  const result = await modelExportBuild(world, {
    format,
    target: exportTargetFind('godot'),
    baseFileName: 'scene',
    fbxEncoding: 'ascii',
    textures: { mode: 'embedded' },
    objMaterials: false,
  });
  const bytes = new Uint8Array(await result.files[0]!.blob.arrayBuffer());
  return { bytes, text: new TextDecoder().decode(bytes) };
}

/**
 * Asserts one exporter wrote the named mesh with geometry.
 *
 * @param format Exporter.
 * @param text File text, including the GLB JSON chunk.
 * @param bytes File bytes.
 * @param name Expected mesh name.
 */
function expectExportedGeometry(format: ModelExportFormat, text: string, bytes: Uint8Array, name: string): void {
  expect(bytes.byteLength, format).toBeGreaterThan(400);
  const token = name.replace(/ /g, '_');
  expect(text.includes(name) || text.includes(token), format).toBe(true);
  if (format === 'fbx') {
    expect(text).toContain(`Model::${name}`);
    expect(text).toMatch(/Vertices:\s*\*[1-9]/);
    return;
  }
  if (format === 'obj') expect((text.match(/^v /gm) ?? []).length).toBeGreaterThan(0);
  if (format === 'gltf') {
    const json = JSON.parse(text) as { meshes?: unknown[] };
    expect(json.meshes?.length ?? 0).toBeGreaterThan(0);
  }
}

/**
 * Exports a world in every format and checks each file has the named mesh.
 *
 * @param world Live world.
 * @param name Expected mesh name.
 */
async function expectEveryExporterWrites(world: THREE.Group, name: string): Promise<void> {
  for (const format of FORMATS) {
    const file = await exportModel(world, format);
    expectExportedGeometry(format, file.text, file.bytes, name);
  }
}

/**
 * Rebuilds a solid so its modifier stack and result mesh are up to date.
 *
 * @param world World the solid is in.
 * @param model Solid.
 */
function rebuildSolid(world: THREE.Group, model: SolidModel): void {
  world.updateMatrixWorld(true);
  model.markDirty();
  model.rebuild(true);
  world.updateMatrixWorld(true);
}

/**
 * Builds a world with one box brush and no modifiers.
 *
 * @returns World and solid.
 */
function brushesOnlyWorld(): { world: THREE.Group; model: SolidModel } {
  const world = new THREE.Group();
  const model = new SolidModel('Brushes only');
  model.addBoxBrush(2, SolidOperation.Additive);
  world.add(model.root);
  rebuildSolid(world, model);
  return { world, model };
}

/**
 * Builds a world with a SolidScript modifier volume that turns the brushes into
 * a mesh.
 *
 * @returns World, the volume, and the shown mesh.
 */
function modifierVolumeWorld(): { world: THREE.Group; volume: THREE.Mesh; shown: THREE.Mesh } {
  const world = new THREE.Group();
  const model = new SolidModel('Modifier host');
  world.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive);
  const entry = modifierStackEntryCreate(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, []);
  entry.parameters['script'] = scriptDocument(
    { command: 'mesh_from_solids' },
    { command: 'input_objects' },
    { command: 'end' },
  );
  const volume = ModifierVolume.create({ modifiers: [entry] });
  volume.name = 'Modifier Volume';
  volume.position.set(0.25, 0.5, -0.75);
  volume.scale.set(4, 4, 4);
  world.add(volume);
  rebuildSolid(world, model);
  const [shown] = modifierStackMeshesShown(volume);
  if (!shown) throw new Error('Expected the modifier to show a mesh');
  return { world, volume, shown };
}

/**
 * Builds a world with a SolidScript generator that builds a cube mesh.
 *
 * @returns World, the generator node, and the shown mesh.
 */
function generatorWorld(): { world: THREE.Group; node: THREE.Mesh; shown: THREE.Mesh } {
  const world = new THREE.Group();
  const model = new SolidModel('Generator host');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  node.name = 'SolidScript';
  node.position.set(4, 1, -2);
  model.root.add(node);
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected the generator modifier');
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [
      {
        ...first,
        enabled: true,
        parameters: {
          ...first.parameters,
          script: scriptDocument(
            { command: 'mesh_from_solids' },
            { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
            { command: 'end' },
          ),
        },
      },
      ...rest,
    ],
  });
  rebuildSolid(world, model);
  const [shown] = modifierStackMeshesShown(node);
  if (!shown) throw new Error('Expected the generator to show a mesh');
  return { world, node, shown };
}

/**
 * Loads the transferred level and rebuilds its solid.
 *
 * @returns World, solid, and volume.
 */
function loadTransfer(): { world: THREE.Group; model: SolidModel; volume: THREE.Object3D } {
  const world = new THREE.Group();
  const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as SceneJSON;
  new SceneDeserializer().deserialize(data, world);
  const model = world.children.map((child) => SolidModel.fromObject(child)).find((found) => found !== null);
  const volume = world.children.find((child) => ModifierVolume.isVolume(child));
  if (!model || !volume) throw new Error('Expected a solid and a modifier volume');
  rebuildSolid(world, model);
  return { world, model, volume };
}

/**
 * Expects the export scene to hold one copy of a shown mesh, in place, and not
 * the volume or generator helper it came from.
 *
 * @param world Live world.
 * @param shown Mesh the viewport shows.
 * @param helperName Name of the omitted volume or generator node.
 */
function expectExportCopiesShownMesh(world: THREE.Group, shown: THREE.Mesh, helperName: string): void {
  const exported = meshesOf(buildExportScene(world));
  expect(exported.map((mesh) => mesh.name)).toEqual([shown.name]);
  expect(vertexCount(exported[0]!)).toBe(vertexCount(shown));
  expect(vertexCount(exported[0]!)).toBeGreaterThan(0);
  expectBoundsMatch(worldBounds(exported[0]!), worldBounds(shown));
  expect(exported.some((mesh) => mesh.name === helperName)).toBe(false);
}

describe('export of SolidScript meshes', () => {
  it('still writes a plain brush solid through every exporter', async () => {
    const { world, model } = brushesOnlyWorld();
    const exported = meshesOf(buildExportScene(world));
    expect(exported).toHaveLength(1);
    expect(exported[0]!.name).toBe(model.root.name);
    expect(vertexCount(exported[0]!)).toBe(vertexCount(model.getResultMesh()));
    await expectEveryExporterWrites(world, model.root.name);
  });

  it('writes a SolidScript modifier mesh through every exporter, not an empty solid', async () => {
    const { world, volume, shown } = modifierVolumeWorld();
    expectExportCopiesShownMesh(world, shown, volume.name);
    await expectEveryExporterWrites(world, shown.name);
  });

  it('writes a SolidScript generator mesh through every exporter', async () => {
    const { world, node, shown } = generatorWorld();
    expectExportCopiesShownMesh(world, shown, node.name);
    await expectEveryExporterWrites(world, shown.name);
  });

  it('writes the transferred Mesh From Solids scene through every exporter', async () => {
    const { world, volume } = loadTransfer();
    const [shown] = modifierStackMeshesShown(volume);
    if (!shown) throw new Error('Expected the transferred volume to show a mesh');
    expect(shown.name).toBe('Mesh From Solids');
    expect(vertexCount(shown)).toBe(460);
    expectExportCopiesShownMesh(world, shown, volume.name);
    await expectEveryExporterWrites(world, shown.name);
  });
});
