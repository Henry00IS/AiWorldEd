import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { FbxImporter } from '@/io/fbx/import/fbx_importer.js';
import { GlbExporter } from '@/io/glb/glb_exporter.js';
import { GlbImporter } from '@/io/glb/import/glb_importer.js';
import { GlbImportTextureResolverChecker } from '@/io/glb/import/glb_import_texture_resolver_checker.js';
import type { FbxImportTextureResolver } from '@/io/fbx/import/fbx_import_types.js';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { ObjImporter } from '@/io/obj/obj_importer.js';
import { exportTargetFind } from '@/io/export/export_targets.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';
import { bounds, level } from './model_export_world_fixture.js';

const TARGETS = ['godot', 'unity', 'blender', 'unreal'] as const;

/** Gives every FBX texture the checker (the round trip checks geometry). */
const FBX_NO_TEXTURES: FbxImportTextureResolver = {
  resolve: async () => ({ textureIdByImage: new Map(), note: null }),
};

beforeEach(() => {
  mockObjectUrlApis();
});

describe.each(TARGETS)('round trip of %s exports through the editor importers', (targetId) => {
  const space = exportTargetFind(targetId).space;

  it.each(['binary', 'ascii'] as const)('FBX %s comes back in place and at size', async (encoding) => {
    const world = level();
    const pkg = await new FbxExporter().exportPackage(world, space, 'level', encoding, { mode: 'embedded' });
    const result = await new FbxImporter().importFromBytes(pkg.fbxBytes, 'level.fbx', FBX_NO_TEXTURES);
    expect(bounds(result!.root)).toEqual(bounds(world));
  });

  it('OBJ comes back in place and at size with the same Source Program', async () => {
    const world = level();
    const pkg = await new ObjExporter().exportPackage(world, space, 'level', { mode: 'copy', folder: '' });
    const result = new ObjImporter().importFromText(pkg.objText, 'level.obj', space);
    const group = new THREE.Group();
    result.meshes.forEach((mesh) => group.add(mesh));
    expect(bounds(group)).toEqual(bounds(world));
  });

  it('OBJ comes back in place and at size by its objmeta comment, whatever Source Program is set', async () => {
    const world = level();
    const pkg = await new ObjExporter().exportPackage(world, space, 'level', { mode: 'copy', folder: '' });
    for (const source of [null, exportTargetFind(targetId === 'blender' ? 'unity' : 'blender').space]) {
      const result = new ObjImporter().importFromText(pkg.objText, 'level.obj', source);
      expect(result.axesFromFile).toBe(true);
      const group = new THREE.Group();
      result.meshes.forEach((mesh) => group.add(mesh));
      expect(bounds(group)).toEqual(bounds(world));
    }
  });
});

describe('glTF round trip through the editor importer', () => {
  // glTF always holds meters with +Y up, whatever the target program.
  it('GLB comes back in place and at size', async () => {
    const world = level();
    const bytes = await new GlbExporter().export(world);
    const result = await new GlbImporter().importFromBytes(
      bytes,
      'level.glb',
      new GlbImportTextureResolverChecker('checker'),
    );
    expect(bounds(result!.root)).toEqual(bounds(world));
  });

  it('embedded glTF comes back in place and at size', async () => {
    const world = level();
    const pkg = await new GlbExporter().exportGltf(world, 'level', { mode: 'embedded' });
    const result = await new GlbImporter().importFromBytes(
      new TextEncoder().encode(pkg.text),
      'level.gltf',
      new GlbImportTextureResolverChecker('checker'),
    );
    expect(bounds(result!.root)).toEqual(bounds(world));
  });
});

describe('OBJ Source Program', () => {
  it('reads a Z-up centimeter OBJ without objmeta upright and in meters only when told so', async () => {
    const world = level();
    const unreal = exportTargetFind('unreal').space;
    const exported = await new ObjExporter().exportPackage(world, unreal, 'level', { mode: 'copy', folder: '' });
    // As another program writes it: no objmeta comment.
    const pkg = { objText: exported.objText.replace(/^# objmeta .*\n/m, '') };
    expect(new ObjImporter().importFromText(pkg.objText, 'level.obj', unreal).axesFromFile).toBe(false);
    const asDefault = new THREE.Group();
    new ObjImporter().importFromText(pkg.objText, 'level.obj', null).meshes.forEach((mesh) => asDefault.add(mesh));
    const height = new THREE.Box3().setFromObject(asDefault).getSize(new THREE.Vector3()).y;
    expect(height).toBeGreaterThan(100);
    const asUnreal = new THREE.Group();
    new ObjImporter().importFromText(pkg.objText, 'level.obj', unreal).meshes.forEach((mesh) => asUnreal.add(mesh));
    expect(new THREE.Box3().setFromObject(asUnreal).getSize(new THREE.Vector3()).y).toBeCloseTo(3.2, 4);
  });
});
