import * as THREE from 'three';
import {
  FaceTextureMapping,
  cloneFaceTextureMapping
} from '../texture/face_texture_mapping.js';

/**
 * A planar polygon used by the brush CSG pipeline.
 * Optionally carries durable surface texture mapping for rebuilds.
 */
export class CsgPolygon {
  private vertices: THREE.Vector3[];
  private planeNormal: THREE.Vector3;
  private planeConstant: number;
  private surfaceMapping: FaceTextureMapping | null;

  /**
   * Creates a polygon from three or more vertices that share a plane.
   * @param vertices The polygon vertices in winding order.
   * @param surfaceMapping Optional face texture mapping for this surface.
   */
  constructor(
    vertices: THREE.Vector3[],
    surfaceMapping: FaceTextureMapping | null = null
  ) {
    this.vertices = vertices.map((vertex) => vertex.clone());
    const plane = this.computePlaneFromVertices(this.vertices);
    this.planeNormal = plane.normal;
    this.planeConstant = plane.constant;
    this.surfaceMapping = surfaceMapping
      ? cloneFaceTextureMapping(surfaceMapping)
      : null;
  }

  /**
   * Returns a deep clone of this polygon including surface mapping.
   * @returns A new CsgPolygon with copied vertices and mapping.
   */
  clone(): CsgPolygon {
    return new CsgPolygon(this.vertices, this.surfaceMapping);
  }

  /**
   * Flips the polygon winding and plane normal.
   */
  flip(): void {
    this.vertices.reverse();
    this.planeNormal.negate();
    this.planeConstant = -this.planeConstant;
  }

  /**
   * Returns the polygon vertices.
   * @returns The vertex array.
   */
  getVertices(): THREE.Vector3[] {
    return this.vertices;
  }

  /**
   * Returns the plane normal.
   * @returns The unit normal vector.
   */
  getPlaneNormal(): THREE.Vector3 {
    return this.planeNormal;
  }

  /**
   * Returns the plane constant for the plane equation n·x = c.
   * @returns The plane constant.
   */
  getPlaneConstant(): number {
    return this.planeConstant;
  }

  /**
   * Returns the surface texture mapping for this polygon, if any.
   * @returns Mapping clone, or null when unset.
   */
  getSurfaceMapping(): FaceTextureMapping | null {
    return this.surfaceMapping
      ? cloneFaceTextureMapping(this.surfaceMapping)
      : null;
  }

  /**
   * Sets the surface texture mapping carried by this polygon.
   * @param mapping Mapping to store, or null to clear.
   */
  setSurfaceMapping(mapping: FaceTextureMapping | null): void {
    this.surfaceMapping = mapping
      ? cloneFaceTextureMapping(mapping)
      : null;
  }

  /**
   * Builds a plane equation from the first three vertices.
   * @param vertices The polygon vertices.
   * @returns The plane normal and constant.
   */
  private computePlaneFromVertices(
    vertices: THREE.Vector3[]
  ): { normal: THREE.Vector3; constant: number } {
    const a = vertices[0];
    const b = vertices[1];
    const c = vertices[2];
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    const constant = normal.dot(a);
    return { normal, constant };
  }
}
