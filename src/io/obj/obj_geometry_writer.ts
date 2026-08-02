import * as THREE from 'three';
import { isReflectionMatrix } from '@/io/coordinates/coordinate_space_transform.js';
import type { ObjMaterialSlot } from './obj_material_collector.js';

/**
 * Writes Wavefront geometry lines for one mesh, including multi-material groups
 * and usemtl switches.
 */
export class ObjGeometryWriter {
  private indexVertex = 0;
  private indexVertexUvs = 0;
  private indexNormals = 0;
  private readonly lines: string[] = [];

  /**
   * Appends one mesh to the OBJ body.
   *
   * @param mesh Export mesh with world matrices updated.
   * @param materialSlots Ordered slots matching mesh.material array order.
   */
  writeMesh(mesh: THREE.Mesh, materialSlots: ObjMaterialSlot[]): void {
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position');
    if (!positions) return;
    this.lines.push(`o ${this.sanitizeObjectName(mesh.name)}`);
    const vertexCount = this.writeVertices(mesh, positions);
    const uvCount = this.writeUvs(geometry);
    const normalCount = this.writeNormals(mesh, geometry);
    this.writeFaces(geometry, materialSlots, vertexCount, uvCount, normalCount, isReflectionMatrix(mesh.matrixWorld));
    this.indexVertex += vertexCount;
    this.indexVertexUvs += uvCount;
    this.indexNormals += normalCount;
  }

  /**
   * Returns the accumulated geometry body (without header / mtllib).
   *
   * @returns OBJ body text.
   */
  getBody(): string {
    return this.lines.join('\n');
  }

  /**
   * Writes transformed world-space vertices.
   *
   * @param mesh Export mesh.
   * @param positions Position attribute.
   * @returns Number of vertices written.
   */
  private writeVertices(mesh: THREE.Mesh, positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number {
    const vertex = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      this.readVector3Attribute(positions, i, vertex).applyMatrix4(mesh.matrixWorld);
      this.lines.push(`v ${this.formatNumber(vertex.x)} ${this.formatNumber(vertex.y)} ${this.formatNumber(vertex.z)}`);
    }
    return positions.count;
  }

  /**
   * Writes UV coordinates when present.
   *
   * @param geometry Mesh geometry.
   * @returns Number of UVs written.
   */
  private writeUvs(geometry: THREE.BufferGeometry): number {
    const uvs = geometry.getAttribute('uv');
    if (!uvs) return 0;
    const uv = new THREE.Vector2();
    for (let i = 0; i < uvs.count; i++) {
      this.readVector2Attribute(uvs, i, uv);
      this.lines.push(`vt ${this.formatNumber(uv.x)} ${this.formatNumber(uv.y)}`);
    }
    return uvs.count;
  }

  /**
   * Writes world-space normals when present.
   *
   * @param mesh Export mesh.
   * @param geometry Mesh geometry.
   * @returns Number of normals written.
   */
  private writeNormals(mesh: THREE.Mesh, geometry: THREE.BufferGeometry): number {
    const normals = geometry.getAttribute('normal');
    if (!normals) return 0;
    const normal = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < normals.count; i++) {
      this.readVector3Attribute(normals, i, normal).applyMatrix3(normalMatrix).normalize();
      this.lines.push(
        `vn ${this.formatNumber(normal.x)} ${this.formatNumber(normal.y)} ${this.formatNumber(normal.z)}`,
      );
    }
    return normals.count;
  }

  /**
   * Reads a 3-component attribute into a vector (supports interleaved buffers).
   *
   * @param attribute Position or normal attribute.
   * @param index Vertex index.
   * @param target Vector to fill.
   * @returns The target vector.
   */
  private readVector3Attribute(
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    index: number,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    return target.set(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
  }

  /**
   * Reads a 2-component attribute into a vector (supports interleaved buffers).
   *
   * @param attribute UV attribute.
   * @param index Vertex index.
   * @param target Vector to fill.
   * @returns The target vector.
   */
  private readVector2Attribute(
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    index: number,
    target: THREE.Vector2,
  ): THREE.Vector2 {
    return target.set(attribute.getX(index), attribute.getY(index));
  }

  /**
   * Writes faces, switching materials by geometry groups when multi-material.
   *
   * @param geometry Mesh geometry.
   * @param materialSlots Ordered material slots.
   * @param vertexCount Vertices written for this mesh.
   * @param uvCount UVs written for this mesh.
   * @param normalCount Normals written for this mesh.
   * @param reverseTriangleWinding Whether transformed geometry is reflective.
   */
  private writeFaces(
    geometry: THREE.BufferGeometry,
    materialSlots: ObjMaterialSlot[],
    vertexCount: number,
    uvCount: number,
    normalCount: number,
    reverseTriangleWinding: boolean,
  ): void {
    const groups = geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count: -1, materialIndex: 0 }];
    const index = geometry.getIndex();
    const triangleVertexCount = index ? index.count : vertexCount;
    for (const group of groups) {
      const materialIndex = group.materialIndex ?? 0;
      const slot = materialSlots[materialIndex] ?? materialSlots[0];
      if (slot) this.lines.push(`usemtl ${slot.name}`);
      const start = group.start;
      const count = group.count < 0 ? triangleVertexCount - start : group.count;
      this.writeFaceRange(index, start, count, uvCount > 0, normalCount > 0, reverseTriangleWinding);
    }
  }

  /**
   * Writes a contiguous triangle range as f lines.
   *
   * @param index Optional index buffer.
   * @param start First index element.
   * @param count Number of index elements (multiple of 3).
   * @param hasUvs Whether vt indices are present.
   * @param hasNormals Whether vn indices are present.
   * @param reverseTriangleWinding Whether to swap the second and third corners.
   */
  private writeFaceRange(
    index: THREE.BufferAttribute | null,
    start: number,
    count: number,
    hasUvs: boolean,
    hasNormals: boolean,
    reverseTriangleWinding: boolean,
  ): void {
    for (let i = start; i < start + count; i += 3) {
      const a = this.faceCorner(index, i, hasUvs, hasNormals);
      const secondElementIndex = reverseTriangleWinding ? i + 2 : i + 1;
      const thirdElementIndex = reverseTriangleWinding ? i + 1 : i + 2;
      const b = this.faceCorner(index, secondElementIndex, hasUvs, hasNormals);
      const c = this.faceCorner(index, thirdElementIndex, hasUvs, hasNormals);
      this.lines.push(`f ${a} ${b} ${c}`);
    }
  }

  /**
   * Builds one Wavefront face corner token (v, v/vt, v//vn, or v/vt/vn).
   *
   * @param index Optional index buffer.
   * @param elementIndex Index into the index buffer or vertex stream.
   * @param hasUvs Whether UVs exist.
   * @param hasNormals Whether normals exist.
   * @returns Face corner string.
   */
  private faceCorner(
    index: THREE.BufferAttribute | null,
    elementIndex: number,
    hasUvs: boolean,
    hasNormals: boolean,
  ): string {
    const local = index ? index.getX(elementIndex) : elementIndex;
    const v = this.indexVertex + local + 1;
    if (!hasUvs && !hasNormals) return `${v}`;
    const vt = hasUvs ? this.indexVertexUvs + local + 1 : '';
    const vn = hasNormals ? this.indexNormals + local + 1 : '';
    if (hasUvs && hasNormals) return `${v}/${vt}/${vn}`;
    if (hasUvs) return `${v}/${vt}`;
    return `${v}//${vn}`;
  }

  /**
   * Formats a number with enough precision for level geometry.
   *
   * @param value Numeric component.
   * @returns Fixed decimal string.
   */
  private formatNumber(value: number): string {
    return Number(value.toFixed(6)).toString();
  }

  /**
   * Sanitizes an object name for the o line.
   *
   * @param name Mesh name.
   * @returns Safe object name.
   */
  private sanitizeObjectName(name: string): string {
    const trimmed = name.trim();
    return trimmed.length > 0 ? trimmed.replace(/\s+/g, '_') : 'Object';
  }
}
