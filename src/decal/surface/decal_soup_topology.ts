import * as THREE from 'three';

/**
 * Shared vertex and face data of a triangle soup: corners at the same position
 * (within one weld step) become one vertex, and every triangle gets its unit
 * geometric normal turned to the side its shading normals face.
 */
export class DecalSoupTopology {
  /** Grid step used to find corners at the same position, in model units. */
  static readonly weldStep = 1e-4;

  /** Welded vertex index of every corner. */
  vertexOfCorner = new Int32Array(0);
  /** Unit geometric normal of every triangle, three floats each. */
  faceNormals = new Float64Array(0);
  private readonly edgeA = new THREE.Vector3();
  private readonly edgeB = new THREE.Vector3();
  private readonly faceNormal = new THREE.Vector3();

  /**
   * Welds the corners and computes the face normals.
   *
   * @param positions Model-space positions, nine floats per triangle.
   * @param normals Shading normals that tell each triangle's front side.
   * @returns Number of welded vertices.
   */
  analyze(positions: Float32Array, normals: Float32Array): number {
    const vertexCount = this.cornersWeld(positions);
    const triangleCount = positions.length / 9;
    if (this.faceNormals.length < triangleCount * 3) this.faceNormals = new Float64Array(triangleCount * 3);
    for (let triangle = 0; triangle < triangleCount; triangle++) this.faceNormalStore(positions, normals, triangle);
    return vertexCount;
  }

  /**
   * Assigns each corner the index of the welded vertex at its position.
   *
   * @param positions Model-space positions.
   * @returns Number of welded vertices.
   */
  private cornersWeld(positions: Float32Array): number {
    const cornerCount = positions.length / 3;
    if (this.vertexOfCorner.length < cornerCount) this.vertexOfCorner = new Int32Array(cornerCount);
    const vertexByKey = new Map<string, number>();
    const step = DecalSoupTopology.weldStep;
    for (let corner = 0; corner < cornerCount; corner++) {
      const key = `${Math.round((positions[corner * 3] ?? 0) / step)},${Math.round((positions[corner * 3 + 1] ?? 0) / step)},${Math.round((positions[corner * 3 + 2] ?? 0) / step)}`;
      let vertex = vertexByKey.get(key);
      if (vertex === undefined) {
        vertex = vertexByKey.size;
        vertexByKey.set(key, vertex);
      }
      this.vertexOfCorner[corner] = vertex;
    }
    return vertexByKey.size;
  }

  /**
   * Computes and stores one triangle's oriented unit geometric normal.
   *
   * @param positions Model-space positions.
   * @param normals Shading normals.
   * @param triangle Triangle index.
   */
  private faceNormalStore(positions: Float32Array, normals: Float32Array, triangle: number): void {
    const base = triangle * 9;
    const at = (index: number) => positions[base + index] ?? 0;
    this.edgeA.set(at(3) - at(0), at(4) - at(1), at(5) - at(2));
    this.edgeB.set(at(6) - at(0), at(7) - at(1), at(8) - at(2));
    this.faceNormal.crossVectors(this.edgeA, this.edgeB).normalize();
    const shading = (axis: number) =>
      (normals[base + axis] ?? 0) + (normals[base + 3 + axis] ?? 0) + (normals[base + 6 + axis] ?? 0);
    const dot = this.faceNormal.x * shading(0) + this.faceNormal.y * shading(1) + this.faceNormal.z * shading(2);
    if (dot < 0) this.faceNormal.negate();
    this.faceNormals[triangle * 3] = this.faceNormal.x;
    this.faceNormals[triangle * 3 + 1] = this.faceNormal.y;
    this.faceNormals[triangle * 3 + 2] = this.faceNormal.z;
  }
}
