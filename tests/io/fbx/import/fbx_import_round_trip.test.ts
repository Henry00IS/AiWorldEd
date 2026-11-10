import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { contentMeshImportCreate, contentMeshImportFinalize } from '@/io/geometry/content_mesh_import.js';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { FbxImporter } from '@/io/fbx/import/fbx_importer.js';
import { FBX_IMPORT_MESH_USERDATA_KEY } from '@/io/fbx/import/scene/builder_fbx_import_hierarchy.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { extractHierarchyNameBase } from '@/utils/utils_hierarchy_name_allocator.js';
import { readMeshDocumentFaceTextureId } from '@/mesh/convert/mesh_document_face_texture_sync.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { FbxExportEncoding } from '@/io/fbx/fbx_export_types.js';
import type { FbxImportTextureResolver } from '@/io/fbx/import/fbx_import_types.js';

/**
 * Resolver that links each FBX texture to "fixture/<name>" and records what it
 * was asked for.
 *
 * @returns Resolver and its log.
 */
function fixtureResolver() {
  const seen: { name: string; references: string[] }[] = [];
  const resolver: FbxImportTextureResolver = {
    resolve: async (textures) => {
      textures.forEach((texture) => seen.push({ name: texture.name, references: texture.references }));
      return {
        textureIdByImage: new Map(textures.map((texture) => [texture.index, `fixture/${texture.name}`])),
        note: null,
      };
    },
  };
  return { resolver, seen };
}

/**
 * Builds a content box mesh like the importers do.
 *
 * @param name Name.
 * @param size Edge lengths.
 * @param position Local position.
 * @param rotation Local rotation.
 * @returns Mesh.
 */
function contentBox(
  name: string,
  size: THREE.Vector3,
  position: THREE.Vector3,
  rotation = new THREE.Euler(),
): THREE.Mesh {
  const mesh = contentMeshImportCreate(createMeshDocumentBox(size.x, size.y, size.z), name, 'roundTripTest');
  mesh.position.copy(position);
  mesh.rotation.copy(rotation);
  return mesh;
}

/**
 * Summarizes every mesh by base name: its world-space display corners (position
 * and UV) and its document face count.
 *
 * @param root Root.
 * @returns Base name to summary.
 */
function meshSummary(root: THREE.Object3D): Map<string, string> {
  root.updateMatrixWorld(true);
  const summary = new Map<string, string>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || readPersistentMeshDocument(object) === null) return;
    const position = object.geometry.getAttribute('position');
    const uv = object.geometry.getAttribute('uv');
    const corners = new Set<string>();
    for (let index = 0; index < position.count; index++) {
      const world = new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      const values = [...world.toArray(), uv.getX(index), uv.getY(index)];
      corners.add(values.map((value) => (Math.round(value * 1e4) / 1e4 + 0).toFixed(4)).join(' '));
    }
    const document = readPersistentMeshDocument(object);
    const faces = document?.getTopology().getFaceCount() ?? 0;
    summary.set(extractHierarchyNameBase(object.name), `faces=${faces} ${[...corners].sort().join(' | ')}`);
  });
  return summary;
}

/**
 * Lists each mesh's face texture ids by base name.
 *
 * @param root Root.
 * @returns Base name to sorted unique texture ids.
 */
function meshTextures(root: THREE.Object3D): Map<string, string[]> {
  const textures = new Map<string, string[]>();
  root.traverse((object) => {
    const document = object instanceof THREE.Mesh ? readPersistentMeshDocument(object) : null;
    if (document === null) return;
    const ids = Array.from({ length: document.getTopology().getFaceCount() }, (_unused, face) =>
      readMeshDocumentFaceTextureId(document, face),
    );
    textures.set(extractHierarchyNameBase(object.name), [...new Set(ids)].sort());
  });
  return textures;
}

/**
 * Builds a small level: a rotated room holding a textured crate and a pillar,
 * and a floor at the top level.
 *
 * @returns World group.
 */
function levelCreate(): THREE.Group {
  const world = new THREE.Group();
  const room = new THREE.Group();
  room.name = 'Room';
  room.position.set(2, 0, -3);
  room.rotation.set(0.3, 0.5, 0.7);
  const crate = contentBox(
    'Crate',
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(0.5, 0.5, 0),
    new THREE.Euler(-0.4, 0.2, 1.1),
  );
  room.add(crate, contentBox('Pillar', new THREE.Vector3(0.5, 3, 0.5), new THREE.Vector3(-2, 1.5, 1)));
  world.add(room, contentBox('Floor', new THREE.Vector3(10, 0.2, 10), new THREE.Vector3(0, -0.1, 0)));
  world.updateMatrixWorld(true);
  world.traverse((object) => object instanceof THREE.Mesh && contentMeshImportFinalize(object, false));
  const map = new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(200), 4, 4);
  map.name = 'textures/brick.png';
  crate.material = new THREE.MeshStandardMaterial({ name: 'Brick', map });
  return world;
}

/**
 * Exports a level in one encoding and imports it back.
 *
 * @param world Level.
 * @param encoding File encoding.
 * @returns Import result and the textures the resolver saw.
 */
async function roundTrip(world: THREE.Group, encoding: FbxExportEncoding) {
  const exporter = new FbxExporter();
  const bytes =
    encoding === 'binary' ? exporter.exportBinary(world) : new TextEncoder().encode(exporter.exportAscii(world));
  const { resolver, seen } = fixtureResolver();
  const result = await new FbxImporter().importFromBytes(bytes, 'level.fbx', resolver);
  if (result === null) throw new Error('nothing imported');
  return { root: result.root, seen };
}

describe('FBX export and import round trip', () => {
  it.each(['binary', 'ascii'] as const)(
    'brings back hierarchy, names, world placement, UVs, faces and textures (%s)',
    async (encoding) => {
      const world = levelCreate();
      const { root, seen } = await roundTrip(world, encoding);
      expect(meshSummary(root)).toEqual(meshSummary(world));
      expect(extractHierarchyNameBase(root.name)).toBe('level');
      const parents: string[] = [];
      root.traverse((object) => {
        if (object.userData[FBX_IMPORT_MESH_USERDATA_KEY] === true)
          parents.push(extractHierarchyNameBase(object.parent?.name ?? ''));
      });
      expect(parents.sort()).toEqual(['Room', 'Room', 'level']);
      expect(seen).toEqual([{ name: 'brick', references: ['brick.png'] }]);
      expect(meshTextures(root)).toEqual(
        new Map([
          ['Crate', ['fixture/brick']],
          ['Pillar', [DEFAULT_CHECKER_TEXTURE_ID]],
          ['Floor', [DEFAULT_CHECKER_TEXTURE_ID]],
        ]),
      );
    },
  );

  it('imports binary and ASCII exports of the same level identically', async () => {
    const world = levelCreate();
    const binary = await roundTrip(world, 'binary');
    const ascii = await roundTrip(world, 'ascii');
    expect(meshSummary(binary.root)).toEqual(meshSummary(ascii.root));
    expect(meshTextures(binary.root)).toEqual(meshTextures(ascii.root));
    expect(binary.seen).toEqual(ascii.seen);
  });
});
