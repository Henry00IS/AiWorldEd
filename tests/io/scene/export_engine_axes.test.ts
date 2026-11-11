import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { buildExportRootTransform, buildModelFileTransform } from '@/io/coordinates/coordinate_space_transform.js';
import { fbxImportDocumentParse, type FbxImportDocument } from '@/io/fbx/import/parse/fbx_import_document.js';
import { FbxImportProperties } from '@/io/fbx/import/parse/fbx_import_properties.js';
import { fbxImportObjectName } from '@/io/fbx/import/parse/fbx_import_node.js';
import { getBuiltInCoordinateSpace } from '@/settings/coordinate/coordinate_space_presets.js';
import type { BuiltInCoordinateSpaceId } from '@/settings/coordinate/coordinate_space_types.js';
import type { ExportSpace } from '@/io/coordinates/export_space.js';

/**
 * Builds a meter export space for a built-in coordinate space.
 *
 * @param id Preset id.
 * @returns Export space.
 */
function spaceFor(id: BuiltInCoordinateSpaceId): ExportSpace {
  return { coordinateSpace: getBuiltInCoordinateSpace(id)!, metricUnit: 'meter' };
}

/**
 * Builds a crate (1x2x3, pivot at a corner offset) at (2, 1, -3) with a child
 * marker 1.5 above it.
 *
 * @returns World group.
 */
function crateWorld(): THREE.Group {
  const world = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 2, 3).translate(0.5, 0, -1);
  const crate = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  crate.name = 'Crate';
  crate.position.set(2, 1, -3);
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
  marker.name = 'Marker';
  marker.position.set(0, 1.5, 0);
  crate.add(marker);
  world.add(crate);
  return world;
}

/**
 * Reads a model by name from an FBX document.
 *
 * @param document FBX document.
 * @param name Model name.
 * @returns Model id and properties.
 */
function fbxModel(document: FbxImportDocument, name: string) {
  const found = document.objectsOfType('Model').find(({ node }) => fbxImportObjectName(node.properties[1]) === name);
  if (!found) throw new Error(`no model ${name}`);
  return { id: found.id, properties: new FbxImportProperties(found.node) };
}

/**
 * Returns the signed volume of a closed polygon mesh (positive when faces wind
 * counter-clockwise seen from outside in a right-handed frame).
 *
 * @param positions Vertex positions.
 * @param polygons Polygon vertex index lists.
 * @returns Signed volume.
 */
function signedVolume(positions: readonly THREE.Vector3[], polygons: readonly number[][]): number {
  let volume = 0;
  for (const polygon of polygons) {
    for (let i = 1; i + 1 < polygon.length; i++) {
      const [a, b, c] = [polygon[0]!, polygon[i]!, polygon[i + 1]!].map((index) => positions[index]!);
      volume += a!.dot(new THREE.Vector3().crossVectors(b!, c!)) / 6;
    }
  }
  return volume;
}

/**
 * Reads the vertices and polygons of an FBX geometry.
 *
 * @param document FBX document.
 * @param modelId Model that owns the geometry.
 * @returns Positions and polygons.
 */
function fbxGeometry(document: FbxImportDocument, modelId: string) {
  const link = document.childrenOf(modelId).find(({ id }) => document.object(id)?.name === 'Geometry');
  const geometry = document.object(link!.id)!;
  const values = geometry.childArray('Vertices');
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < values.length; i += 3) positions.push(new THREE.Vector3(values[i], values[i + 1], values[i + 2]));
  const polygons: number[][] = [[]];
  for (const raw of geometry.childArray('PolygonVertexIndex')) {
    polygons[polygons.length - 1]!.push(raw < 0 ? -raw - 1 : raw);
    if (raw < 0) polygons.push([]);
  }
  polygons.pop();
  return { positions, polygons, bounds: new THREE.Box3().setFromPoints(positions) };
}

describe('model file axes for engines that import right-handed files', () => {
  it('writes Unity files in the editor axes, which Unity reads by negating X, without mirroring', () => {
    const matrix = buildModelFileTransform(spaceFor('unity'));
    expect(matrix.determinant()).toBeCloseTo(1);
    const point = new THREE.Vector3(2, 1, -3).applyMatrix4(matrix);
    expect(point.toArray().map((value) => value + 0)).toEqual([2, 1, -3]);
  });

  it('keeps the coordinate space mapping of right-handed targets and never mirrors', () => {
    const blender = spaceFor('blender');
    expect(buildModelFileTransform(blender).equals(buildExportRootTransform(blender))).toBe(true);
    for (const id of ['blender', 'unity', 'godot', 'unreal'] as BuiltInCoordinateSpaceId[]) {
      expect(buildModelFileTransform(spaceFor(id)).determinant()).toBeGreaterThan(0);
    }
    expect(buildModelFileTransform(null).equals(new THREE.Matrix4())).toBe(true);
  });

  it('FBX for Unity: no rotated or scaled nodes, positions and geometry converted, child meshes kept', () => {
    const bytes = new FbxExporter().exportBinary(crateWorld(), spaceFor('unity'));
    const document = fbxImportDocumentParse(bytes);
    for (const { node } of document.objectsOfType('Model')) {
      const properties = new FbxImportProperties(node);
      expect(properties.vector3('Lcl Rotation', [0, 0, 0]).map((v) => v + 0)).toEqual([0, 0, 0]);
      expect(properties.vector3('Lcl Scaling', [1, 1, 1])).toEqual([1, 1, 1]);
    }
    const crate = fbxModel(document, 'Crate');
    expect(crate.properties.vector3('Lcl Translation', [0, 0, 0]).map((v) => v + 0)).toEqual([2, 1, -3]);
    const marker = fbxModel(document, 'Marker');
    expect(document.parentsOf(marker.id).map(({ id }) => id)).toContain(crate.id);
    expect(marker.properties.vector3('Lcl Translation', [0, 0, 0]).map((v) => v + 0)).toEqual([0, 1.5, 0]);
    const { positions, polygons, bounds } = fbxGeometry(document, crate.id);
    expect(bounds.min.toArray().map((v) => v + 0)).toEqual([0, -1, -2.5]);
    expect(bounds.max.toArray().map((v) => v + 0)).toEqual([1, 1, 0.5]);
    // Faces still wind outward: no mirror slipped in.
    expect(signedVolume(positions, polygons)).toBeCloseTo(6);
  });

  it('OBJ for Unity: vertices in the editor axes, faces wind outward', () => {
    const text = new ObjExporter().export(crateWorld(), spaceFor('unity'));
    const lines = text.split('\n');
    const positions = lines
      .filter((line) => line.startsWith('v '))
      .map((line) => new THREE.Vector3(...line.split(/\s+/).slice(1, 4).map(Number)));
    const objects = lines.flatMap((line, index) => (line.startsWith('o ') ? [index] : []));
    const crateCount = lines.slice(objects[0], objects[1]).filter((line) => line.startsWith('v ')).length;
    expect(crateCount).toBe(8);
    const crate = positions.slice(0, crateCount);
    const bounds = new THREE.Box3().setFromPoints(crate);
    expect(bounds.min.toArray().map((v) => v + 0)).toEqual([2, 0, -5.5]);
    expect(bounds.max.toArray().map((v) => v + 0)).toEqual([3, 2, -2.5]);
    const polygons = lines
      .filter((line) => line.startsWith('f '))
      .map((line) =>
        line
          .split(/\s+/)
          .slice(1)
          .map((corner) => Number(corner.split('/')[0]) - 1),
      );
    expect(signedVolume(positions, polygons)).toBeCloseTo(6 + 0.008);
  });
});
