import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FbxImporter } from '@/io/fbx/import/fbx_importer.js';
import { FBX_IMPORT_MESH_USERDATA_KEY } from '@/io/fbx/import/scene/builder_fbx_import_hierarchy.js';
import type { FbxImportResult, FbxImportTexture, FbxImportTextureResolver } from '@/io/fbx/import/fbx_import_types.js';
import { readMeshDocumentFaceTextureId } from '@/mesh/convert/mesh_document_face_texture_sync.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { extractHierarchyNameBase } from '@/utils/utils_hierarchy_name_allocator.js';
import { pngHeaderCreate } from '../../../collaboration/session/texture_collaboration_fixture.js';
import {
  fbxFixtureEncodeAscii,
  fbxFixtureEncodeBinary,
  fbxFixtureProperty,
  fbxFixtureSceneRecords,
  type FbxFixtureGeometry,
  type FbxFixtureScene,
} from './fbx_import_fixture.js';

/**
 * Resolver giving texture i the id "fixture/<name>" and remembering what it
 * saw.
 */
class FixtureResolver implements FbxImportTextureResolver {
  seen: readonly FbxImportTexture[] = [];

  /**
   * Resolves fixture ids.
   *
   * @param textures Textures.
   * @returns Ids and no note.
   */
  async resolve(textures: readonly FbxImportTexture[]) {
    this.seen = textures;
    return {
      textureIdByImage: new Map(textures.map((texture) => [texture.index, `fixture/${texture.name}`])),
      note: null,
    };
  }
}

/**
 * Creates a unit quad in the XY plane (counter-clockwise seen from +Z).
 *
 * @param id Geometry id.
 * @returns Geometry.
 */
function quad(id: number): FbxFixtureGeometry {
  return {
    id,
    vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    polygons: [[0, 1, 2, 3]],
    uv: {
      mapping: 'ByPolygonVertex',
      reference: 'IndexToDirect',
      values: [0, 0, 1, 0, 1, 1, 0, 1],
      indices: [0, 1, 2, 3],
    },
  };
}

/**
 * Imports a fixture scene in every encoding and checks they agree.
 *
 * @param scene Scene.
 * @param resolver Texture resolver.
 * @returns Result of the ASCII import.
 */
async function importScene(
  scene: FbxFixtureScene,
  resolver: FbxImportTextureResolver = new FixtureResolver(),
): Promise<FbxImportResult> {
  const records = fbxFixtureSceneRecords(scene);
  const results: FbxImportResult[] = [];
  for (const bytes of [fbxFixtureEncodeAscii(records), fbxFixtureEncodeBinary(records, 7500, true)]) {
    const result = await new FbxImporter().importFromBytes(bytes, 'fixture.fbx', resolver);
    if (result === null) throw new Error('nothing imported');
    results.push(result);
  }
  const [ascii, binary] = results;
  if (ascii === undefined || binary === undefined) throw new Error('missing result');
  expect(worldCorners(binary.root)).toEqual(worldCorners(ascii.root));
  return ascii;
}

/**
 * Lists imported meshes under a root.
 *
 * @param root Root.
 * @returns Meshes.
 */
function importedMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse(
    (object) =>
      object instanceof THREE.Mesh && object.userData[FBX_IMPORT_MESH_USERDATA_KEY] === true && meshes.push(object),
  );
  return meshes;
}

/**
 * Lists the world-space document vertices of every imported mesh.
 *
 * @param root Root.
 * @returns Rounded positions per mesh name.
 */
function worldCorners(root: THREE.Object3D): Record<string, string[]> {
  root.updateMatrixWorld(true);
  const corners: Record<string, string[]> = {};
  importedMeshes(root).forEach((mesh) => {
    const positions = readPersistentMeshDocument(mesh)?.getTopology().getPositions() ?? [];
    const points: string[] = [];
    for (let index = 0; index + 2 < positions.length; index += 3) {
      const point = new THREE.Vector3(positions[index], positions[index + 1], positions[index + 2]).applyMatrix4(
        mesh.matrixWorld,
      );
      points.push(
        point
          .toArray()
          .map((value) => (Math.round(value * 1e4) / 1e4 + 0).toFixed(4))
          .join(' '),
      );
    }
    corners[extractHierarchyNameBase(mesh.name)] = points.sort();
  });
  return corners;
}

/**
 * Returns a face's world normal from its display triangles.
 *
 * @param mesh Mesh.
 * @returns Normal of the first display triangle.
 */
function firstTriangleNormal(mesh: THREE.Mesh): THREE.Vector3 {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const corner = (slot: number) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(slot) : slot);
  const [a, b, c] = [corner(0), corner(1), corner(2)].map((point) => point.applyMatrix4(mesh.matrixWorld));
  if (a === undefined || b === undefined || c === undefined) throw new Error('no triangle');
  return new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
}

describe('FbxImporter', () => {
  it('keeps the model hierarchy, names and transforms', async () => {
    const result = await importScene({
      models: [
        {
          id: 1,
          name: 'Building',
          parent: 0,
          kind: 'Null',
          properties: [fbxFixtureProperty('Lcl Translation', 'Lcl Translation', [1, 2, 3])],
        },
        {
          id: 2,
          name: 'Door',
          parent: 1,
          geometry: 10,
          properties: [fbxFixtureProperty('Lcl Rotation', 'Lcl Rotation', [0, 90, 0])],
        },
        { id: 3, name: 'Lamp', parent: 0, kind: 'Null' },
      ],
      geometries: [quad(10)],
    });
    expect(extractHierarchyNameBase(result.root.name)).toBe('Building');
    expect(result.root.position.toArray()).toEqual([1, 2, 3]);
    const [door] = importedMeshes(result.root);
    expect(extractHierarchyNameBase(door?.name ?? '')).toBe('Door');
    expect(
      door?.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)),
    ).toBeLessThan(1e-6);
    expect(result.importedMeshCount).toBe(1);
  });

  it('wraps several roots in a group named after the file', async () => {
    const result = await importScene({
      models: [
        { id: 1, name: 'A', parent: 0, geometry: 10 },
        {
          id: 2,
          name: 'B',
          parent: 0,
          geometry: 10,
          properties: [fbxFixtureProperty('Lcl Translation', 'Lcl Translation', [5, 0, 0])],
        },
      ],
      geometries: [quad(10)],
    });
    expect(extractHierarchyNameBase(result.root.name)).toBe('fixture');
    const [first, second] = importedMeshes(result.root).map(readPersistentMeshDocument);
    expect(first).not.toBe(second);
    expect(Object.keys(worldCorners(result.root)).sort()).toEqual(['A', 'B']);
  });

  it('keeps a planar n-gon as one editable face', async () => {
    const hexagon = Array.from({ length: 6 }, (_unused, corner) => [
      Math.cos((corner * Math.PI) / 3),
      0,
      -Math.sin((corner * Math.PI) / 3),
    ]).flat();
    const result = await importScene({
      models: [{ id: 1, name: 'Plate', parent: 0, geometry: 10 }],
      geometries: [{ id: 10, vertices: hexagon, polygons: [[0, 1, 2, 3, 4, 5]] }],
    });
    const [plate] = importedMeshes(result.root);
    expect(
      readPersistentMeshDocument(plate ?? new THREE.Mesh())
        ?.getTopology()
        .getFaceCount(),
    ).toBe(1);
    expect(result.importedPolygonCount).toBe(1);
  });

  it('gives each polygon the diffuse texture of its material slot', async () => {
    const resolver = new FixtureResolver();
    const geometry: FbxFixtureGeometry = {
      id: 10,
      vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, -1, 1, 0, -1],
      polygons: [
        [0, 1, 2, 3],
        [4, 5, 1, 0],
      ],
      polygonMaterials: [1, 0],
    };
    const result = await importScene(
      {
        models: [{ id: 1, name: 'Crate', parent: 0, geometry: 10, materials: [20, 21] }],
        geometries: [geometry],
        materials: [
          { id: 20, name: 'Wood', texture: { id: 30, videoId: 31, name: 'wood', file: 'textures\\wood.png' } },
          { id: 21, name: 'Plain' },
        ],
      },
      resolver,
    );
    const document = readPersistentMeshDocument(importedMeshes(result.root)[0] ?? new THREE.Mesh());
    const ids = Array.from({ length: document?.getTopology().getFaceCount() ?? 0 }, (_unused, face) =>
      document === null ? '' : readMeshDocumentFaceTextureId(document, face),
    );
    expect(ids.sort()).toEqual([DEFAULT_CHECKER_TEXTURE_ID, 'fixture/wood']);
    expect(resolver.seen.map((texture) => [texture.name, texture.references, texture.image])).toEqual([
      ['wood', ['textures\\wood.png'], null],
    ]);
  });

  it('reads embedded images', async () => {
    const resolver = new FixtureResolver();
    const png = pngHeaderCreate(4, 4);
    await importScene(
      {
        models: [{ id: 1, name: 'Sign', parent: 0, geometry: 10, materials: [20] }],
        geometries: [quad(10)],
        materials: [
          { id: 20, name: 'Paint', texture: { id: 30, videoId: 31, name: 'paint', file: 'paint.png', content: png } },
        ],
      },
      resolver,
    );
    const [texture] = resolver.seen;
    expect(texture?.image?.mimeType).toBe('image/png');
    expect([...(texture?.image?.bytes ?? [])]).toEqual([...png]);
  });

  it('reads per-vertex and per-corner UV sets the same way', async () => {
    const perVertex = quad(10);
    perVertex.uv = { mapping: 'ByControlPoint', reference: 'Direct', values: [0, 0, 1, 0, 1, 1, 0, 1] };
    const uvs = async (geometry: FbxFixtureGeometry) => {
      const result = await importScene({
        models: [{ id: 1, name: 'Q', parent: 0, geometry: 10 }],
        geometries: [geometry],
      });
      return Array.from(importedMeshes(result.root)[0]?.geometry.getAttribute('uv').array ?? []);
    };
    expect(await uvs(perVertex)).toEqual(await uvs(quad(10)));
  });

  it('converts Z-up centimeter files to Y-up meters', async () => {
    const result = await importScene({
      models: [
        {
          id: 1,
          name: 'Pole',
          parent: 0,
          geometry: 10,
          properties: [fbxFixtureProperty('Lcl Translation', 'Lcl Translation', [0, 0, 500])],
        },
      ],
      geometries: [{ id: 10, vertices: [0, 0, 0, 100, 0, 0, 0, -100, 0], polygons: [[0, 1, 2]] }],
      axes: { up: [2, 1], front: [1, -1], coord: [0, 1] },
      unitScaleFactor: 1,
    });
    expect(result.root.position.toArray().map((value) => value + 0)).toEqual([0, 5, 0]);
    expect(worldCorners(result.root)['Pole']).toEqual(
      ['0.0000 5.0000 0.0000', '0.0000 5.0000 1.0000', '1.0000 5.0000 0.0000'].sort(),
    );
  });

  it('keeps faces pointing outward when the axis system mirrors', async () => {
    const result = await importScene({
      models: [{ id: 1, name: 'Wall', parent: 0, geometry: 10 }],
      geometries: [quad(10)],
      axes: { up: [1, 1], front: [2, -1], coord: [0, 1] },
    });
    const [wall] = importedMeshes(result.root);
    expect(firstTriangleNormal(wall ?? new THREE.Mesh()).z).toBeCloseTo(-1, 6);
  });

  it('returns null for files without polygon meshes', async () => {
    const records = fbxFixtureSceneRecords({
      models: [{ id: 1, name: 'Camera', parent: 0, kind: 'Null' }],
      geometries: [],
    });
    expect(
      await new FbxImporter().importFromBytes(fbxFixtureEncodeAscii(records), 'empty.fbx', new FixtureResolver()),
    ).toBeNull();
  });
});
