import * as THREE from 'three';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import { writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { Theme } from '@/theme.js';
import { enableFlatShadingOnMesh, rebuildDecorativeEdges } from '@/utils/mesh_edge_sync.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import type {
  ObjParseResult,
  ObjParsedFace,
  ObjParsedObject,
  ObjParsedPosition,
  ObjParsedTexCoord,
} from './obj_parse_types.js';

/**
 * Builds editor content meshes from a parsed OBJ document using the mesh
 * document pipeline (polygon faces → MeshDocument → BufferGeometry).
 */
export class ObjMeshBuilder {
  /**
   * Converts every parsed object that has faces into a content mesh.
   *
   * @param parsed Parser output.
   * @returns Content meshes ready to parent into the world.
   */
  buildMeshes(parsed: ObjParseResult): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const object of parsed.objects) {
      const mesh = this.buildObjectMesh(object, parsed.positions, parsed.texCoords);
      if (mesh) {
        meshes.push(mesh);
      }
    }
    return meshes;
  }

  /**
   * Builds one content mesh for a named object section.
   *
   * @param object Parsed object with faces.
   * @param positions Global position table.
   * @param texCoords Global texcoord table.
   * @returns Mesh, or null when geometry is empty.
   */
  private buildObjectMesh(
    object: ObjParsedObject,
    positions: readonly ObjParsedPosition[],
    texCoords: readonly ObjParsedTexCoord[],
  ): THREE.Mesh | null {
    const packed = packObjectPolygonMesh(object, positions, texCoords);
    if (packed.faces.length === 0 || packed.positions.length < 9) {
      return null;
    }
    const document = meshDocumentFromPolygonList(packed.positions, packed.faces, packed.cornerUvs);
    const geometry = meshDocumentToBufferGeometry(document);
    const mesh = new THREE.Mesh(geometry, createContentMaterial(Theme.boxColor));
    mesh.name = hierarchyNameAllocator.allocate(sanitizeObjectName(object.name));
    enableFlatShadingOnMesh(mesh);
    mesh.userData['importedFromObj'] = true;
    writePersistentMeshDocument(mesh, document);
    rebuildDecorativeEdges(mesh);
    return mesh;
  }
}

/** Packed polygon mesh buffers for one OBJ object. */
interface PackedObjectMesh {
  positions: Float32Array;
  faces: number[][];
  cornerUvs: Float32Array | undefined;
}

/**
 * Packs object faces as n-gon loops into mesh-pipeline buffers. Positions used
 * by the object are remapped into a dense buffer so shared corners stay
 * welded.
 *
 * @param object Parsed object.
 * @param positions Global positions.
 * @param texCoords Global texcoords.
 * @returns Packed positions, face loops, and optional corner UVs.
 */
function packObjectPolygonMesh(
  object: ObjParsedObject,
  positions: readonly ObjParsedPosition[],
  texCoords: readonly ObjParsedTexCoord[],
): PackedObjectMesh {
  const remap = new Map<number, number>();
  const packedPositions: number[] = [];
  const faces: number[][] = [];
  const cornerUvList: number[] = [];
  let hasAnyUv = false;
  for (const face of object.faces) {
    const packedFace = packOneFace(face, positions, texCoords, remap, packedPositions, cornerUvList);
    if (!packedFace) {
      continue;
    }
    faces.push(packedFace.localIndices);
    hasAnyUv = hasAnyUv || packedFace.hadUv;
  }
  return {
    positions: new Float32Array(packedPositions),
    faces,
    cornerUvs: hasAnyUv ? new Float32Array(cornerUvList) : undefined,
  };
}

/**
 * Packs one OBJ face loop into local vertex indices and corner UVs.
 *
 * @param face Source face.
 * @param positions Global positions.
 * @param texCoords Global texcoords.
 * @param remap Global → local position map.
 * @param packedPositions Growing local positions.
 * @param cornerUvList Growing UV list.
 * @returns Local indices and UV flag, or null when the face is invalid.
 */
function packOneFace(
  face: ObjParsedFace,
  positions: readonly ObjParsedPosition[],
  texCoords: readonly ObjParsedTexCoord[],
  remap: Map<number, number>,
  packedPositions: number[],
  cornerUvList: number[],
): { localIndices: number[]; hadUv: boolean } | null {
  if (face.corners.length < 3) {
    return null;
  }
  const localIndices: number[] = [];
  let hadUv = false;
  for (const corner of face.corners) {
    const localIndex = mapCornerPosition(corner.positionIndex, positions, remap, packedPositions);
    if (localIndex < 0) {
      return null;
    }
    localIndices.push(localIndex);
    hadUv = pushCornerUv(corner.texCoordIndex, texCoords, cornerUvList) || hadUv;
  }
  return { localIndices, hadUv };
}

/**
 * Maps a global position index into a dense local vertex index.
 *
 * @param globalIndex Global OBJ position index.
 * @param positions Global positions.
 * @param remap Index map.
 * @param packedPositions Growing local xyz list.
 * @returns Local index, or -1 when invalid.
 */
function mapCornerPosition(
  globalIndex: number,
  positions: readonly ObjParsedPosition[],
  remap: Map<number, number>,
  packedPositions: number[],
): number {
  if (globalIndex < 0 || globalIndex >= positions.length) {
    return -1;
  }
  const existing = remap.get(globalIndex);
  if (existing !== undefined) {
    return existing;
  }
  const position = positions[globalIndex]!;
  const localIndex = packedPositions.length / 3;
  packedPositions.push(position.x, position.y, position.z);
  remap.set(globalIndex, localIndex);
  return localIndex;
}

/**
 * Appends one corner UV pair (zeros when missing).
 *
 * @param texCoordIndex Resolved texcoord index, or -1.
 * @param texCoords Global texcoords.
 * @param cornerUvList Output list.
 * @returns True when a real texcoord was written.
 */
function pushCornerUv(texCoordIndex: number, texCoords: readonly ObjParsedTexCoord[], cornerUvList: number[]): boolean {
  if (texCoordIndex < 0 || texCoordIndex >= texCoords.length) {
    cornerUvList.push(0, 0);
    return false;
  }
  const uv = texCoords[texCoordIndex]!;
  cornerUvList.push(uv.u, uv.v);
  return true;
}

/**
 * Sanitizes an object name for hierarchy allocation.
 *
 * @param name Raw OBJ object name.
 * @returns Safe base name.
 */
function sanitizeObjectName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, '_');
  return trimmed.length > 0 ? trimmed : 'Object';
}
