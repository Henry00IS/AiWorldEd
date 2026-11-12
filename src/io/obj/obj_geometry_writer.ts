import * as THREE from 'three';
import type { ObjMaterialSlot } from './obj_material_collector.js';
import { modelExportWeld } from '@/io/export/model_export_weld.js';

/** Lines of one kind (v, vt or vn) after removing duplicates. */
interface ObjGeometryLines {
  /** Index among the written lines, per source vertex. */
  remap: Uint32Array;
  /** Number of lines written. */
  count: number;
}

/** Vertex, UV and normal lines of one mesh. */
interface ObjFaceLines {
  vertices: ObjGeometryLines;
  uvs: ObjGeometryLines;
  normals: ObjGeometryLines;
}

/** No lines (attribute missing). */
const OBJ_GEOMETRY_LINES_NONE: ObjGeometryLines = { remap: new Uint32Array(0), count: 0 };

/**
 * Writes Wavefront geometry lines for one mesh, including multi-material groups
 * and usemtl switches. Equal v, vt and vn lines are written once each and
 * shared by the faces, so the mesh is connected while hard edges and UV seams
 * stay.
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
    // A group of the same name too: some importers (Unity) split meshes by group only.
    const name = this.sanitizeObjectName(mesh.name);
    this.lines.push(`o ${name}`, `g ${name}`);
    const vertices = this.writeVertices(mesh, positions);
    const uvs = this.writeUvs(geometry);
    const normals = this.writeNormals(mesh, geometry);
    this.writeFaces(geometry, materialSlots, positions.count, { vertices, uvs, normals });
    this.indexVertex += vertices.count;
    this.indexVertexUvs += uvs.count;
    this.indexNormals += normals.count;
  }

  /**
   * Writes lines, each distinct line once.
   *
   * @param lines One line per source vertex.
   * @returns Remap and number of lines written.
   */
  private writeUnique(lines: readonly string[]): ObjGeometryLines {
    const weld = modelExportWeld(lines.length, (index) => lines[index]!);
    weld.kept.forEach((index) => this.lines.push(lines[index]!));
    return { remap: weld.remap, count: weld.kept.length };
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
   * @returns Vertex lines written.
   */
  private writeVertices(
    mesh: THREE.Mesh,
    positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  ): ObjGeometryLines {
    const vertex = new THREE.Vector3();
    const lines: string[] = [];
    for (let i = 0; i < positions.count; i++) {
      this.readVector3Attribute(positions, i, vertex).applyMatrix4(mesh.matrixWorld);
      lines.push(`v ${this.formatNumber(vertex.x)} ${this.formatNumber(vertex.y)} ${this.formatNumber(vertex.z)}`);
    }
    return this.writeUnique(lines);
  }

  /**
   * Writes UV coordinates when present.
   *
   * @param geometry Mesh geometry.
   * @returns UV lines written.
   */
  private writeUvs(geometry: THREE.BufferGeometry): ObjGeometryLines {
    const uvs = geometry.getAttribute('uv');
    if (!uvs) return OBJ_GEOMETRY_LINES_NONE;
    const uv = new THREE.Vector2();
    const lines: string[] = [];
    for (let i = 0; i < uvs.count; i++) {
      this.readVector2Attribute(uvs, i, uv);
      lines.push(`vt ${this.formatNumber(uv.x)} ${this.formatNumber(uv.y)}`);
    }
    return this.writeUnique(lines);
  }

  /**
   * Writes world-space normals when present.
   *
   * @param mesh Export mesh.
   * @param geometry Mesh geometry.
   * @returns Normal lines written.
   */
  private writeNormals(mesh: THREE.Mesh, geometry: THREE.BufferGeometry): ObjGeometryLines {
    const normals = geometry.getAttribute('normal');
    if (!normals) return OBJ_GEOMETRY_LINES_NONE;
    const normal = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const lines: string[] = [];
    for (let i = 0; i < normals.count; i++) {
      this.readVector3Attribute(normals, i, normal).applyMatrix3(normalMatrix).normalize();
      lines.push(`vn ${this.formatNumber(normal.x)} ${this.formatNumber(normal.y)} ${this.formatNumber(normal.z)}`);
    }
    return this.writeUnique(lines);
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
   * @param vertexCount Source vertices of the mesh.
   * @param written Vertex, UV and normal lines written for this mesh.
   */
  private writeFaces(
    geometry: THREE.BufferGeometry,
    materialSlots: ObjMaterialSlot[],
    vertexCount: number,
    written: ObjFaceLines,
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
      this.writeFaceRange(index, start, count, written);
    }
  }

  /**
   * Writes a contiguous triangle range as f lines.
   *
   * @param index Optional index buffer.
   * @param start First index element.
   * @param count Number of index elements (multiple of 3).
   * @param written Vertex, UV and normal lines written for this mesh.
   */
  private writeFaceRange(
    index: THREE.BufferAttribute | null,
    start: number,
    count: number,
    written: ObjFaceLines,
  ): void {
    for (let i = start; i < start + count; i += 3) {
      const a = this.faceCorner(index, i, written);
      const b = this.faceCorner(index, i + 1, written);
      const c = this.faceCorner(index, i + 2, written);
      this.lines.push(`f ${a} ${b} ${c}`);
    }
  }

  /**
   * Builds one Wavefront face corner token (v, v/vt, v//vn, or v/vt/vn).
   *
   * @param index Optional index buffer.
   * @param elementIndex Index into the index buffer or vertex stream.
   * @param written Vertex, UV and normal lines written for this mesh.
   * @returns Face corner string.
   */
  private faceCorner(index: THREE.BufferAttribute | null, elementIndex: number, written: ObjFaceLines): string {
    const local = index ? index.getX(elementIndex) : elementIndex;
    const hasUvs = written.uvs.count > 0;
    const hasNormals = written.normals.count > 0;
    const v = this.indexVertex + written.vertices.remap[local]! + 1;
    if (!hasUvs && !hasNormals) return `${v}`;
    const vt = hasUvs ? this.indexVertexUvs + written.uvs.remap[local]! + 1 : '';
    const vn = hasNormals ? this.indexNormals + written.normals.remap[local]! + 1 : '';
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
