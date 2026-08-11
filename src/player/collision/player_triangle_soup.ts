import * as THREE from 'three';
import { getTriangleCount, getTriangleVertexIndices } from '@/selection/pick/utils_triangle_geometry.js';
import { playerTriangleNormalFromVertices } from './player_triangle_math.js';

/** Cell size for the world triangle spatial hash in meters. */
const SOUP_GRID_CELL_SIZE_METERS = 2;

/** Maximum triangles returned from one AABB query. */
const SOUP_QUERY_TRIANGLE_LIMIT = 2048;

/**
 * Static world-space triangle soup with a 3D spatial hash for broadphase
 * queries.
 */
export class PlayerTriangleSoup {
  private readonly vertexData: number[];
  private readonly normalData: number[];
  private triangleCount: number;
  private readonly cellToTriangles: Map<number, number[]>;
  private readonly seenTriangles: Set<number>;
  private readonly scratchA: THREE.Vector3;
  private readonly scratchB: THREE.Vector3;
  private readonly scratchC: THREE.Vector3;
  private readonly scratchNormal: THREE.Vector3;

  /** Creates an empty triangle soup. */
  constructor() {
    this.vertexData = [];
    this.normalData = [];
    this.triangleCount = 0;
    this.cellToTriangles = new Map();
    this.seenTriangles = new Set();
    this.scratchA = new THREE.Vector3();
    this.scratchB = new THREE.Vector3();
    this.scratchC = new THREE.Vector3();
    this.scratchNormal = new THREE.Vector3();
  }

  /** Clears all triangles and spatial buckets. */
  clear(): void {
    this.vertexData.length = 0;
    this.normalData.length = 0;
    this.triangleCount = 0;
    this.cellToTriangles.clear();
  }

  /**
   * Returns the number of baked triangles.
   *
   * @returns Triangle count.
   */
  getTriangleCount(): number {
    return this.triangleCount;
  }

  /**
   * Bakes every triangle from a mesh into world space using its matrix.
   *
   * @param mesh Source mesh with BufferGeometry.
   */
  bakeMesh(mesh: THREE.Mesh): void {
    const geometry = mesh.geometry;
    if (!geometry) {
      return;
    }
    const positions = geometry.getAttribute('position');
    if (!positions) {
      return;
    }
    mesh.updateMatrixWorld(false);
    const triangleCount = getTriangleCount(geometry);
    for (let faceIndex = 0; faceIndex < triangleCount; faceIndex++) {
      this.bakeOneTriangle(geometry, positions, mesh.matrixWorld, faceIndex);
    }
  }

  /**
   * Appends triangle indices whose AABBs may overlap the query box.
   *
   * @param queryBox World-space AABB.
   * @param outIndices Destination list cleared by the caller or extended.
   * @returns Number of indices written into outIndices from previous length.
   */
  queryAabb(queryBox: THREE.Box3, outIndices: number[]): number {
    const startLength = outIndices.length;
    this.seenTriangles.clear();
    const minX = Math.floor(queryBox.min.x / SOUP_GRID_CELL_SIZE_METERS);
    const maxX = Math.floor(queryBox.max.x / SOUP_GRID_CELL_SIZE_METERS);
    const minY = Math.floor(queryBox.min.y / SOUP_GRID_CELL_SIZE_METERS);
    const maxY = Math.floor(queryBox.max.y / SOUP_GRID_CELL_SIZE_METERS);
    const minZ = Math.floor(queryBox.min.z / SOUP_GRID_CELL_SIZE_METERS);
    const maxZ = Math.floor(queryBox.max.z / SOUP_GRID_CELL_SIZE_METERS);
    this.collectCells(minX, maxX, minY, maxY, minZ, maxZ, outIndices);
    return outIndices.length - startLength;
  }

  /**
   * Writes the three world vertices of a triangle into the targets.
   *
   * @param triangleIndex Triangle index.
   * @param vertexA Destination for vertex A.
   * @param vertexB Destination for vertex B.
   * @param vertexC Destination for vertex C.
   */
  loadTriangleVertices(
    triangleIndex: number,
    vertexA: THREE.Vector3,
    vertexB: THREE.Vector3,
    vertexC: THREE.Vector3,
  ): void {
    const base = triangleIndex * 9;
    vertexA.set(this.vertexData[base] ?? 0, this.vertexData[base + 1] ?? 0, this.vertexData[base + 2] ?? 0);
    vertexB.set(this.vertexData[base + 3] ?? 0, this.vertexData[base + 4] ?? 0, this.vertexData[base + 5] ?? 0);
    vertexC.set(this.vertexData[base + 6] ?? 0, this.vertexData[base + 7] ?? 0, this.vertexData[base + 8] ?? 0);
  }

  /**
   * Writes the stored unit normal of a triangle into the target.
   *
   * @param triangleIndex Triangle index.
   * @param target Destination normal.
   */
  loadTriangleNormal(triangleIndex: number, target: THREE.Vector3): void {
    const base = triangleIndex * 3;
    target.set(this.normalData[base] ?? 0, this.normalData[base + 1] ?? 1, this.normalData[base + 2] ?? 0);
  }

  /**
   * Bakes one triangle face into the soup.
   *
   * @param geometry Source geometry.
   * @param positions Position attribute.
   * @param matrixWorld Mesh world matrix.
   * @param faceIndex Triangle face index.
   */
  private bakeOneTriangle(
    geometry: THREE.BufferGeometry,
    positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    matrixWorld: THREE.Matrix4,
    faceIndex: number,
  ): void {
    const [i0, i1, i2] = getTriangleVertexIndices(geometry, faceIndex);
    this.scratchA.set(positions.getX(i0), positions.getY(i0), positions.getZ(i0)).applyMatrix4(matrixWorld);
    this.scratchB.set(positions.getX(i1), positions.getY(i1), positions.getZ(i1)).applyMatrix4(matrixWorld);
    this.scratchC.set(positions.getX(i2), positions.getY(i2), positions.getZ(i2)).applyMatrix4(matrixWorld);
    if (!playerTriangleNormalFromVertices(this.scratchA, this.scratchB, this.scratchC, this.scratchNormal)) {
      return;
    }
    this.appendTriangle(this.scratchA, this.scratchB, this.scratchC, this.scratchNormal);
  }

  /**
   * Stores one world triangle and inserts it into spatial hash cells.
   *
   * @param vertexA World vertex A.
   * @param vertexB World vertex B.
   * @param vertexC World vertex C.
   * @param normal Unit world normal.
   */
  private appendTriangle(
    vertexA: THREE.Vector3,
    vertexB: THREE.Vector3,
    vertexC: THREE.Vector3,
    normal: THREE.Vector3,
  ): void {
    const triangleIndex = this.triangleCount;
    this.vertexData.push(
      vertexA.x,
      vertexA.y,
      vertexA.z,
      vertexB.x,
      vertexB.y,
      vertexB.z,
      vertexC.x,
      vertexC.y,
      vertexC.z,
    );
    this.normalData.push(normal.x, normal.y, normal.z);
    this.triangleCount += 1;
    this.insertTriangleIntoGrid(triangleIndex, vertexA, vertexB, vertexC);
  }

  /**
   * Buckets a triangle into every overlapping spatial hash cell.
   *
   * @param triangleIndex Triangle index.
   * @param vertexA World vertex A.
   * @param vertexB World vertex B.
   * @param vertexC World vertex C.
   */
  private insertTriangleIntoGrid(
    triangleIndex: number,
    vertexA: THREE.Vector3,
    vertexB: THREE.Vector3,
    vertexC: THREE.Vector3,
  ): void {
    const minX = Math.floor(Math.min(vertexA.x, vertexB.x, vertexC.x) / SOUP_GRID_CELL_SIZE_METERS);
    const maxX = Math.floor(Math.max(vertexA.x, vertexB.x, vertexC.x) / SOUP_GRID_CELL_SIZE_METERS);
    const minY = Math.floor(Math.min(vertexA.y, vertexB.y, vertexC.y) / SOUP_GRID_CELL_SIZE_METERS);
    const maxY = Math.floor(Math.max(vertexA.y, vertexB.y, vertexC.y) / SOUP_GRID_CELL_SIZE_METERS);
    const minZ = Math.floor(Math.min(vertexA.z, vertexB.z, vertexC.z) / SOUP_GRID_CELL_SIZE_METERS);
    const maxZ = Math.floor(Math.max(vertexA.z, vertexB.z, vertexC.z) / SOUP_GRID_CELL_SIZE_METERS);
    for (let cellX = minX; cellX <= maxX; cellX++) {
      for (let cellY = minY; cellY <= maxY; cellY++) {
        for (let cellZ = minZ; cellZ <= maxZ; cellZ++) {
          this.pushTriangleIntoCell(packSoupCellKey(cellX, cellY, cellZ), triangleIndex);
        }
      }
    }
  }

  /**
   * Appends a triangle index to one spatial hash bucket.
   *
   * @param cellKey Packed cell key.
   * @param triangleIndex Triangle index.
   */
  private pushTriangleIntoCell(cellKey: number, triangleIndex: number): void {
    let bucket = this.cellToTriangles.get(cellKey);
    if (!bucket) {
      bucket = [];
      this.cellToTriangles.set(cellKey, bucket);
    }
    bucket.push(triangleIndex);
  }

  /**
   * Collects unique triangle indices from all cells overlapping a range.
   *
   * @param minX Inclusive min cell X.
   * @param maxX Inclusive max cell X.
   * @param minY Inclusive min cell Y.
   * @param maxY Inclusive max cell Y.
   * @param minZ Inclusive min cell Z.
   * @param maxZ Inclusive max cell Z.
   * @param outIndices Destination list.
   */
  private collectCells(
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
    outIndices: number[],
  ): void {
    for (let cellX = minX; cellX <= maxX; cellX++) {
      for (let cellY = minY; cellY <= maxY; cellY++) {
        for (let cellZ = minZ; cellZ <= maxZ; cellZ++) {
          if (outIndices.length >= SOUP_QUERY_TRIANGLE_LIMIT) {
            return;
          }
          this.appendCellTriangles(packSoupCellKey(cellX, cellY, cellZ), outIndices);
        }
      }
    }
  }

  /**
   * Appends unseen triangles from one cell into the output list.
   *
   * @param cellKey Packed cell key.
   * @param outIndices Destination list.
   */
  private appendCellTriangles(cellKey: number, outIndices: number[]): void {
    const bucket = this.cellToTriangles.get(cellKey);
    if (!bucket) {
      return;
    }
    for (let index = 0; index < bucket.length; index++) {
      const triangleIndex = bucket[index];
      if (triangleIndex === undefined || this.seenTriangles.has(triangleIndex)) {
        continue;
      }
      if (outIndices.length >= SOUP_QUERY_TRIANGLE_LIMIT) {
        return;
      }
      this.seenTriangles.add(triangleIndex);
      outIndices.push(triangleIndex);
    }
  }
}

/**
 * Packs 3D cell coordinates into a single map key.
 *
 * @param cellX Cell X index.
 * @param cellY Cell Y index.
 * @param cellZ Cell Z index.
 * @returns Packed key.
 */
function packSoupCellKey(cellX: number, cellY: number, cellZ: number): number {
  const x = (cellX + 0x400) & 0x7ff;
  const y = (cellY + 0x400) & 0x7ff;
  const z = (cellZ + 0x400) & 0x7ff;
  return x | (y << 11) | (z << 22);
}
