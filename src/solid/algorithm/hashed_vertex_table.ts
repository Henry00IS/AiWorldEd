import * as THREE from 'three';
import { SOLID_SQR_VERTEX_EQUAL_EPSILON } from './solid_math_constants.js';

/**
 * Welds nearly-identical vertices for solid CSG intermediate geometry.
 */
export class HashedVertexTable {
  private readonly vertices: THREE.Vector3[] = [];
  private readonly cellMap = new Map<string, number[]>();
  private readonly cellSize: number;

  /**
   * Creates a hashed vertex table.
   * @param cellSize Spatial hash cell size (defaults near vertex epsilon).
   */
  constructor(cellSize: number = 0.001) {
    this.cellSize = cellSize;
  }

  /**
   * Inserts a point, returning the stable welded index.
   * @param point Point to insert.
   * @returns Index of the existing or newly created vertex.
   */
  add(point: THREE.Vector3): number {
    const cellKey = this.cellKeyForPoint(point);
    const candidates = this.gatherNearbyIndices(cellKey);
    for (const index of candidates) {
      if (this.vertices[index].distanceToSquared(point) <= SOLID_SQR_VERTEX_EQUAL_EPSILON) {
        return index;
      }
    }
    const newIndex = this.vertices.length;
    this.vertices.push(point.clone());
    this.storeIndexInCell(cellKey, newIndex);
    return newIndex;
  }

  /**
   * Returns the welded vertex list.
   * @returns Vertices in insertion order.
   */
  getVertices(): THREE.Vector3[] {
    return this.vertices.map((vertex) => vertex.clone());
  }

  /**
   * Returns the number of unique vertices.
   * @returns Vertex count.
   */
  get count(): number {
    return this.vertices.length;
  }

  /**
   * Returns a vertex by index.
   * @param index Vertex index.
   * @returns Vertex position.
   */
  get(index: number): THREE.Vector3 {
    return this.vertices[index];
  }

  /**
   * Builds a spatial hash key for a point.
   * @param point Point to hash.
   * @returns Cell key string.
   */
  private cellKeyForPoint(point: THREE.Vector3): string {
    const cellX = Math.floor(point.x / this.cellSize);
    const cellY = Math.floor(point.y / this.cellSize);
    const cellZ = Math.floor(point.z / this.cellSize);
    return `${cellX},${cellY},${cellZ}`;
  }

  /**
   * Collects candidate vertex indices from a cell and its neighbors.
   * @param cellKey Center cell key.
   * @returns Candidate indices.
   */
  private gatherNearbyIndices(cellKey: string): number[] {
    const [cx, cy, cz] = cellKey.split(',').map(Number);
    const result: number[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const bucket = this.cellMap.get(key);
          if (bucket) result.push(...bucket);
        }
      }
    }
    return result;
  }

  /**
   * Stores an index in a spatial cell bucket.
   * @param cellKey Cell key.
   * @param index Vertex index.
   */
  private storeIndexInCell(cellKey: string, index: number): void {
    const bucket = this.cellMap.get(cellKey);
    if (bucket) {
      bucket.push(index);
      return;
    }
    this.cellMap.set(cellKey, [index]);
  }
}
