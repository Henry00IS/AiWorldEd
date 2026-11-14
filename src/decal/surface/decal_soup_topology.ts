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
  /** Open-addressing table of welded vertices by rounded cell. */
  private weldSlots = new Int32Array(0);
  private weldCells = new Float64Array(0);
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
    let size = 16;
    while (size < cornerCount * 2) size *= 2;
    if (this.weldSlots.length !== size) {
      this.weldSlots = new Int32Array(size);
      this.weldCells = new Float64Array(size * 3);
    }
    const slots = this.weldSlots.fill(-1);
    const cells = this.weldCells;
    const mask = size - 1;
    const step = DecalSoupTopology.weldStep;
    let vertexCount = 0;
    for (let corner = 0; corner < cornerCount; corner++) {
      const x = Math.round(positions[corner * 3]! / step);
      const y = Math.round(positions[corner * 3 + 1]! / step);
      const z = Math.round(positions[corner * 3 + 2]! / step);
      let slot = decalWeldHash(x, y, z) & mask;
      let vertex = -1;
      for (let at = slots[slot]!; at >= 0; slot = (slot + 1) & mask, at = slots[slot]!) {
        if (cells[slot * 3] === x && cells[slot * 3 + 1] === y && cells[slot * 3 + 2] === z) {
          vertex = at;
          break;
        }
      }
      if (vertex < 0) {
        vertex = vertexCount++;
        slots[slot] = vertex;
        cells[slot * 3] = x;
        cells[slot * 3 + 1] = y;
        cells[slot * 3 + 2] = z;
      }
      this.vertexOfCorner[corner] = vertex;
    }
    return vertexCount;
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

/**
 * Hashes a weld cell given as three whole numbers; zero and negative zero hash
 * alike, as they are the same cell.
 *
 * @param x Cell x.
 * @param y Cell y.
 * @param z Cell z.
 * @returns Hash.
 */
function decalWeldHash(x: number, y: number, z: number): number {
  let hash = Math.imul((x | 0) ^ Math.floor(x / 4294967296), 0x9e3779b1);
  hash = Math.imul(hash ^ (y | 0) ^ Math.floor(y / 4294967296), 0x85ebca77);
  hash = Math.imul(hash ^ (z | 0) ^ Math.floor(z / 4294967296), 0xc2b2ae3d);
  return (hash ^ (hash >>> 15)) >>> 0;
}
