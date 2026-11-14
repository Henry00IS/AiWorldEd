import * as THREE from 'three';
import { SEAM_CORNER_MINIMUM_TURN_SINE } from './seam_constants.js';

/**
 * Triangulates a convex polygon whose edges may carry extra vertices lying on
 * them, without producing zero-area triangles.
 */
export class SeamPolygonTriangulator {
  private readonly scratchNormal = new THREE.Vector3();

  /**
   * Returns local corner indices, three per triangle, in the polygon's own
   * winding.
   *
   * @param vertices Convex polygon vertices, some possibly collinear.
   * @returns Flat triangle corner indices; n - 2 triangles for n vertices.
   */
  triangulate(vertices: readonly THREE.Vector3[]): number[] {
    const count = vertices.length;
    if (count < 3) return [];
    const normal = this.computePolygonNormal(vertices);
    const apex = this.findFanApex(vertices, normal);
    if (apex >= 0) return this.fanFrom(apex, count);
    return this.clipRealCorners(vertices, normal);
  }

  /**
   * Whether an outline encloses area: it needs three real corners.
   *
   * @param vertices Polygon vertices.
   * @returns False for outlines whose vertices all lie on one line.
   */
  outlineHasArea(vertices: readonly THREE.Vector3[]): boolean {
    if (vertices.length < 3) return false;
    const ring = vertices.map((_vertex, index) => index);
    return this.countRingCorners(vertices, ring, this.computePolygonNormal(vertices)) >= 3;
  }

  /**
   * Newell normal of the polygon, scaled by twice its area.
   *
   * @param vertices Polygon vertices.
   * @returns Shared scratch normal.
   */
  private computePolygonNormal(vertices: readonly THREE.Vector3[]): THREE.Vector3 {
    const normal = this.scratchNormal.set(0, 0, 0);
    for (let index = 0; index < vertices.length; index++) {
      const current = vertices[index]!;
      const next = vertices[(index + 1) % vertices.length]!;
      normal.x += (current.y - next.y) * (current.z + next.z);
      normal.y += (current.z - next.z) * (current.x + next.x);
      normal.z += (current.x - next.x) * (current.y + next.y);
    }
    return normal;
  }

  /**
   * Finds the vertex whose fan gives every triangle an area and makes its
   * thinnest triangle as wide as possible, so near-collinear runs of corners
   * are not fanned into slivers.
   *
   * @param vertices Polygon vertices.
   * @param normal Polygon normal.
   * @returns Apex index or -1 when no vertex works.
   */
  private findFanApex(vertices: readonly THREE.Vector3[], normal: THREE.Vector3): number {
    let bestApex = -1;
    let bestWidth = -1;
    for (let apex = 0; apex < vertices.length; apex++) {
      if (!this.fanHasAreaEverywhere(vertices, normal, apex)) continue;
      const width = this.fanThinnestWidth(vertices, apex, bestWidth);
      if (width > bestWidth) {
        bestWidth = width;
        bestApex = apex;
      }
    }
    return bestApex;
  }

  /**
   * Width of the thinnest fan triangle around an apex: twice its area over its
   * longest edge squared (scale free). Stops early once below a known width.
   *
   * @param vertices Polygon vertices.
   * @param apex Apex index.
   * @param widthToBeat Width of the best fan so far.
   * @returns Smallest triangle width of the fan.
   */
  private fanThinnestWidth(vertices: readonly THREE.Vector3[], apex: number, widthToBeat: number): number {
    const count = vertices.length;
    let thinnest = Infinity;
    for (let step = 1; step < count - 1 && thinnest > widthToBeat; step++) {
      const width = seamTriangleWidth(
        vertices[apex]!,
        vertices[(apex + step) % count]!,
        vertices[(apex + step + 1) % count]!,
      );
      thinnest = Math.min(thinnest, width);
    }
    return thinnest;
  }

  /**
   * Whether every triangle of the fan around an apex has an area.
   *
   * @param vertices Polygon vertices.
   * @param normal Polygon normal.
   * @param apex Apex index.
   * @returns True when no fan triangle is flat.
   */
  private fanHasAreaEverywhere(vertices: readonly THREE.Vector3[], normal: THREE.Vector3, apex: number): boolean {
    const count = vertices.length;
    for (let step = 1; step < count - 1; step++) {
      const first = vertices[(apex + step) % count]!;
      const second = vertices[(apex + step + 1) % count]!;
      if (!seamTurnsAt(vertices[apex]!, first, second, normal)) return false;
    }
    return true;
  }

  /**
   * Fan triangulation around an apex.
   *
   * @param apex Apex index.
   * @param count Vertex count.
   * @returns Flat triangle corner indices.
   */
  private fanFrom(apex: number, count: number): number[] {
    const indices: number[] = [];
    for (let step = 1; step < count - 1; step++) {
      indices.push(apex, (apex + step) % count, (apex + step + 1) % count);
    }
    return indices;
  }

  /**
   * Repeatedly cuts off a real corner whose removal leaves an outline that can
   * still be finished without flat triangles.
   *
   * @param vertices Polygon vertices.
   * @param normal Polygon normal.
   * @returns Flat triangle corner indices.
   */
  private clipRealCorners(vertices: readonly THREE.Vector3[], normal: THREE.Vector3): number[] {
    const ring: number[] = vertices.map((_vertex, index) => index);
    const indices: number[] = [];
    while (ring.length > 3) {
      const position = this.findClippableRingPosition(vertices, ring, normal);
      const size = ring.length;
      indices.push(ring[(position + size - 1) % size]!, ring[position]!, ring[(position + 1) % size]!);
      ring.splice(position, 1);
    }
    indices.push(ring[0]!, ring[1]!, ring[2]!);
    return indices;
  }

  /**
   * Picks the ring position of a real corner to cut off: preferably one after
   * which at least three real corners remain.
   *
   * @param vertices Polygon vertices.
   * @param ring Remaining vertex indices.
   * @param normal Polygon normal.
   * @returns Ring position to cut off.
   */
  private findClippableRingPosition(vertices: readonly THREE.Vector3[], ring: number[], normal: THREE.Vector3): number {
    let fallback = -1;
    for (let position = 0; position < ring.length; position++) {
      if (!this.ringTurnsAt(vertices, ring, position, normal)) continue;
      if (fallback < 0) fallback = position;
      const removed = ring.splice(position, 1)[0]!;
      const stillSolid = this.countRingCorners(vertices, ring, normal) >= 3;
      ring.splice(position, 0, removed);
      if (stillSolid) return position;
    }
    return Math.max(fallback, 0);
  }

  /**
   * Whether the ring turns at one position.
   *
   * @param vertices Polygon vertices.
   * @param ring Vertex indices.
   * @param position Ring position.
   * @param normal Polygon normal.
   * @returns True for a real corner.
   */
  private ringTurnsAt(
    vertices: readonly THREE.Vector3[],
    ring: readonly number[],
    position: number,
    normal: THREE.Vector3,
  ): boolean {
    const size = ring.length;
    const previous = vertices[ring[(position + size - 1) % size]!]!;
    const next = vertices[ring[(position + 1) % size]!]!;
    return seamTurnsAt(previous, vertices[ring[position]!]!, next, normal);
  }

  /**
   * Counts the real corners of a ring.
   *
   * @param vertices Polygon vertices.
   * @param ring Vertex indices.
   * @param normal Polygon normal.
   * @returns Real corner count.
   */
  private countRingCorners(vertices: readonly THREE.Vector3[], ring: readonly number[], normal: THREE.Vector3): number {
    let corners = 0;
    for (let position = 0; position < ring.length; position++) {
      if (this.ringTurnsAt(vertices, ring, position, normal)) corners++;
    }
    return corners;
  }
}

/**
 * Whether the outline turns at a vertex in the polygon's winding direction.
 *
 * @param previous Vertex before.
 * @param current Vertex tested.
 * @param next Vertex after.
 * @param normal Polygon normal.
 * @returns True for a real convex corner.
 */
/**
 * Scale-free width of a triangle: twice its area over its longest edge squared.
 *
 * @param first First corner.
 * @param second Second corner.
 * @param third Third corner.
 * @returns Width; 0 for a flat triangle.
 */
function seamTriangleWidth(first: THREE.Vector3, second: THREE.Vector3, third: THREE.Vector3): number {
  const abX = second.x - first.x,
    abY = second.y - first.y,
    abZ = second.z - first.z;
  const acX = third.x - first.x,
    acY = third.y - first.y,
    acZ = third.z - first.z;
  const crossX = abY * acZ - abZ * acY;
  const crossY = abZ * acX - abX * acZ;
  const crossZ = abX * acY - abY * acX;
  const longestSquared = Math.max(
    first.distanceToSquared(second),
    second.distanceToSquared(third),
    third.distanceToSquared(first),
  );
  if (longestSquared === 0) return 0;
  return Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ) / longestSquared;
}

function seamTurnsAt(
  previous: THREE.Vector3,
  current: THREE.Vector3,
  next: THREE.Vector3,
  normal: THREE.Vector3,
): boolean {
  const inX = current.x - previous.x;
  const inY = current.y - previous.y;
  const inZ = current.z - previous.z;
  const outX = next.x - current.x;
  const outY = next.y - current.y;
  const outZ = next.z - current.z;
  const crossX = inY * outZ - inZ * outY;
  const crossY = inZ * outX - inX * outZ;
  const crossZ = inX * outY - inY * outX;
  const turn = crossX * normal.x + crossY * normal.y + crossZ * normal.z;
  const scale =
    Math.sqrt((inX * inX + inY * inY + inZ * inZ) * (outX * outX + outY * outY + outZ * outZ)) * normal.length();
  return turn > scale * SEAM_CORNER_MINIMUM_TURN_SINE;
}
