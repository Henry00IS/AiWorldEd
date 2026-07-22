import * as THREE from 'three';
import { CsgPolygon } from './csg_polygon.js';
import { createContentMaterial } from '../materials/content_material_factory.js';
import {
  FaceTextureMapEntry,
  FaceTextureMapping,
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping
} from '../texture/face_texture_mapping.js';
import { setFaceTextureMaps } from '../texture/face_texture_storage.js';
import { getFaceTextureMaps } from '../texture/face_texture_storage.js';
import {
  rebakeStoredFaceTextureMaps,
  splitMeshIntoCoplanarRegions
} from '../texture/planar_uv_projector.js';
import { rebuildSurfaceMaterials } from '../texture/surface_material_builder.js';
import { getTexturePaintState } from '../texture/texture_paint_state.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../texture/texture_id.js';

/**
 * Converts between Three.js meshes and CSG polygon soups.
 * Carries per-polygon surface texture mappings through rebuilds.
 */
export class CsgMeshBuilder {
  /**
   * Extracts world-space triangles from a mesh as CSG polygons.
   * @param mesh The source mesh.
   * @returns An array of triangular polygons with surface mappings.
   */
  meshToPolygons(mesh: THREE.Mesh): CsgPolygon[] {
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const triangleMappings = this.buildTriangleMappingTable(mesh);
    const polygons: CsgPolygon[] = [];
    if (index) {
      this.extractIndexedTriangles(
        position,
        index,
        polygons,
        triangleMappings
      );
    } else {
      this.extractNonIndexedTriangles(position, polygons, triangleMappings);
    }
    geometry.dispose();
    return polygons;
  }

  /**
   * Builds a mesh from a polygon soup using the provided material color.
   * Restores face texture maps from polygon surface bindings.
   * @param polygons The CSG polygons to convert.
   * @param color The material color hex value.
   * @param name The mesh name.
   * @returns A new mesh centered at the origin of its geometry bounds.
   */
  polygonsToMesh(
    polygons: CsgPolygon[],
    color: number,
    name: string
  ): THREE.Mesh {
    const built = this.buildGeometryFromPolygons(polygons);
    built.geometry.computeVertexNormals();
    const material = createContentMaterial(color, {
      flatShading: true,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(built.geometry, material);
    mesh.name = name;
    this.bakeGeometryCenterIntoPosition(mesh);
    this.applyTriangleMappingsToMesh(mesh, built.triangleMappings);
    return mesh;
  }

  /**
   * Builds per-triangle mapping lookup from stored face maps (or paint default).
   * @param mesh Source mesh.
   * @returns Mapping per triangle index.
   */
  private buildTriangleMappingTable(
    mesh: THREE.Mesh
  ): Map<number, FaceTextureMapping> {
    const lookup = new Map<number, FaceTextureMapping>();
    const entries = getFaceTextureMaps(mesh);
    entries.forEach((entry) => {
      entry.triangleIndices.forEach((index) => {
        lookup.set(index, cloneFaceTextureMapping(entry.mapping));
      });
    });
    return lookup;
  }

  /**
   * Resolves mapping for a triangle, falling back to last paint texture.
   * @param triangleIndex Triangle index.
   * @param table Lookup table from the source mesh.
   * @returns Mapping for the polygon.
   */
  private resolveTriangleMapping(
    triangleIndex: number,
    table: Map<number, FaceTextureMapping>
  ): FaceTextureMapping {
    const existing = table.get(triangleIndex);
    if (existing) return cloneFaceTextureMapping(existing);
    return createDefaultFaceTextureMapping(
      getTexturePaintState().getLastTextureId()
    );
  }

  /**
   * Extracts triangles from indexed geometry.
   * @param position The position attribute.
   * @param index The index buffer.
   * @param polygons The accumulator list.
   * @param triangleMappings Source triangle mapping table.
   */
  private extractIndexedTriangles(
    position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    index: THREE.BufferAttribute,
    polygons: CsgPolygon[],
    triangleMappings: Map<number, FaceTextureMapping>
  ): void {
    let triangleIndex = 0;
    for (let i = 0; i < index.count; i += 3) {
      const a = this.readVertex(position, index.getX(i));
      const b = this.readVertex(position, index.getX(i + 1));
      const c = this.readVertex(position, index.getX(i + 2));
      if (this.isValidTriangle(a, b, c)) {
        const mapping = this.resolveTriangleMapping(
          triangleIndex,
          triangleMappings
        );
        polygons.push(new CsgPolygon([a, b, c], mapping));
      }
      triangleIndex += 1;
    }
  }

  /**
   * Extracts triangles from non-indexed geometry.
   * @param position The position attribute.
   * @param polygons The accumulator list.
   * @param triangleMappings Source triangle mapping table.
   */
  private extractNonIndexedTriangles(
    position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    polygons: CsgPolygon[],
    triangleMappings: Map<number, FaceTextureMapping>
  ): void {
    let triangleIndex = 0;
    for (let i = 0; i < position.count; i += 3) {
      const a = this.readVertex(position, i);
      const b = this.readVertex(position, i + 1);
      const c = this.readVertex(position, i + 2);
      if (this.isValidTriangle(a, b, c)) {
        const mapping = this.resolveTriangleMapping(
          triangleIndex,
          triangleMappings
        );
        polygons.push(new CsgPolygon([a, b, c], mapping));
      }
      triangleIndex += 1;
    }
  }

  /**
   * Reads a vertex from a buffer attribute.
   * @param position The position attribute.
   * @param index The vertex index.
   * @returns A new Vector3.
   */
  private readVertex(
    position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    index: number
  ): THREE.Vector3 {
    return new THREE.Vector3(
      position.getX(index),
      position.getY(index),
      position.getZ(index)
    );
  }

  /**
   * Rejects degenerate zero-area triangles.
   * @param a First vertex.
   * @param b Second vertex.
   * @param c Third vertex.
   * @returns True if the triangle has area.
   */
  private isValidTriangle(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3
  ): boolean {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    return ab.cross(ac).lengthSq() > 1e-12;
  }

  /**
   * Builds a BufferGeometry from polygons by fan-triangulating each face.
   * @param polygons The source polygons.
   * @returns Geometry plus per-triangle surface mappings.
   */
  private buildGeometryFromPolygons(polygons: CsgPolygon[]): {
    geometry: THREE.BufferGeometry;
    triangleMappings: FaceTextureMapping[];
  } {
    const positions: number[] = [];
    const triangleMappings: FaceTextureMapping[] = [];
    const fallback = createDefaultFaceTextureMapping(
      getTexturePaintState().getLastTextureId()
    );
    polygons.forEach((polygon) => {
      const vertices = polygon.getVertices();
      const mapping =
        polygon.getSurfaceMapping() ?? cloneFaceTextureMapping(fallback);
      for (let i = 1; i + 1 < vertices.length; i++) {
        positions.push(vertices[0].x, vertices[0].y, vertices[0].z);
        positions.push(vertices[i].x, vertices[i].y, vertices[i].z);
        positions.push(
          vertices[i + 1].x,
          vertices[i + 1].y,
          vertices[i + 1].z
        );
        triangleMappings.push(cloneFaceTextureMapping(mapping));
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    return { geometry, triangleMappings };
  }

  /**
   * Writes face texture maps from per-triangle mappings and rebuilds materials.
   * Groups by coplanar region so UV bake uses a single plane per face
   * (never averages opposite walls that share the same texture id).
   * @param mesh Result mesh.
   * @param triangleMappings Mapping for each output triangle.
   */
  private applyTriangleMappingsToMesh(
    mesh: THREE.Mesh,
    triangleMappings: FaceTextureMapping[]
  ): void {
    mesh.updateMatrixWorld(true);
    const entries = this.groupByCoplanarRegion(mesh, triangleMappings);
    setFaceTextureMaps(mesh, entries);
    rebakeStoredFaceTextureMaps(mesh);
    rebuildSurfaceMaterials(mesh);
  }

  /**
   * Builds map entries by coplanar face regions, taking mapping from the seed triangle.
   * When one plane has mixed texture ids, splits further by mapping identity.
   * @param mesh Result mesh (geometry already recentered).
   * @param triangleMappings Mapping for each triangle index.
   * @returns Face texture map entries suitable for planar UV bake.
   */
  private groupByCoplanarRegion(
    mesh: THREE.Mesh,
    triangleMappings: FaceTextureMapping[]
  ): FaceTextureMapEntry[] {
    const fallback = createDefaultFaceTextureMapping(
      getTexturePaintState().getLastTextureId()
    );
    const regions = splitMeshIntoCoplanarRegions(mesh);
    const entries: FaceTextureMapEntry[] = [];
    regions.forEach((region) => {
      this.appendRegionEntries(region, triangleMappings, fallback, entries);
    });
    return entries;
  }

  /**
   * Appends one or more map entries for a coplanar region.
   * @param region Coplanar triangle indices.
   * @param triangleMappings Per-triangle mappings.
   * @param fallback Mapping when a triangle lacks one.
   * @param entries Output accumulator.
   */
  private appendRegionEntries(
    region: number[],
    triangleMappings: FaceTextureMapping[],
    fallback: FaceTextureMapping,
    entries: FaceTextureMapEntry[]
  ): void {
    const byMapping = new Map<string, number[]>();
    region.forEach((triangleIndex) => {
      const mapping =
        triangleMappings[triangleIndex] ?? cloneFaceTextureMapping(fallback);
      const key = mappingKey(mapping);
      const list = byMapping.get(key);
      if (list) {
        list.push(triangleIndex);
        return;
      }
      byMapping.set(key, [triangleIndex]);
    });
    byMapping.forEach((triangleIndices) => {
      const sampleIndex = triangleIndices[0];
      const mapping =
        triangleMappings[sampleIndex] ?? cloneFaceTextureMapping(fallback);
      entries.push({
        triangleIndices: triangleIndices.slice().sort((a, b) => a - b),
        mapping: cloneFaceTextureMapping(mapping)
      });
    });
  }

  /**
   * Recenters geometry so the mesh position sits at the bounds center.
   * @param mesh The mesh to adjust.
   */
  private bakeGeometryCenterIntoPosition(mesh: THREE.Mesh): void {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box) return;
    const center = box.getCenter(new THREE.Vector3());
    mesh.geometry.translate(-center.x, -center.y, -center.z);
    mesh.position.copy(center);
    mesh.updateMatrixWorld(true);
  }
}

/**
 * Builds a stable key for grouping identical surface mappings.
 * @param mapping Mapping to key.
 * @returns String key.
 */
function mappingKey(mapping: FaceTextureMapping): string {
  return [
    mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID,
    mapping.align,
    mapping.scaleU,
    mapping.scaleV,
    mapping.offsetU,
    mapping.offsetV,
    mapping.rotationDeg
  ].join('|');
}
