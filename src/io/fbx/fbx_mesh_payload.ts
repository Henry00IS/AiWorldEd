import * as THREE from 'three';

/**
 * Local-space triangle mesh data ready for the FBX Geometry block: positions,
 * polygon vertex indices (last index of each triangle ones-complemented),
 * per-corner normals and UVs, and optional per-polygon material indices.
 */
export interface FbxMeshPayload {
  /** Flat position components in local mesh space (x,y,z,...). */
  positions: number[];
  /** FBX PolygonVertexIndex values (last corner of each poly is -(i+1)). */
  polygonVertexIndex: number[];
  /** Per-corner normals (ByPolygonVertex Direct), empty when missing. */
  cornerNormals: number[];
  /** Per-corner UVs with V flipped for DCC convention, empty when missing. */
  cornerUvs: number[];
  /**
   * Per-polygon material slot indices when multi-material; empty means AllSame
   * 0.
   */
  polygonMaterialIndices: number[];
  /** Number of material slots on the mesh (at least 1). */
  materialSlotCount: number;
}

/**
 * Builds an FBX mesh payload from a BufferGeometry. Vertices stay in local
 * space; hierarchy carries transforms.
 *
 * @param geometry Mesh geometry with position attribute.
 * @param materialSlotCount Number of materials on the mesh.
 * @param reverseTriangleWinding Whether to swap the second and third corner of
 *   every triangle.
 * @returns Payload for Geometry serialization, or null without positions.
 */
export function buildFbxMeshPayload(
  geometry: THREE.BufferGeometry,
  materialSlotCount: number,
  reverseTriangleWinding = false,
): FbxMeshPayload | null {
  const positionAttribute = geometry.getAttribute('position');
  if (!positionAttribute) return null;
  const positions = flattenVector3Attribute(positionAttribute);
  const sourceCornerIndices = collectTriangleCornerIndices(geometry, positionAttribute.count);
  const cornerIndices = reverseTriangleWinding
    ? buildReversedTriangleCornerIndices(sourceCornerIndices)
    : sourceCornerIndices;
  const polygonVertexIndex = encodePolygonVertexIndex(cornerIndices);
  const cornerNormals = expandAttributeByCorners(geometry.getAttribute('normal'), cornerIndices, 3, false);
  const cornerUvs = expandAttributeByCorners(geometry.getAttribute('uv'), cornerIndices, 2, true);
  const polygonMaterialIndices = buildPolygonMaterialIndices(
    geometry,
    cornerIndices.length / 3,
    Math.max(1, materialSlotCount),
  );
  return {
    positions,
    polygonVertexIndex,
    cornerNormals,
    cornerUvs,
    polygonMaterialIndices,
    materialSlotCount: Math.max(1, materialSlotCount),
  };
}

/**
 * Reverses the winding of each triangle without changing the source index list.
 *
 * @param cornerIndices Flat triangle corner index list.
 * @returns Copy of the corner list with each triangle's last two corners
 *   swapped.
 */
function buildReversedTriangleCornerIndices(cornerIndices: number[]): number[] {
  const reversed = cornerIndices.slice();
  for (let index = 0; index + 2 < reversed.length; index += 3) {
    const second = reversed[index + 1];
    const third = reversed[index + 2];
    if (second === undefined || third === undefined) continue;
    reversed[index + 1] = third;
    reversed[index + 2] = second;
  }
  return reversed;
}

/**
 * Copies a 3-component attribute into a flat number array.
 *
 * @param attribute Position or similar attribute.
 * @returns Flat xyz components.
 */
function flattenVector3Attribute(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number[] {
  const values: number[] = [];
  for (let index = 0; index < attribute.count; index++) {
    values.push(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
  }
  return values;
}

/**
 * Builds a list of vertex indices for every triangle corner.
 *
 * @param geometry Source geometry.
 * @param vertexCount Position attribute count (for non-indexed meshes).
 * @returns Flat corner index list (3 per triangle).
 */
function collectTriangleCornerIndices(geometry: THREE.BufferGeometry, vertexCount: number): number[] {
  const index = geometry.getIndex();
  if (index) {
    const corners: number[] = [];
    for (let i = 0; i < index.count; i++) {
      corners.push(index.getX(i));
    }
    return corners;
  }
  const corners: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    corners.push(i);
  }
  return corners;
}

/**
 * Converts triangle corner indices into FBX PolygonVertexIndex values.
 *
 * @param cornerIndices Flat triangle corner indices.
 * @returns PolygonVertexIndex array with last index of each poly negated.
 */
function encodePolygonVertexIndex(cornerIndices: number[]): number[] {
  const encoded: number[] = [];
  for (let i = 0; i + 2 < cornerIndices.length; i += 3) {
    const first = cornerIndices[i]!;
    const second = cornerIndices[i + 1]!;
    const third = cornerIndices[i + 2]!;
    encoded.push(first, second, -(third + 1));
  }
  return encoded;
}

/**
 * Expands a vertex attribute into per-corner values using triangle corners.
 *
 * @param attribute Source attribute, or undefined.
 * @param cornerIndices Triangle corner vertex indices.
 * @param componentCount Components to read per vertex (2 or 3).
 * @param flipV When true, writes UV with V as (1 - v).
 * @returns Flat per-corner components, or empty when attribute missing.
 */
function expandAttributeByCorners(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  cornerIndices: number[],
  componentCount: 2 | 3,
  flipV: boolean,
): number[] {
  if (!attribute) return [];
  const values: number[] = [];
  for (const vertexIndex of cornerIndices) {
    const u = attribute.getX(vertexIndex);
    const v = attribute.getY(vertexIndex);
    if (componentCount === 2) {
      values.push(u, flipV ? 1 - v : v);
      continue;
    }
    values.push(u, v, attribute.getZ(vertexIndex));
  }
  return values;
}

/**
 * Builds per-polygon material indices from geometry groups when multi-material.
 *
 * @param geometry Source geometry.
 * @param polygonCount Number of triangles.
 * @param materialSlotCount Material array length.
 * @returns Empty array for AllSame, otherwise one index per polygon.
 */
function buildPolygonMaterialIndices(
  geometry: THREE.BufferGeometry,
  polygonCount: number,
  materialSlotCount: number,
): number[] {
  if (polygonCount <= 0) return [];
  if (materialSlotCount <= 1 && geometry.groups.length === 0) return [];
  const indices = new Array<number>(polygonCount).fill(0);
  if (geometry.groups.length === 0) return indices;
  for (const group of geometry.groups) {
    const materialIndex = clampMaterialIndex(group.materialIndex ?? 0, materialSlotCount);
    const polygonStart = Math.max(0, Math.floor(group.start / 3));
    const groupPolygonCount = Math.max(0, Math.floor(group.count / 3));
    fillPolygonRange(indices, polygonStart, groupPolygonCount, materialIndex);
  }
  return indices;
}

/**
 * Clamps a material index into the valid slot range.
 *
 * @param materialIndex Raw material index.
 * @param materialSlotCount Slot count.
 * @returns Clamped index.
 */
function clampMaterialIndex(materialIndex: number, materialSlotCount: number): number {
  if (materialSlotCount <= 1) return 0;
  return Math.max(0, Math.min(materialSlotCount - 1, materialIndex));
}

/**
 * Fills a contiguous range of polygon material indices.
 *
 * @param indices Output array.
 * @param polygonStart First polygon index.
 * @param count Number of polygons to set.
 * @param materialIndex Material slot to assign.
 */
function fillPolygonRange(indices: number[], polygonStart: number, count: number, materialIndex: number): void {
  for (let offset = 0; offset < count; offset++) {
    const polygonIndex = polygonStart + offset;
    if (polygonIndex >= indices.length) break;
    indices[polygonIndex] = materialIndex;
  }
}
