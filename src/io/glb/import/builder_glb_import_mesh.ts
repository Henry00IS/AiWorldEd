import * as THREE from 'three';
import { toTrianglesDrawMode } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  contentMeshTriangleSoupCreate,
  contentMeshTriangleSoupDocument,
  type ContentMeshSoupDocument,
  type ContentMeshTriangleSoup,
} from '@/io/geometry/content_mesh_triangle_soup.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { GlbImportDocument } from './glb_import_document_loader.js';
import { glbImportMaterialImageIndex } from './glb_import_images.js';
import type { GlbImportJsonPrimitive } from './glb_import_json.js';

/** GlTF primitive draw modes the importer turns into triangles. */
const GLB_IMPORT_TRIANGLE_MODES: ReadonlyMap<number, THREE.TrianglesDrawModes | null> = new Map([
  [4, null],
  [5, THREE.TriangleStripDrawMode],
  [6, THREE.TriangleFanDrawMode],
]);

/**
 * Builds editable polygon documents from glTF meshes: all triangle primitives
 * of a mesh become one welded document, each face keeps its material's texture
 * id and corner UVs, and coplanar faces whose UVs agree merge into polygons.
 */
export class GlbImportMeshBuilder {
  private readonly cache: Map<number, Promise<ContentMeshSoupDocument | null>>;

  /**
   * Creates a builder for one document.
   *
   * @param source Parsed document.
   * @param textureIdByImage Texture id per glTF image index.
   */
  constructor(
    private readonly source: GlbImportDocument,
    private readonly textureIdByImage: ReadonlyMap<number, string>,
  ) {
    this.cache = new Map();
  }

  /**
   * Builds (once) the document of a glTF mesh.
   *
   * @param meshIndex GlTF mesh index.
   * @returns Document, or null when the mesh has no usable triangles.
   */
  build(meshIndex: number): Promise<ContentMeshSoupDocument | null> {
    let pending = this.cache.get(meshIndex);
    if (pending === undefined) {
      pending = this.buildUncached(meshIndex);
      this.cache.set(meshIndex, pending);
    }
    return pending;
  }

  /**
   * Builds the document of a glTF mesh.
   *
   * @param meshIndex GlTF mesh index.
   * @returns Document, or null when the mesh has no usable triangles.
   */
  private async buildUncached(meshIndex: number): Promise<ContentMeshSoupDocument | null> {
    const primitives = this.source.json.meshes?.[meshIndex]?.primitives ?? [];
    const geometries: THREE.BufferGeometry[] = await this.source.parser.loadGeometries(primitives);
    const soup = contentMeshTriangleSoupCreate();
    primitives.forEach((primitive, index) => {
      const geometry = geometries[index];
      if (geometry) this.primitiveAppend(soup, primitive, geometry);
    });
    if (soup.triangleIndices.length === 0) return null;
    return contentMeshTriangleSoupDocument(soup);
  }

  /**
   * Appends one primitive's triangles to the soup.
   *
   * @param soup Growing soup.
   * @param primitive Primitive definition.
   * @param geometry Loaded primitive geometry.
   */
  private primitiveAppend(
    soup: ContentMeshTriangleSoup,
    primitive: GlbImportJsonPrimitive,
    geometry: THREE.BufferGeometry,
  ): void {
    const triangles = glbImportTriangleGeometry(geometry, primitive.mode ?? 4);
    if (triangles === null) return;
    const textureId = this.primitiveTextureId(primitive);
    glbImportSoupAppendGeometry(soup, triangles, textureId);
  }

  /**
   * Returns the texture id of a primitive's material.
   *
   * @param primitive Primitive definition.
   * @returns Texture id, or the checker when the material has no image.
   */
  private primitiveTextureId(primitive: GlbImportJsonPrimitive): string {
    const imageIndex = glbImportMaterialImageIndex(this.source.json, primitive.material);
    if (imageIndex === null) return DEFAULT_CHECKER_TEXTURE_ID;
    return this.textureIdByImage.get(imageIndex) ?? DEFAULT_CHECKER_TEXTURE_ID;
  }
}

/**
 * Returns a triangle-list version of a primitive geometry.
 *
 * @param geometry Primitive geometry.
 * @param mode GlTF draw mode.
 * @returns Triangle geometry, or null for points and lines.
 */
function glbImportTriangleGeometry(geometry: THREE.BufferGeometry, mode: number): THREE.BufferGeometry | null {
  if (!GLB_IMPORT_TRIANGLE_MODES.has(mode) || !geometry.getAttribute('position')) return null;
  const drawMode = GLB_IMPORT_TRIANGLE_MODES.get(mode) ?? null;
  return drawMode === null ? geometry : toTrianglesDrawMode(geometry, drawMode);
}

/**
 * Appends a triangle geometry's vertices, editor-space UVs and triangles.
 *
 * @param soup Growing soup.
 * @param geometry Triangle geometry.
 * @param textureId Texture id of every appended triangle.
 */
function glbImportSoupAppendGeometry(
  soup: ContentMeshTriangleSoup,
  geometry: THREE.BufferGeometry,
  textureId: string,
): void {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const vertexOffset = soup.positions.length / 3;
  for (let vertex = 0; vertex < position.count; vertex++) {
    soup.positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
    soup.vertexUvs.push(uv ? uv.getX(vertex) : 0, uv ? 1 - uv.getY(vertex) : 0);
  }
  soup.hasTextureCoordinates = soup.hasTextureCoordinates || uv !== undefined;
  const indices = glbImportTriangleIndices(geometry, position.count);
  const cornerCount = indices.length - (indices.length % 3);
  for (let corner = 0; corner < cornerCount; corner++) soup.triangleIndices.push(vertexOffset + (indices[corner] ?? 0));
  for (let corner = 0; corner < cornerCount; corner += 3) soup.triangleTextureIds.push(textureId);
}

/**
 * Reads the triangle vertex indices of a geometry.
 *
 * @param geometry Triangle geometry.
 * @param vertexCount Vertex count for non-indexed geometry.
 * @returns Flat indices.
 */
function glbImportTriangleIndices(geometry: THREE.BufferGeometry, vertexCount: number): number[] {
  const index = geometry.getIndex();
  if (index === null) return Array.from({ length: vertexCount }, (_unused, vertex) => vertex);
  return Array.from({ length: index.count }, (_unused, corner) => index.getX(corner));
}
