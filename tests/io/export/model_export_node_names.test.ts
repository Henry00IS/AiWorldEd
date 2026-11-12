import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { FbxImporter } from '@/io/fbx/import/fbx_importer.js';
import type { FbxImportTextureResolver } from '@/io/fbx/import/fbx_import_types.js';
import { GlbExporter } from '@/io/glb/glb_exporter.js';
import { GlbImporter } from '@/io/glb/import/glb_importer.js';
import { GlbImportTextureResolverChecker } from '@/io/glb/import/glb_import_texture_resolver_checker.js';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { exportTargetFind } from '@/io/export/export_targets.js';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { extractHierarchyNameBase } from '@/utils/utils_hierarchy_name_allocator.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';
import { bounds, level } from './model_export_world_fixture.js';

const TARGETS = ['godot', 'unity', 'blender', 'unreal'] as const;

/** Gives every FBX texture the checker (these tests check names). */
const FBX_NO_TEXTURES: FbxImportTextureResolver = {
  resolve: async () => ({ textureIdByImage: new Map(), note: null }),
};

/**
 * Builds the test level plus a moved, rotated and scaled solid model.
 *
 * @returns World group.
 */
function world(): THREE.Group {
  const group = level();
  const model = new SolidModel('Wall');
  model.addBoxBrush(2, SolidOperation.Additive);
  model.root.position.set(3, 1, 2);
  model.root.rotation.set(0.2, 0.7, 0);
  model.root.scale.set(1, 2, 1);
  group.add(model.root);
  group.updateMatrixWorld(true);
  return group;
}

/**
 * Lists the base names of the nodes of an imported or exported tree.
 *
 * @param root Root.
 * @returns Base names.
 */
function names(root: THREE.Object3D): string[] {
  const list: string[] = [];
  root.traverse((object) => list.push(extractHierarchyNameBase(object.name)));
  return list;
}

beforeEach(() => mockObjectUrlApis());

describe('exported node names', () => {
  it('exports a solid model as one mesh named after it, with its transform', () => {
    const live = world();
    const scene = buildExportScene(live);
    const wall = scene.children.find((child) => child.name === 'Wall') as THREE.Mesh;
    expect(wall).toBeInstanceOf(THREE.Mesh);
    expect(wall.children).toEqual([]);
    expect(wall.position.toArray()).toEqual([3, 1, 2]);
    expect(names(scene)).not.toContain('Result');
    expect(bounds(scene)['Wall']).toBe(bounds(live)['Result']);
  });

  it('bakes a moved result mesh into the exported geometry', () => {
    const live = world();
    const model = live.children.find((child) => child.name === 'Wall')!;
    const result = model.children.find((child) => SolidModel.isResultMesh(child))!;
    result.position.set(0, 0.5, 0);
    live.updateMatrixWorld(true);
    expect(bounds(buildExportScene(live))['Wall']).toBe(bounds(live)['Result']);
  });

  it('writes the objects of the level as the glTF scene nodes, with meshes named after them', async () => {
    const pkg = await new GlbExporter().exportGltf(world(), 'level', { mode: 'embedded' });
    const json = JSON.parse(pkg.text) as {
      scenes: { nodes: number[] }[];
      nodes: { name?: string; mesh?: number; children?: number[] }[];
      meshes: { name?: string }[];
    };
    const roots = json.scenes[0]!.nodes.map((index) => extractHierarchyNameBase(json.nodes[index]!.name ?? ''));
    expect(roots).toEqual(['Room', 'Floor', 'Arrow', 'Wall']);
    expect(json.nodes.map((node) => node.name)).not.toContain('ExportRoot');
    const wall = json.nodes.find((node) => node.name === 'Wall')!;
    expect(wall.children).toBeUndefined();
    expect(json.meshes[wall.mesh!]!.name).toBe('Wall');
    json.nodes.forEach((node) => node.mesh !== undefined && expect(json.meshes[node.mesh]!.name).toBe(node.name));
  });

  it('names the glTF materials the way the FBX and OBJ exports do', async () => {
    const live = world();
    const gltf = JSON.parse((await new GlbExporter().exportGltf(live, 'level', { mode: 'embedded' })).text) as {
      materials: { name?: string }[];
    };
    const fbxPkg = await new FbxExporter().exportPackage(live, exportTargetFind('blender').space, 'level', 'ascii', {
      mode: 'embedded',
    });
    const fbx = [...new TextDecoder().decode(fbxPkg.fbxBytes).matchAll(/"Material::([^"]+)"/g)].map(
      (match) => match[1],
    );
    const obj = await new ObjExporter().exportPackage(live, exportTargetFind('blender').objSpace, 'level', {
      mode: 'copy',
      folder: '',
    });
    const mtl = obj
      .mtl!.text.split('\n')
      .filter((line) => line.startsWith('newmtl '))
      .map((line) => line.slice(7));
    const materials = gltf.materials.map((material) => material.name);
    expect(materials.length).toBeGreaterThan(1);
    expect(materials).toEqual(fbx);
    expect(materials).toEqual(mtl);
  });

  it.each(TARGETS)('writes no export root and no Result model into %s FBX files', async (targetId) => {
    const space = exportTargetFind(targetId).space;
    const pkg = await new FbxExporter().exportPackage(world(), space, 'level', 'ascii', { mode: 'embedded' });
    const text = new TextDecoder().decode(pkg.fbxBytes);
    expect(text).not.toContain('Model::ExportRoot');
    expect(text).not.toContain('Model::Result');
    expect(text).toContain('"Model::Wall", "Mesh"');
    expect(text).toContain('"Geometry::Wall", "Mesh"');
  });

  it.each(TARGETS)('names the OBJ object of a solid model after it for %s', async (targetId) => {
    const space = exportTargetFind(targetId).objSpace;
    const pkg = await new ObjExporter().exportPackage(world(), space, 'level', { mode: 'copy', folder: '' });
    const objects = pkg.objText.split('\n').filter((line) => line.startsWith('o '));
    expect(objects.map((line) => extractHierarchyNameBase(line.slice(2)))).toEqual([
      'Crate',
      'Pillar',
      'Floor',
      'Arrow',
      'Wall',
    ]);
  });

  it('imports its own glTF and FBX exports with one model per solid, named after it, in place', async () => {
    const live = world();
    const expected: Record<string, string | undefined> = { ...bounds(live), Wall: bounds(live)['Result'] };
    delete expected['Result'];
    delete expected['Brush'];
    const bytes = await new GlbExporter().export(live);
    const glb = await new GlbImporter().importFromBytes(bytes, 'level.glb', new GlbImportTextureResolverChecker('x'));
    const fbxPkg = await new FbxExporter().exportPackage(live, exportTargetFind('unity').space, 'level', 'binary', {
      mode: 'embedded',
    });
    const fbx = await new FbxImporter().importFromBytes(fbxPkg.fbxBytes, 'level.fbx', FBX_NO_TEXTURES);
    for (const root of [glb!.root, fbx!.root]) {
      expect(extractHierarchyNameBase(root.name)).toBe('level');
      expect(names(root).filter((name) => name === 'Wall')).toHaveLength(1);
      expect(names(root)).not.toContain('Result');
      expect(bounds(root)).toEqual(expected);
    }
  });
});
