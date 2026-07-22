import * as THREE from 'three';
import { BufferGeometryData } from './io_types.js';

/**
 * Encodes and decodes Three.js BufferGeometry for JSON scene files.
 * Used for CSG results and any mesh that is not a named primitive.
 */
export class BufferGeometryCodec {
  /**
   * Converts a BufferGeometry into a JSON-safe vertex payload.
   * @param geometry The geometry to encode.
   * @returns Position data plus optional normals and indices.
   */
  encode(geometry: THREE.BufferGeometry): BufferGeometryData {
    const position = this.readAttributeArray(geometry, 'position');
    const data: BufferGeometryData = { position };
    const normal = this.readAttributeArray(geometry, 'normal');
    if (normal.length > 0) {
      data.normal = normal;
    }
    const uv = this.readAttributeArray(geometry, 'uv');
    if (uv.length > 0) {
      data.uv = uv;
    }
    const index = this.readIndexArray(geometry);
    if (index.length > 0) {
      data.index = index;
    }
    return data;
  }

  /**
   * Rebuilds a BufferGeometry from a JSON vertex payload.
   * @param data The encoded geometry data.
   * @returns A new BufferGeometry ready for mesh construction.
   */
  decode(data: BufferGeometryData): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    this.applyPositionAttribute(geometry, data.position);
    this.applyNormalAttribute(geometry, data.normal);
    this.applyUvAttribute(geometry, data.uv);
    this.applyIndexAttribute(geometry, data.index);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  /**
   * Reads a named buffer attribute into a plain number array.
   * @param geometry The source geometry.
   * @param attributeName The attribute to read.
   * @returns Component values, or an empty array when missing.
   */
  private readAttributeArray(
    geometry: THREE.BufferGeometry,
    attributeName: string
  ): number[] {
    const attribute = geometry.getAttribute(attributeName);
    if (!attribute) return [];
    return Array.from(attribute.array as ArrayLike<number>);
  }

  /**
   * Reads the geometry index buffer into a plain number array.
   * @param geometry The source geometry.
   * @returns Index values, or an empty array when non-indexed.
   */
  private readIndexArray(geometry: THREE.BufferGeometry): number[] {
    const index = geometry.getIndex();
    if (!index) return [];
    return Array.from(index.array as ArrayLike<number>);
  }

  /**
   * Assigns the position attribute from encoded values.
   * @param geometry The target geometry.
   * @param position Interleaved position components.
   */
  private applyPositionAttribute(
    geometry: THREE.BufferGeometry,
    position: number[]
  ): void {
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(position, 3)
    );
  }

  /**
   * Assigns normals from encoded values, or computes them when absent.
   * @param geometry The target geometry.
   * @param normal Optional interleaved normal components.
   */
  private applyNormalAttribute(
    geometry: THREE.BufferGeometry,
    normal: number[] | undefined
  ): void {
    if (normal && normal.length > 0) {
      geometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(normal, 3)
      );
      return;
    }
    geometry.computeVertexNormals();
  }

  /**
   * Assigns UV coordinates from encoded values when present.
   * @param geometry The target geometry.
   * @param uv Optional interleaved UV components.
   */
  private applyUvAttribute(
    geometry: THREE.BufferGeometry,
    uv: number[] | undefined
  ): void {
    if (!uv || uv.length === 0) return;
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  }

  /**
   * Assigns triangle indices when present.
   * @param geometry The target geometry.
   * @param index Optional index values.
   */
  private applyIndexAttribute(
    geometry: THREE.BufferGeometry,
    index: number[] | undefined
  ): void {
    if (!index || index.length === 0) return;
    geometry.setIndex(index);
  }
}
