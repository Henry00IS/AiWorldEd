import * as THREE from 'three';
import { DecalSoupTopology } from './decal_soup_topology.js';

/**
 * Lifts a triangle soup off the surfaces it was cut from. Corners at the same
 * position are treated as one vertex and move along one shared direction, so
 * the lifted mesh stays closed across edges and corners of the surfaces. The
 * lift is lengthened at creases so every face ends up at least the requested
 * distance above its source plane. A corner that lies inside an edge of a
 * triangle it is not welded to (a T-junction, which a seam pass may or may not
 * have added on the other side yet) also takes that triangle's direction, so
 * the lift is the same whether the junction was mended or not.
 */
export class DecalSurfaceLift {
  /** Smallest cosine used when lengthening the lift at a crease. */
  static readonly minimumCreaseCosine = 0.3;

  private readonly topology = new DecalSoupTopology();
  private readonly edgeA = new THREE.Vector3();
  private readonly edgeB = new THREE.Vector3();
  private directions = new Float64Array(0);
  private creaseCosines = new Float64Array(0);
  /** Flat pairs of welded vertex and the triangle whose edge it lies inside. */
  private junctions: number[] = [];

  /** Largest distance of a corner from an edge that still counts as on it. */
  static readonly junctionTolerance = 1e-4;

  /**
   * Returns lifted copies of the positions.
   *
   * @param positions Model-space positions, nine floats per triangle.
   * @param normals Shading normals that tell each triangle's front side.
   * @param distance Lift distance in model units.
   * @returns New position array of the same length.
   */
  lift(positions: Float32Array, normals: Float32Array, distance: number): Float32Array {
    const vertexCount = this.topology.analyze(positions, normals);
    this.scratchPrepare(vertexCount);
    this.junctionsFind(positions, vertexCount);
    this.directionsAccumulate(positions);
    this.directionsNormalize(vertexCount);
    this.creaseCosinesCompute(positions.length / 9);
    return this.positionsLifted(positions, distance);
  }

  /**
   * Sizes and clears the scratch arrays.
   *
   * @param vertexCount Number of welded vertices.
   */
  private scratchPrepare(vertexCount: number): void {
    if (this.directions.length < vertexCount * 3) this.directions = new Float64Array(vertexCount * 3);
    if (this.creaseCosines.length < vertexCount) this.creaseCosines = new Float64Array(vertexCount);
    this.directions.fill(0, 0, vertexCount * 3);
    this.creaseCosines.fill(1, 0, vertexCount);
  }

  /**
   * Finds corners lying inside an open edge of a triangle they are not welded
   * to. Only open edges (used by one triangle) and their corners can form such
   * junctions, so only those are compared, through a grid of edge cells.
   *
   * @param positions Model-space positions.
   * @param vertexCount Number of welded vertices.
   */
  private junctionsFind(positions: Float32Array, vertexCount: number): void {
    this.junctions = [];
    const vertexOf = this.topology.vertexOfCorner;
    const cornerCount = positions.length / 3;
    const edgeUses = new Map<number, number>();
    const edgeKey = (a: number, b: number) => (a < b ? a * vertexCount + b : b * vertexCount + a);
    for (let corner = 0; corner < cornerCount; corner++) {
      const next = corner - (corner % 3) + ((corner + 1) % 3);
      const key = edgeKey(vertexOf[corner] ?? 0, vertexOf[next] ?? 0);
      edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
    }
    const openEdges: number[] = [];
    const openVertexCorner = new Map<number, number>();
    let lengthSum = 0;
    for (let corner = 0; corner < cornerCount; corner++) {
      const next = corner - (corner % 3) + ((corner + 1) % 3);
      if (edgeUses.get(edgeKey(vertexOf[corner] ?? 0, vertexOf[next] ?? 0)) !== 1) continue;
      openEdges.push(corner);
      if (!openVertexCorner.has(vertexOf[corner] ?? 0)) openVertexCorner.set(vertexOf[corner] ?? 0, corner);
      if (!openVertexCorner.has(vertexOf[next] ?? 0)) openVertexCorner.set(vertexOf[next] ?? 0, next);
      lengthSum += this.edgeA.fromArray(positions, corner * 3).distanceTo(this.edgeB.fromArray(positions, next * 3));
    }
    if (openEdges.length < 2) return;
    const reach = DecalSurfaceLift.junctionTolerance;
    const cell = Math.max(lengthSum / openEdges.length, 1e-3);
    const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
    const grid = new Map<string, number[]>();
    for (const corner of openEdges) {
      const next = corner - (corner % 3) + ((corner + 1) % 3);
      const low = [0, 1, 2].map((axis) =>
        Math.floor((Math.min(positions[corner * 3 + axis] ?? 0, positions[next * 3 + axis] ?? 0) - reach) / cell),
      );
      const high = [0, 1, 2].map((axis) =>
        Math.floor((Math.max(positions[corner * 3 + axis] ?? 0, positions[next * 3 + axis] ?? 0) + reach) / cell),
      );
      for (let x = low[0] ?? 0; x <= (high[0] ?? 0); x++)
        for (let y = low[1] ?? 0; y <= (high[1] ?? 0); y++)
          for (let z = low[2] ?? 0; z <= (high[2] ?? 0); z++) {
            const key = cellKey(x, y, z);
            const list = grid.get(key);
            if (list) list.push(corner);
            else grid.set(key, [corner]);
          }
    }
    const point = new THREE.Vector3();
    const start = new THREE.Vector3();
    const along = new THREE.Vector3();
    const found = new Set<number>();
    for (const [vertex, vertexCorner] of openVertexCorner) {
      point.fromArray(positions, vertexCorner * 3);
      const key = cellKey(Math.floor(point.x / cell), Math.floor(point.y / cell), Math.floor(point.z / cell));
      for (const corner of grid.get(key) ?? []) {
        const next = corner - (corner % 3) + ((corner + 1) % 3);
        if (vertexOf[corner] === vertex || vertexOf[next] === vertex) continue;
        start.fromArray(positions, corner * 3);
        along.fromArray(positions, next * 3).sub(start);
        const lengthSq = along.lengthSq();
        if (lengthSq < reach * reach) continue;
        const t = this.edgeA.subVectors(point, start).dot(along) / lengthSq;
        if (t <= 0 || t >= 1) continue;
        if (this.edgeB.copy(start).addScaledVector(along, t).distanceToSquared(point) > reach * reach) continue;
        const triangle = Math.floor(corner / 3);
        const pair = vertex * (cornerCount / 3) + triangle;
        if (found.has(pair)) continue;
        found.add(pair);
        this.junctions.push(vertex, triangle);
      }
    }
  }

  /**
   * Adds every triangle's normal to its welded vertices, weighted by the
   * triangle's angle at each corner.
   *
   * @param positions Model-space positions.
   */
  private directionsAccumulate(positions: Float32Array): void {
    const triangleCount = positions.length / 9;
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      for (let corner = 0; corner < 3; corner++) {
        const weight = this.cornerAngle(positions, triangle, corner);
        const vertex = this.topology.vertexOfCorner[triangle * 3 + corner] ?? 0;
        for (let axis = 0; axis < 3; axis++) {
          this.directions[vertex * 3 + axis] =
            (this.directions[vertex * 3 + axis] ?? 0) + weight * (this.topology.faceNormals[triangle * 3 + axis] ?? 0);
        }
      }
    }
    for (let index = 0; index < this.junctions.length; index += 2) {
      const vertex = this.junctions[index] ?? 0;
      const triangle = this.junctions[index + 1] ?? 0;
      for (let axis = 0; axis < 3; axis++) {
        this.directions[vertex * 3 + axis] =
          (this.directions[vertex * 3 + axis] ?? 0) + Math.PI * (this.topology.faceNormals[triangle * 3 + axis] ?? 0);
      }
    }
  }

  /**
   * Returns a triangle's interior angle at one corner.
   *
   * @param positions Model-space positions.
   * @param triangle Triangle index.
   * @param corner Corner index within the triangle, 0 to 2.
   * @returns Angle in radians.
   */
  private cornerAngle(positions: Float32Array, triangle: number, corner: number): number {
    const here = (triangle * 3 + corner) * 3;
    const next = (triangle * 3 + ((corner + 1) % 3)) * 3;
    const previous = (triangle * 3 + ((corner + 2) % 3)) * 3;
    this.edgeA.set(
      (positions[next] ?? 0) - (positions[here] ?? 0),
      (positions[next + 1] ?? 0) - (positions[here + 1] ?? 0),
      (positions[next + 2] ?? 0) - (positions[here + 2] ?? 0),
    );
    this.edgeB.set(
      (positions[previous] ?? 0) - (positions[here] ?? 0),
      (positions[previous + 1] ?? 0) - (positions[here + 1] ?? 0),
      (positions[previous + 2] ?? 0) - (positions[here + 2] ?? 0),
    );
    if (this.edgeA.lengthSq() === 0 || this.edgeB.lengthSq() === 0) return 0;
    return this.edgeA.angleTo(this.edgeB);
  }

  /**
   * Scales every accumulated vertex direction to unit length.
   *
   * @param vertexCount Number of welded vertices.
   */
  private directionsNormalize(vertexCount: number): void {
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const x = this.directions[vertex * 3] ?? 0;
      const y = this.directions[vertex * 3 + 1] ?? 0;
      const z = this.directions[vertex * 3 + 2] ?? 0;
      const length = Math.hypot(x, y, z) || 1;
      this.directions[vertex * 3] = x / length;
      this.directions[vertex * 3 + 1] = y / length;
      this.directions[vertex * 3 + 2] = z / length;
    }
  }

  /**
   * Stores, per welded vertex, the smallest cosine between its direction and
   * the normals of the triangles around it.
   *
   * @param triangleCount Number of triangles.
   */
  private creaseCosinesCompute(triangleCount: number): void {
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      for (let corner = 0; corner < 3; corner++) {
        const vertex = this.topology.vertexOfCorner[triangle * 3 + corner] ?? 0;
        const cosine =
          (this.directions[vertex * 3] ?? 0) * (this.topology.faceNormals[triangle * 3] ?? 0) +
          (this.directions[vertex * 3 + 1] ?? 0) * (this.topology.faceNormals[triangle * 3 + 1] ?? 0) +
          (this.directions[vertex * 3 + 2] ?? 0) * (this.topology.faceNormals[triangle * 3 + 2] ?? 0);
        this.creaseCosines[vertex] = Math.min(this.creaseCosines[vertex] ?? 1, cosine);
      }
    }
    for (let index = 0; index < this.junctions.length; index += 2) {
      const vertex = this.junctions[index] ?? 0;
      const triangle = this.junctions[index + 1] ?? 0;
      let cosine = 0;
      for (let axis = 0; axis < 3; axis++) {
        cosine += (this.directions[vertex * 3 + axis] ?? 0) * (this.topology.faceNormals[triangle * 3 + axis] ?? 0);
      }
      this.creaseCosines[vertex] = Math.min(this.creaseCosines[vertex] ?? 1, cosine);
    }
  }

  /**
   * Returns the positions moved along their welded vertex directions.
   *
   * @param positions Model-space positions.
   * @param distance Lift distance in model units.
   * @returns Lifted positions.
   */
  private positionsLifted(positions: Float32Array, distance: number): Float32Array {
    const lifted = new Float32Array(positions.length);
    const cornerCount = positions.length / 3;
    for (let corner = 0; corner < cornerCount; corner++) {
      const vertex = this.topology.vertexOfCorner[corner] ?? 0;
      const cosine = Math.max(DecalSurfaceLift.minimumCreaseCosine, this.creaseCosines[vertex] ?? 1);
      const length = distance / cosine;
      for (let axis = 0; axis < 3; axis++) {
        lifted[corner * 3 + axis] =
          (positions[corner * 3 + axis] ?? 0) + (this.directions[vertex * 3 + axis] ?? 0) * length;
      }
    }
    return lifted;
  }
}
