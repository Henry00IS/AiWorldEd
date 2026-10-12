import * as THREE from 'three';
import { getTriangleCount, getTriangleVertexIndices } from './utils_triangle_geometry.js';

/** Closest triangle hit from a local-space ray against a triangle BVH. */
export interface TriangleBvhHit {
  faceIndex: number;
  distance: number;
  point: THREE.Vector3;
  localNormal: THREE.Vector3;
}

/** Internal BVH node stored in a flat array. */
interface TriangleBvhNode {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  left: number;
  right: number;
  start: number;
  count: number;
}

/** Maximum triangles stored in one leaf before further splits stop. */
const LEAF_TRIANGLE_LIMIT = 8;

/**
 * Axis-aligned bounding volume hierarchy over mesh triangles for fast local ray
 * queries. Built once per geometry stamp and reused across picks.
 */
export class TriangleBvh {
  private readonly nodes: TriangleBvhNode[];
  private readonly triangleIndices: number[];
  private readonly positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  private readonly geometry: THREE.BufferGeometry;
  private triangleCentroids = new Float32Array(0);
  private triangleBounds = new Float32Array(0);
  private readonly vertexA = new THREE.Vector3();
  private readonly vertexB = new THREE.Vector3();
  private readonly vertexC = new THREE.Vector3();
  private readonly edge1 = new THREE.Vector3();
  private readonly edge2 = new THREE.Vector3();
  private readonly pvec = new THREE.Vector3();
  private readonly tvec = new THREE.Vector3();
  private readonly qvec = new THREE.Vector3();
  private readonly centroid = new THREE.Vector3();

  /**
   * Builds a BVH for the given geometry.
   *
   * @param geometry Source buffer geometry (indexed or non-indexed).
   */
  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry;
    const positions = geometry.getAttribute('position');
    if (!positions) {
      this.positions = new THREE.BufferAttribute(new Float32Array(0), 3);
      this.triangleIndices = [];
      this.nodes = [];
      return;
    }
    this.positions = positions;
    const triangleCount = getTriangleCount(geometry);
    this.triangleIndices = new Array(triangleCount);
    for (let index = 0; index < triangleCount; index++) {
      this.triangleIndices[index] = index;
    }
    this.nodes = [];
    this.prepareTriangleTables(triangleCount);
    if (triangleCount > 0) {
      this.buildNode(0, triangleCount);
    }
  }

  /**
   * Finds the closest front-facing triangle hit for a ray in local mesh space.
   *
   * @param localOrigin Ray origin in mesh-local coordinates.
   * @param localDirection Normalized ray direction in mesh-local coordinates.
   * @param maxDistance Maximum ray distance to consider.
   * @returns Closest front-facing hit, or null when none.
   */
  raycastFrontFacing(
    localOrigin: THREE.Vector3,
    localDirection: THREE.Vector3,
    maxDistance: number = Infinity,
  ): TriangleBvhHit | null {
    return this.raycastClosest(localOrigin, localDirection, maxDistance, true);
  }

  /**
   * Finds the closest triangle hit on either face (object-select style).
   *
   * @param localOrigin Ray origin in mesh-local coordinates.
   * @param localDirection Normalized ray direction in mesh-local coordinates.
   * @param maxDistance Maximum ray distance to consider.
   * @returns Closest hit, or null when none.
   */
  raycastDoubleSided(
    localOrigin: THREE.Vector3,
    localDirection: THREE.Vector3,
    maxDistance: number = Infinity,
  ): TriangleBvhHit | null {
    return this.raycastClosest(localOrigin, localDirection, maxDistance, false);
  }

  /**
   * Traverses the BVH for the closest triangle hit.
   *
   * @param localOrigin Ray origin in mesh-local coordinates.
   * @param localDirection Normalized ray direction in mesh-local coordinates.
   * @param maxDistance Maximum ray distance to consider.
   * @param frontFacingOnly When true, reject back-facing triangles.
   * @returns Closest hit, or null when none.
   */
  private raycastClosest(
    localOrigin: THREE.Vector3,
    localDirection: THREE.Vector3,
    maxDistance: number,
    frontFacingOnly: boolean,
  ): TriangleBvhHit | null {
    if (this.nodes.length === 0) return null;
    let bestDistance = maxDistance;
    let bestFaceIndex = -1;
    const stack: number[] = [0];
    while (stack.length > 0) {
      const nodeIndex = stack.pop()!;
      const node = this.nodes[nodeIndex]!;
      if (!this.rayIntersectsAabb(localOrigin, localDirection, node, bestDistance)) {
        continue;
      }
      if (node.left < 0) {
        const leafHit = this.raycastLeaf(node, localOrigin, localDirection, bestDistance, frontFacingOnly);
        if (leafHit) {
          bestDistance = leafHit.distance;
          bestFaceIndex = leafHit.faceIndex;
        }
        continue;
      }
      stack.push(node.right, node.left);
    }
    if (bestFaceIndex < 0) return null;
    return this.buildHitResult(bestFaceIndex, localOrigin, localDirection, bestDistance);
  }

  /**
   * Recursively builds a BVH node over a triangle index range.
   *
   * @param start Inclusive start into triangleIndices.
   * @param count Triangle count in the range.
   * @returns Index of the created node.
   */
  private buildNode(start: number, count: number): number {
    const nodeIndex = this.nodes.length;
    const node: TriangleBvhNode = {
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity,
      left: -1,
      right: -1,
      start,
      count,
    };
    this.nodes.push(node);
    this.expandNodeBounds(node);
    if (count <= LEAF_TRIANGLE_LIMIT) {
      return nodeIndex;
    }
    const split = this.partitionAroundMedian(start, count);
    if (split <= start || split >= start + count) {
      return nodeIndex;
    }
    node.left = this.buildNode(start, split - start);
    node.right = this.buildNode(split, start + count - split);
    return nodeIndex;
  }

  /**
   * Expands a node's AABB to cover every triangle in its range.
   *
   * @param node Target node whose bounds are written.
   */
  private expandNodeBounds(node: TriangleBvhNode): void {
    const end = node.start + node.count;
    for (let index = node.start; index < end; index++) {
      this.expandBoundsWithTriangle(node, this.triangleIndices[index]!);
    }
  }

  /**
   * Expands an AABB with one triangle's vertices.
   *
   * @param node Bounds receiver.
   * @param faceIndex Triangle index in the geometry.
   */
  private expandBoundsWithTriangle(node: TriangleBvhNode, faceIndex: number): void {
    const offset = faceIndex * 6;
    const minX = this.triangleBounds[offset] ?? Infinity;
    const minY = this.triangleBounds[offset + 1] ?? Infinity;
    const minZ = this.triangleBounds[offset + 2] ?? Infinity;
    const maxX = this.triangleBounds[offset + 3] ?? -Infinity;
    const maxY = this.triangleBounds[offset + 4] ?? -Infinity;
    const maxZ = this.triangleBounds[offset + 5] ?? -Infinity;
    this.includeBounds(node, minX, minY, minZ, maxX, maxY, maxZ);
  }

  /**
   * Sorts a triangle range by centroid on the longest extent axis and returns
   * the median index.
   *
   * @param start Range start.
   * @param count Range length.
   * @returns Median split index.
   */
  private partitionAroundMedian(start: number, count: number): number {
    const end = start + count;
    const axis = this.longestCentroidAxis(start, end);
    const range = this.triangleIndices.slice(start, end);
    range.sort((left, right) => this.centroidAxisComponent(left, axis) - this.centroidAxisComponent(right, axis));
    for (let index = 0; index < range.length; index++) {
      this.triangleIndices[start + index] = range[index]!;
    }
    return start + (count >> 1);
  }

  /**
   * Chooses the axis with the largest centroid extent for splitting.
   *
   * @param start Inclusive start.
   * @param end Exclusive end.
   * @returns 0=x, 1=y, 2=z.
   */
  private longestCentroidAxis(start: number, end: number): number {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let index = start; index < end; index++) {
      this.loadTriangleCentroid(this.triangleIndices[index]!, this.centroid);
      minX = Math.min(minX, this.centroid.x);
      minY = Math.min(minY, this.centroid.y);
      minZ = Math.min(minZ, this.centroid.z);
      maxX = Math.max(maxX, this.centroid.x);
      maxY = Math.max(maxY, this.centroid.y);
      maxZ = Math.max(maxZ, this.centroid.z);
    }
    const extentX = maxX - minX;
    const extentY = maxY - minY;
    const extentZ = maxZ - minZ;
    if (extentX >= extentY && extentX >= extentZ) return 0;
    if (extentY >= extentZ) return 1;
    return 2;
  }

  /**
   * Returns one centroid axis component for a triangle.
   *
   * @param faceIndex Triangle index.
   * @param axis 0=x, 1=y, 2=z.
   * @returns Centroid component.
   */
  private centroidAxisComponent(faceIndex: number, axis: number): number {
    this.loadTriangleCentroid(faceIndex, this.centroid);
    return axis === 0 ? this.centroid.x : axis === 1 ? this.centroid.y : this.centroid.z;
  }

  /**
   * Writes a triangle centroid into a target vector.
   *
   * @param faceIndex Triangle index.
   * @param target Output vector.
   */
  private loadTriangleCentroid(faceIndex: number, target: THREE.Vector3): void {
    const offset = faceIndex * 3;
    target.set(
      this.triangleCentroids[offset] ?? 0,
      this.triangleCentroids[offset + 1] ?? 0,
      this.triangleCentroids[offset + 2] ?? 0,
    );
  }

  /**
   * Stores each triangle centroid and AABB once before the tree is split.
   *
   * @param triangleCount Triangle count.
   */
  private prepareTriangleTables(triangleCount: number): void {
    this.triangleCentroids = new Float32Array(triangleCount * 3);
    this.triangleBounds = new Float32Array(triangleCount * 6);
    for (let faceIndex = 0; faceIndex < triangleCount; faceIndex++) {
      this.writeTriangleTable(faceIndex);
    }
  }

  /**
   * Writes one triangle centroid and AABB into the build tables.
   *
   * @param faceIndex Triangle index.
   */
  private writeTriangleTable(faceIndex: number): void {
    const [i0, i1, i2] = getTriangleVertexIndices(this.geometry, faceIndex);
    const x0 = this.positions.getX(i0);
    const y0 = this.positions.getY(i0);
    const z0 = this.positions.getZ(i0);
    const x1 = this.positions.getX(i1);
    const y1 = this.positions.getY(i1);
    const z1 = this.positions.getZ(i1);
    const x2 = this.positions.getX(i2);
    const y2 = this.positions.getY(i2);
    const z2 = this.positions.getZ(i2);
    this.writeTriangleCentroid(faceIndex, x0, y0, z0, x1, y1, z1, x2, y2, z2);
    this.writeTriangleBounds(faceIndex, x0, y0, z0, x1, y1, z1, x2, y2, z2);
  }

  /**
   * Writes one triangle centroid.
   *
   * @param faceIndex Triangle index.
   * @param x0 First vertex X.
   * @param y0 First vertex Y.
   * @param z0 First vertex Z.
   * @param x1 Second vertex X.
   * @param y1 Second vertex Y.
   * @param z1 Second vertex Z.
   * @param x2 Third vertex X.
   * @param y2 Third vertex Y.
   * @param z2 Third vertex Z.
   */
  private writeTriangleCentroid(
    faceIndex: number,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
  ): void {
    const offset = faceIndex * 3;
    this.triangleCentroids[offset] = (x0 + x1 + x2) / 3;
    this.triangleCentroids[offset + 1] = (y0 + y1 + y2) / 3;
    this.triangleCentroids[offset + 2] = (z0 + z1 + z2) / 3;
  }

  /**
   * Writes one triangle AABB.
   *
   * @param faceIndex Triangle index.
   * @param x0 First vertex X.
   * @param y0 First vertex Y.
   * @param z0 First vertex Z.
   * @param x1 Second vertex X.
   * @param y1 Second vertex Y.
   * @param z1 Second vertex Z.
   * @param x2 Third vertex X.
   * @param y2 Third vertex Y.
   * @param z2 Third vertex Z.
   */
  private writeTriangleBounds(
    faceIndex: number,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
  ): void {
    const offset = faceIndex * 6;
    this.triangleBounds[offset] = Math.min(x0, x1, x2);
    this.triangleBounds[offset + 1] = Math.min(y0, y1, y2);
    this.triangleBounds[offset + 2] = Math.min(z0, z1, z2);
    this.triangleBounds[offset + 3] = Math.max(x0, x1, x2);
    this.triangleBounds[offset + 4] = Math.max(y0, y1, y2);
    this.triangleBounds[offset + 5] = Math.max(z0, z1, z2);
  }

  /**
   * Includes a precomputed AABB in a node.
   *
   * @param node Bounds receiver.
   * @param minX Minimum X.
   * @param minY Minimum Y.
   * @param minZ Minimum Z.
   * @param maxX Maximum X.
   * @param maxY Maximum Y.
   * @param maxZ Maximum Z.
   */
  private includeBounds(
    node: TriangleBvhNode,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ): void {
    if (minX < node.minX) node.minX = minX;
    if (minY < node.minY) node.minY = minY;
    if (minZ < node.minZ) node.minZ = minZ;
    if (maxX > node.maxX) node.maxX = maxX;
    if (maxY > node.maxY) node.maxY = maxY;
    if (maxZ > node.maxZ) node.maxZ = maxZ;
  }

  /**
   * Tests ray-AABB intersection with an optional maximum distance.
   *
   * @param origin Ray origin.
   * @param direction Ray direction.
   * @param node AABB node.
   * @param maxDistance Current closest hit distance.
   * @returns True when the ray may hit content closer than maxDistance.
   */
  private rayIntersectsAabb(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    node: TriangleBvhNode,
    maxDistance: number,
  ): boolean {
    const invX = 1 / (direction.x || 1e-20);
    const invY = 1 / (direction.y || 1e-20);
    const invZ = 1 / (direction.z || 1e-20);
    let t1 = (node.minX - origin.x) * invX;
    let t2 = (node.maxX - origin.x) * invX;
    let tMin = Math.min(t1, t2);
    let tMax = Math.max(t1, t2);
    t1 = (node.minY - origin.y) * invY;
    t2 = (node.maxY - origin.y) * invY;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    t1 = (node.minZ - origin.z) * invZ;
    t2 = (node.maxZ - origin.z) * invZ;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    return tMax >= Math.max(tMin, 0) && tMin < maxDistance;
  }

  /**
   * Tests every triangle in a leaf and returns the closest accepted hit.
   *
   * @param node Leaf node.
   * @param origin Ray origin.
   * @param direction Ray direction.
   * @param bestDistance Current best distance.
   * @param frontFacingOnly When true, reject back-facing triangles.
   * @returns Closest leaf hit, or null.
   */
  private raycastLeaf(
    node: TriangleBvhNode,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    bestDistance: number,
    frontFacingOnly: boolean,
  ): { faceIndex: number; distance: number } | null {
    const end = node.start + node.count;
    let distance = bestDistance;
    let faceIndex = -1;
    for (let index = node.start; index < end; index++) {
      const candidate = this.triangleIndices[index]!;
      const hitDistance = this.intersectTriangle(candidate, origin, direction, distance, frontFacingOnly);
      if (hitDistance === null) continue;
      distance = hitDistance;
      faceIndex = candidate;
    }
    if (faceIndex < 0) return null;
    return { faceIndex, distance };
  }

  /**
   * Möller–Trumbore triangle intersection with optional front-face culling.
   *
   * @param faceIndex Triangle index.
   * @param origin Ray origin.
   * @param direction Ray direction.
   * @param maxDistance Maximum accepted distance.
   * @param frontFacingOnly When true, reject back-facing triangles.
   * @returns Hit distance, or null when missed / culled / farther.
   */
  private intersectTriangle(
    faceIndex: number,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    frontFacingOnly: boolean,
  ): number | null {
    const [i0, i1, i2] = getTriangleVertexIndices(this.geometry, faceIndex);
    this.vertexA.set(this.positions.getX(i0), this.positions.getY(i0), this.positions.getZ(i0));
    this.vertexB.set(this.positions.getX(i1), this.positions.getY(i1), this.positions.getZ(i1));
    this.vertexC.set(this.positions.getX(i2), this.positions.getY(i2), this.positions.getZ(i2));
    this.edge1.subVectors(this.vertexB, this.vertexA);
    this.edge2.subVectors(this.vertexC, this.vertexA);
    this.pvec.crossVectors(direction, this.edge2);
    const determinant = this.edge1.dot(this.pvec);
    if (frontFacingOnly) {
      if (determinant <= 1e-12) return null;
    } else if (Math.abs(determinant) <= 1e-12) {
      return null;
    }
    const inverseDeterminant = 1 / determinant;
    this.tvec.subVectors(origin, this.vertexA);
    const u = this.tvec.dot(this.pvec) * inverseDeterminant;
    if (u < 0 || u > 1) return null;
    this.qvec.crossVectors(this.tvec, this.edge1);
    const v = direction.dot(this.qvec) * inverseDeterminant;
    if (v < 0 || u + v > 1) return null;
    const distance = this.edge2.dot(this.qvec) * inverseDeterminant;
    if (distance < 0 || distance >= maxDistance) return null;
    return distance;
  }

  /**
   * Builds a hit result for the closest accepted face.
   *
   * @param faceIndex Winning triangle index.
   * @param origin Ray origin.
   * @param direction Ray direction.
   * @param distance Hit distance.
   * @returns Structured hit.
   */
  private buildHitResult(
    faceIndex: number,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    distance: number,
  ): TriangleBvhHit {
    const [i0, i1, i2] = getTriangleVertexIndices(this.geometry, faceIndex);
    this.vertexA.set(this.positions.getX(i0), this.positions.getY(i0), this.positions.getZ(i0));
    this.vertexB.set(this.positions.getX(i1), this.positions.getY(i1), this.positions.getZ(i1));
    this.vertexC.set(this.positions.getX(i2), this.positions.getY(i2), this.positions.getZ(i2));
    this.edge1.subVectors(this.vertexB, this.vertexA);
    this.edge2.subVectors(this.vertexC, this.vertexA);
    const localNormal = new THREE.Vector3().crossVectors(this.edge1, this.edge2).normalize();
    const point = direction.clone().multiplyScalar(distance).add(origin);
    return { faceIndex, distance, point, localNormal };
  }
}
