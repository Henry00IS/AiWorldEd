import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GlbImporter } from '@/io/glb/import/glb_importer.js';
import { GLB_IMPORT_MESH_USERDATA_KEY } from '@/io/glb/import/builder_glb_import_hierarchy.js';
import { GlbImportTextureResolverChecker } from '@/io/glb/import/glb_import_texture_resolver_checker.js';
import type { GlbImportResult } from '@/io/glb/import/glb_import_types.js';
import { readMeshDocumentFaceTextureId } from '@/mesh/convert/mesh_document_face_texture_sync.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { pngHeaderCreate } from '../../../collaboration/session/texture_collaboration_fixture.js';
import { GLB_FIXTURE_RESOLVER, glbFixtureEncode, glbFixtureQuad, type GlbFixtureSpec } from './glb_import_fixture.js';

/**
 * Imports a fixture with the fixture resolver.
 *
 * @param spec Fixture content.
 * @param name File name.
 * @returns Import result.
 */
async function importFixture(spec: GlbFixtureSpec, name = 'fixture.glb'): Promise<GlbImportResult> {
  const result = await new GlbImporter().importFromBytes(glbFixtureEncode(spec), name, GLB_FIXTURE_RESOLVER);
  if (result === null) throw new Error('nothing imported');
  return result;
}

/**
 * Lists the imported meshes under a root.
 *
 * @param root Import root.
 * @returns Meshes in traversal order.
 */
function importedMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData[GLB_IMPORT_MESH_USERDATA_KEY] === true) meshes.push(object);
  });
  return meshes;
}

/**
 * Reads the texture ids of a mesh's document faces.
 *
 * @param mesh Imported mesh.
 * @returns Texture id per face.
 */
function faceTextureIds(mesh: THREE.Mesh): string[] {
  const document = readPersistentMeshDocument(mesh);
  if (document === null) return [];
  const faceCount = document.getTopology().getFaceCount();
  return Array.from({ length: faceCount }, (_unused, face) => readMeshDocumentFaceTextureId(document, face));
}

/**
 * Collects the distinct (u, v) pairs of a mesh's display UVs.
 *
 * @param mesh Mesh.
 * @returns Sorted rounded pairs.
 */
function displayUvPairs(mesh: THREE.Mesh): string[] {
  const uv = mesh.geometry.getAttribute('uv');
  const pairs = new Set<string>();
  for (let index = 0; index < uv.count; index++)
    pairs.add(`${uv.getX(index).toFixed(3)},${uv.getY(index).toFixed(3)}`.replaceAll('-0.000', '0.000'));
  return [...pairs].sort();
}

describe('GlbImporter', () => {
  it('keeps the node hierarchy, names and transforms', async () => {
    const result = await importFixture({
      nodes: [
        { name: 'Building', translation: [1, 2, 3], children: [1] },
        { name: 'Door', mesh: 0, rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], scale: [2, 2, 2] },
      ],
      meshes: [{ name: 'DoorMesh', primitives: [glbFixtureQuad(1)] }],
    });
    expect(result.root.name.startsWith('Building')).toBe(true);
    expect(result.root.position.toArray()).toEqual([1, 2, 3]);
    const [door] = importedMeshes(result.root);
    expect(door?.name.startsWith('Door')).toBe(true);
    expect(door?.parent).toBe(result.root);
    expect(door?.scale.toArray()).toEqual([2, 2, 2]);
    expect(door?.quaternion.y).toBeCloseTo(Math.SQRT1_2);
    expect(result.importedMeshCount).toBe(1);
    expect(result.importedTriangleCount).toBe(2);
  });

  it('applies a node matrix and groups several scene roots under the file name', async () => {
    const matrix = new THREE.Matrix4().makeTranslation(4, 0, -2).toArray();
    const result = await importFixture(
      {
        nodes: [
          { name: 'A', mesh: 0, matrix },
          { name: 'B', mesh: 0 },
        ],
        meshes: [{ primitives: [glbFixtureQuad(1)] }],
        sceneNodes: [0, 1],
      },
      'yard.glb',
    );
    expect(result.root.name.startsWith('yard')).toBe(true);
    const meshes = importedMeshes(result.root);
    expect(meshes.map((mesh) => mesh.position.toArray())).toEqual([
      [4, 0, -2],
      [0, 0, 0],
    ]);
    expect(readPersistentMeshDocument(meshes[0] ?? new THREE.Mesh())).not.toBe(
      readPersistentMeshDocument(meshes[1] ?? new THREE.Mesh()),
    );
  });

  it('merges a quad into one polygon face', async () => {
    const result = await importFixture({ nodes: [{ mesh: 0 }], meshes: [{ primitives: [glbFixtureQuad(2)] }] });
    const [mesh] = importedMeshes(result.root);
    expect(
      readPersistentMeshDocument(mesh ?? new THREE.Mesh())
        ?.getTopology()
        .getFaceCount(),
    ).toBe(1);
  });

  it('turns materials into per-face textures and keeps both primitives', async () => {
    const result = await importFixture({
      nodes: [{ name: 'Tunnel', mesh: 0 }],
      meshes: [{ primitives: [glbFixtureQuad(1, 0, 0), glbFixtureQuad(1, 5, 1)] }],
      materials: [
        { name: 'wall', image: 0 },
        { name: 'floor', image: 1 },
      ],
      images: [{ name: 'wall', bytes: pngHeaderCreate(8, 8) }, { bytes: pngHeaderCreate(4, 4) }],
    });
    const [mesh] = importedMeshes(result.root);
    if (mesh === undefined) throw new Error('no mesh');
    expect(faceTextureIds(mesh).sort()).toEqual(['fixture/floor.png', 'fixture/wall.png']);
    const mapped = new Set(getFaceTextureMaps(mesh).map((entry) => entry.mapping.textureId));
    expect(mapped).toEqual(new Set(['fixture/floor.png', 'fixture/wall.png']));
    expect(Array.isArray(mesh.material) && mesh.material.length).toBe(2);
    expect(result.textureNote).toBe('2 image(s)');
  });

  it('maps glTF UVs to editor UVs with v flipped', async () => {
    const result = await importFixture({
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ ...glbFixtureQuad(1, 0, 0), uvs: [0, 1, 0.5, 1, 0.5, 0.75, 0, 0.75] }] }],
      materials: [{ image: 0 }],
      images: [{ name: 'brick', bytes: pngHeaderCreate(8, 8) }],
    });
    const [mesh] = importedMeshes(result.root);
    expect(displayUvPairs(mesh ?? new THREE.Mesh())).toEqual([
      '0.000,0.000',
      '0.000,0.250',
      '0.500,0.000',
      '0.500,0.250',
    ]);
  });

  it('uses the checker for meshes without materials or UVs', async () => {
    const result = await importFixture({
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] }] }],
    });
    const [mesh] = importedMeshes(result.root);
    expect(faceTextureIds(mesh ?? new THREE.Mesh())).toEqual([DEFAULT_CHECKER_TEXTURE_ID]);
    expect(result.importedTriangleCount).toBe(1);
    expect(result.textureNote).toBeNull();
  });

  it('reads triangle strips and fans and skips points and lines', async () => {
    const strip = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], mode: 5 };
    const fan = { positions: [0, 0, 2, 1, 0, 2, 1, 1, 2, 0, 1, 2], mode: 6 };
    const points = { positions: [0, 0, 0, 1, 0, 0], mode: 0 };
    const lines = { positions: [0, 0, 0, 1, 0, 0], mode: 1 };
    const result = await importFixture({ nodes: [{ mesh: 0 }], meshes: [{ primitives: [strip, fan, points, lines] }] });
    expect(result.importedTriangleCount).toBe(4);
  });

  it('returns null when the file has no triangle meshes', async () => {
    const data = glbFixtureEncode({ nodes: [{ name: 'Empty' }], meshes: [] });
    expect(await new GlbImporter().importFromBytes(data, 'empty.glb', GLB_FIXTURE_RESOLVER)).toBeNull();
  });

  it('explains when embedded images stay on the checker', async () => {
    const spec: GlbFixtureSpec = {
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [glbFixtureQuad(1, 0, 0)] }],
      materials: [{ image: 0 }],
      images: [{ bytes: pngHeaderCreate(8, 8) }],
    };
    const resolver = new GlbImportTextureResolverChecker('no project');
    const result = await new GlbImporter().importFromBytes(glbFixtureEncode(spec), 'a.glb', resolver);
    expect(result?.textureNote).toBe('no project');
    expect(faceTextureIds(importedMeshes(result?.root ?? new THREE.Group())[0] ?? new THREE.Mesh())).toEqual([
      DEFAULT_CHECKER_TEXTURE_ID,
    ]);
  });

  it('rejects data that is not glTF', async () => {
    await expect(
      new GlbImporter().importFromBytes(new TextEncoder().encode('hello'), 'x.glb', GLB_FIXTURE_RESOLVER),
    ).rejects.toThrow();
  });
});
