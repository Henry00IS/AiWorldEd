import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFbxMeshPayload } from '@/io/fbx/fbx_mesh_payload.js';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { GlbExporter } from '@/io/glb/glb_exporter.js';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { exportTargetFind } from '@/io/export/export_targets.js';
import { modelExportWeldGeometry } from '@/io/export/model_export_weld.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';

const TARGETS = ['godot', 'unity', 'blender', 'unreal'] as const;

/**
 * Builds a cube as the CSG result comes: one vertex per triangle corner.
 *
 * @returns Non-indexed cube geometry.
 */
function splitCube(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
}

/**
 * Reads one corner of an attribute.
 *
 * @param attribute Attribute.
 * @param index Vertex index.
 * @returns Rounded components.
 */
function at(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number): string {
  const values = [attribute.getX(index), attribute.getY(index)];
  if (attribute.itemSize > 2) values.push(attribute.getZ(index));
  return values.map((value) => (value + 0).toFixed(5)).join(',');
}

/**
 * Lists each triangle corner's position, normal and UV of a geometry.
 *
 * @param geometry Geometry.
 * @returns One string per corner.
 */
function corners(geometry: THREE.BufferGeometry): string[] {
  const index = geometry.getIndex();
  const count = index ? index.count : geometry.getAttribute('position').count;
  return Array.from({ length: count }, (_, corner) => {
    const vertex = index ? index.getX(corner) : corner;
    return ['position', 'normal', 'uv'].map((name) => at(geometry.getAttribute(name), vertex)).join(' ');
  });
}

/**
 * Builds a level with a box that has a box cut out of it.
 *
 * @returns World group.
 */
function cutLevel(): THREE.Group {
  const world = new THREE.Group();
  const model = new SolidModel('Cut');
  model.addBoxBrush(2, SolidOperation.Additive);
  const hole = model.addBoxBrush(1, SolidOperation.Subtractive);
  hole.mesh!.position.set(0.5, 0.5, 0.5);
  model.rebuild?.();
  model.root.position.set(1, 2, 3);
  model.root.rotation.y = 0.4;
  world.add(model.root);
  world.updateMatrixWorld(true);
  return world;
}

beforeEach(() => mockObjectUrlApis());

describe('model export welding', () => {
  it('welds FBX control points by position and keeps normals and UVs per corner', () => {
    const geometry = splitCube();
    const payload = buildFbxMeshPayload(geometry, 1)!;
    expect(payload.positions.length / 3).toBe(8);
    const corner = (i: number) => {
      const encoded = payload.polygonVertexIndex[i]!;
      const point = encoded < 0 ? -encoded - 1 : encoded;
      const position = payload.positions.slice(point * 3, point * 3 + 3);
      const normal = payload.cornerNormals.slice(i * 3, i * 3 + 3);
      const uv = payload.cornerUvs.slice(i * 2, i * 2 + 2);
      return [position, normal, uv].map((values) => values.map((value) => (value + 0).toFixed(5)).join(',')).join(' ');
    };
    expect(payload.polygonVertexIndex.map((_, i) => corner(i))).toEqual(corners(geometry));
  });

  it('dedupes OBJ v, vt and vn separately and shares their indices', () => {
    const world = new THREE.Group();
    world.add(new THREE.Mesh(splitCube(), new THREE.MeshStandardMaterial()));
    const text = new ObjExporter().export(world);
    const lines = text.split('\n');
    const of = (prefix: string) =>
      lines
        .filter((line) => line.startsWith(`${prefix} `))
        .map((line) =>
          line
            .slice(prefix.length + 1)
            .split(' ')
            .map(Number),
        );
    const [v, vt, vn] = [of('v'), of('vt'), of('vn')];
    expect([v.length, vt.length, vn.length]).toEqual([8, 4, 6]);
    const written = lines
      .filter((line) => line.startsWith('f '))
      .flatMap((line) => line.slice(2).split(' '))
      .map((token) => {
        const [a, b, c] = token.split('/').map(Number);
        return [v[a! - 1]!, vn[c! - 1]!, vt[b! - 1]!]
          .map((values) => values.map((value) => (value + 0).toFixed(5)).join(','))
          .join(' ');
      });
    expect(written).toEqual(corners(splitCube()));
  });

  it('welds only glTF corners identical in every attribute into an indexed mesh', () => {
    const geometry = splitCube();
    geometry.addGroup(0, 18, 0);
    geometry.addGroup(18, 18, 1);
    const welded = modelExportWeldGeometry(geometry);
    expect(welded.getAttribute('position').count).toBe(24);
    expect(welded.getIndex()!.count).toBe(36);
    expect(corners(welded)).toEqual(corners(geometry));
    expect(welded.groups).toEqual(geometry.groups);
  });

  it('writes indexed glTF meshes with fewer vertices than corners', async () => {
    const world = new THREE.Group();
    world.add(new THREE.Mesh(splitCube(), new THREE.MeshStandardMaterial()));
    const pkg = await new GlbExporter().exportGltf(world, 'cube', { mode: 'embedded' });
    const json = JSON.parse(pkg.text) as {
      meshes: { primitives: { attributes: { POSITION: number }; indices?: number }[] }[];
      accessors: { count: number }[];
    };
    const primitive = json.meshes[0]!.primitives[0]!;
    expect(json.accessors[primitive.attributes.POSITION]!.count).toBe(24);
    expect(json.accessors[primitive.indices!]!.count).toBe(36);
  });

  it.each(TARGETS)('welds a CSG cut level for %s FBX and OBJ without moving a corner', async (targetId) => {
    const target = exportTargetFind(targetId);
    const fbx = await new FbxExporter().exportPackage(cutLevel(), target.space, 'cut', 'ascii', { mode: 'embedded' });
    const text = new TextDecoder().decode(fbx.fbxBytes);
    const numbers = (name: string) =>
      new RegExp(`${name}: \\*\\d+ \\{\\s*a: ([^}]*)\\}`).exec(text)![1]!.split(',').map(Number);
    const points = numbers('Vertices');
    const polygon = numbers('PolygonVertexIndex');
    expect(points.length / 3).toBeLessThan(polygon.length / 2);
    const obj = await new ObjExporter().exportPackage(cutLevel(), target.objSpace, 'cut', { mode: 'copy', folder: '' });
    const lines = obj.objText.split('\n');
    const vertexLines = lines.filter((line) => line.startsWith('v ')).length;
    const cornerCount = lines.filter((line) => line.startsWith('f ')).length * 3;
    expect(vertexLines).toBeLessThan(cornerCount / 2);
  });
});
