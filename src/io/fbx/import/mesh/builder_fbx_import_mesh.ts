import * as THREE from 'three';
import {
  contentMeshTriangleSoupCreate,
  contentMeshTriangleSoupDocument,
  type ContentMeshSoupDocument,
  type ContentMeshTriangleSoup,
} from '@/io/geometry/content_mesh_triangle_soup.js';
import { triangulateSimplePolygon3d } from '@/mesh/convert/mesh_polygon_triangulate.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { FbxImportNode } from '@/io/fbx/import/parse/fbx_import_node.js';
import { FbxImportLayerElement, type FbxImportCorner } from './fbx_import_layer_element.js';

/** Editable document built from one FBX geometry, with its polygon count. */
export interface FbxImportMeshDocument extends ContentMeshSoupDocument {
  /** Polygons read from the file. */
  polygonCount: number;
}

/** Per-geometry inputs shared by every polygon. */
interface FbxImportMeshSource {
  vertices: Float64Array;
  vertexMatrix: THREE.Matrix4;
  mirrored: boolean;
  uvLayer: FbxImportLayerElement | null;
  materialLayer: FbxImportLayerElement | null;
  slotTextureIds: readonly string[];
}

/**
 * Builds editable polygon documents from FBX mesh geometry: every polygon is
 * triangulated, welded with its neighbours and merged back into convex coplanar
 * faces; the first UV set becomes corner UVs and material slots become per-face
 * texture ids.
 */
export class FbxImportMeshBuilder {
  /**
   * Builds the document of a geometry.
   *
   * @param geometry Geometry record ("Mesh" class).
   * @param vertexMatrix Matrix applied to every vertex (geometric transform and
   *   axis conversion).
   * @param slotTextureIds Texture id per material slot of the model.
   * @returns Document, or null when the geometry has no usable polygons.
   */
  build(
    geometry: FbxImportNode,
    vertexMatrix: THREE.Matrix4,
    slotTextureIds: readonly string[],
  ): FbxImportMeshDocument | null {
    const source = fbxImportMeshSourceRead(geometry, vertexMatrix, slotTextureIds);
    const soup = contentMeshTriangleSoupCreate();
    soup.hasTextureCoordinates = source.uvLayer !== null;
    const polygonCount = fbxImportPolygonsVisit(geometry.childArray('PolygonVertexIndex'), (corners) =>
      fbxImportPolygonAppend(soup, source, corners),
    );
    const built = soup.triangleIndices.length === 0 ? null : contentMeshTriangleSoupDocument(soup);
    return built === null ? null : { ...built, polygonCount };
  }
}

/**
 * Reads the per-geometry inputs.
 *
 * @param geometry Geometry record.
 * @param vertexMatrix Matrix applied to every vertex.
 * @param slotTextureIds Texture id per material slot.
 * @returns Source.
 */
function fbxImportMeshSourceRead(
  geometry: FbxImportNode,
  vertexMatrix: THREE.Matrix4,
  slotTextureIds: readonly string[],
): FbxImportMeshSource {
  const uvNode = FbxImportLayerElement.lowest(geometry, 'LayerElementUV');
  const materialNode = FbxImportLayerElement.lowest(geometry, 'LayerElementMaterial');
  return {
    vertices: geometry.childArray('Vertices'),
    vertexMatrix,
    mirrored: vertexMatrix.determinant() < 0,
    uvLayer: uvNode === null ? null : new FbxImportLayerElement(uvNode, 'UV', 'UVIndex'),
    materialLayer: materialNode === null ? null : new FbxImportLayerElement(materialNode, 'Materials', ''),
    slotTextureIds,
  };
}

/**
 * Splits a polygon vertex index into polygons (a negative entry ends a polygon
 * and stores the bitwise complement of its vertex) and visits each one.
 *
 * @param polygonVertexIndex Polygon vertex index values.
 * @param visit Called with the corners of each polygon.
 * @returns Number of polygons visited.
 */
function fbxImportPolygonsVisit(polygonVertexIndex: Float64Array, visit: (corners: FbxImportCorner[]) => void): number {
  let corners: FbxImportCorner[] = [];
  let polygonIndex = 0;
  polygonVertexIndex.forEach((value, cornerIndex) => {
    const controlPoint = value < 0 ? -value - 1 : value;
    corners.push({ cornerIndex, controlPoint, polygonIndex });
    if (value >= 0) return;
    visit(corners);
    corners = [];
    polygonIndex++;
  });
  return polygonIndex;
}

/**
 * Appends one polygon's corners and triangles to the soup.
 *
 * @param soup Growing soup.
 * @param source Geometry inputs.
 * @param corners Polygon corners.
 */
function fbxImportPolygonAppend(
  soup: ContentMeshTriangleSoup,
  source: FbxImportMeshSource,
  corners: readonly FbxImportCorner[],
): void {
  const points = corners
    .map((corner) => fbxImportCornerPosition(source, corner.controlPoint))
    .filter((point): point is THREE.Vector3 => point !== null);
  if (points.length !== corners.length || points.length < 3) return;
  const triangles = triangulateSimplePolygon3d(points);
  if (triangles.length === 0) return;
  const firstVertex = soup.positions.length / 3;
  points.forEach((point) => soup.positions.push(point.x, point.y, point.z));
  corners.forEach((corner) => soup.vertexUvs.push(...fbxImportCornerUv(source, corner)));
  const textureId = fbxImportPolygonTextureId(source, corners[0]);
  for (let triangle = 0; triangle + 2 < triangles.length; triangle += 3) {
    const [a, b, c] = [triangles[triangle] ?? 0, triangles[triangle + 1] ?? 0, triangles[triangle + 2] ?? 0];
    soup.triangleIndices.push(...(source.mirrored ? [a, c, b] : [a, b, c]).map((corner) => firstVertex + corner));
    soup.triangleTextureIds.push(textureId);
  }
}

/**
 * Returns a control point's converted position.
 *
 * @param source Geometry inputs.
 * @param controlPoint Control point index.
 * @returns Position, or null when the index is out of range.
 */
function fbxImportCornerPosition(source: FbxImportMeshSource, controlPoint: number): THREE.Vector3 | null {
  const x = source.vertices[controlPoint * 3];
  const y = source.vertices[controlPoint * 3 + 1];
  const z = source.vertices[controlPoint * 3 + 2];
  if (x === undefined || y === undefined || z === undefined) return null;
  return new THREE.Vector3(x, y, z).applyMatrix4(source.vertexMatrix);
}

/**
 * Returns a corner's texture coordinate (FBX and the editor both grow V
 * upward).
 *
 * @param source Geometry inputs.
 * @param corner Polygon corner.
 * @returns U and v, zeros without a UV set.
 */
function fbxImportCornerUv(source: FbxImportMeshSource, corner: FbxImportCorner): [number, number] {
  const layer = source.uvLayer;
  if (layer === null) return [0, 0];
  const element = layer.elementIndex(corner);
  return [layer.data[element * 2] ?? 0, layer.data[element * 2 + 1] ?? 0];
}

/**
 * Returns the texture id of a polygon's material slot.
 *
 * @param source Geometry inputs.
 * @param corner First corner of the polygon.
 * @returns Texture id, the checker when the slot has no texture.
 */
function fbxImportPolygonTextureId(source: FbxImportMeshSource, corner: FbxImportCorner | undefined): string {
  const layer = source.materialLayer;
  const slot = layer === null || corner === undefined ? 0 : (layer.data[layer.elementIndex(corner)] ?? 0);
  return source.slotTextureIds[slot] ?? DEFAULT_CHECKER_TEXTURE_ID;
}
