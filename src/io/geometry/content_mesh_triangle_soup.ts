import { MESH_EDIT_WELD_EPSILON, weldTriangleMesh } from '@/edit/mesh/mesh_edit_weld.js';
import { meshCornerUvsFromVertexUvs } from '@/mesh/convert/mesh_corner_uv_from_vertex_uv.js';
import { writeMeshDocumentFaceTextureId } from '@/mesh/convert/mesh_document_face_texture_sync.js';
import { meshDocumentFromTriangleList } from '@/mesh/convert/mesh_from_triangle_list.js';
import { mergeCoplanarMeshDocumentFaces } from '@/mesh/convert/mesh_merge_coplanar_faces.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';

/** Triangles of one imported mesh in mesh space, before welding. */
export interface ContentMeshTriangleSoup {
  /** Flat xyz per soup vertex. */
  positions: number[];
  /** Flat editor-space u, v per soup vertex. */
  vertexUvs: number[];
  /** Three soup vertex indices per triangle. */
  triangleIndices: number[];
  /** Texture id per triangle. */
  triangleTextureIds: string[];
  /** True when the file carried texture coordinates. */
  hasTextureCoordinates: boolean;
}

/** Editable document built from a triangle soup. */
export interface ContentMeshSoupDocument {
  /** Polygon document with corner UVs and a texture id on every face. */
  document: MeshDocument;
  /** Triangles read from the file (before coplanar merging). */
  triangleCount: number;
  /** True when the file carried texture coordinates. */
  hasTextureCoordinates: boolean;
}

/**
 * Creates an empty triangle soup.
 *
 * @returns Soup.
 */
export function contentMeshTriangleSoupCreate(): ContentMeshTriangleSoup {
  return { positions: [], vertexUvs: [], triangleIndices: [], triangleTextureIds: [], hasTextureCoordinates: false };
}

/**
 * Welds the soup, drops triangles that collapsed, and builds the merged polygon
 * document with per-face texture ids. Coplanar faces merge only where their UVs
 * continue one mapping.
 *
 * @param soup Triangle soup.
 * @returns Document, or null when no triangle survived.
 */
export function contentMeshTriangleSoupDocument(soup: ContentMeshTriangleSoup): ContentMeshSoupDocument | null {
  const welded = weldTriangleMesh(new Float32Array(soup.positions), soup.triangleIndices, MESH_EDIT_WELD_EPSILON);
  const cornerUvs = meshCornerUvsFromVertexUvs(soup.triangleIndices, soup.vertexUvs);
  const kept = contentMeshSoupKeptTriangles(welded.triangleIndices);
  if (kept.length === 0) return null;
  const document = meshDocumentFromTriangleList(
    welded.positions,
    kept.flatMap((triangle) => welded.triangleIndices.slice(triangle * 3, triangle * 3 + 3)),
    contentMeshSoupKeptCornerUvs(cornerUvs, kept),
  );
  kept.forEach((triangle, face) =>
    writeMeshDocumentFaceTextureId(document, face, soup.triangleTextureIds[triangle] ?? DEFAULT_CHECKER_TEXTURE_ID),
  );
  return {
    document: mergeCoplanarMeshDocumentFaces(document),
    triangleCount: kept.length,
    hasTextureCoordinates: soup.hasTextureCoordinates,
  };
}

/**
 * Collects the corner UVs of the kept triangles.
 *
 * @param cornerUvs Corner UVs of every triangle (six values each).
 * @param kept Kept triangle indices.
 * @returns Corner UVs in kept order.
 */
function contentMeshSoupKeptCornerUvs(cornerUvs: Float32Array, kept: readonly number[]): Float32Array {
  const values = new Float32Array(kept.length * 6);
  kept.forEach((triangle, slot) => values.set(cornerUvs.subarray(triangle * 6, triangle * 6 + 6), slot * 6));
  return values;
}

/**
 * Lists the triangles whose three welded corners are distinct.
 *
 * @param weldedIndices Welded flat triangle indices.
 * @returns Indices of the triangles to keep.
 */
function contentMeshSoupKeptTriangles(weldedIndices: readonly number[]): number[] {
  const kept: number[] = [];
  for (let triangle = 0; triangle * 3 + 2 < weldedIndices.length; triangle++) {
    const a = weldedIndices[triangle * 3];
    const b = weldedIndices[triangle * 3 + 1];
    const c = weldedIndices[triangle * 3 + 2];
    if (a !== b && b !== c && a !== c) kept.push(triangle);
  }
  return kept;
}
