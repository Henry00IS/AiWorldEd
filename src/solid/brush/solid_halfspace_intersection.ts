import * as THREE from 'three';
import { SolidDualHull } from '@/solid/algorithm/surface/solid_dual_hull.js';
import { SolidBrushFactory } from './solid_brush_factory.js';
import type { SolidBrush } from './solid_brush.js';
import { SolidPlane } from './solid_plane.js';

const HALFSPACE_INSIDE_EPSILON = 1e-4;
const HALFSPACE_ON_PLANE_EPSILON = 2e-4;
const HALFSPACE_CLUSTER_DISTANCE_SQUARED = 1e-8;
const HALFSPACE_INTERIOR_MARGIN = 1e-3;
const HALFSPACE_INTERIOR_STEPS = 64;
const HALFSPACE_PARALLEL_EPSILON = 1e-10;

type HalfspaceVertex = {
  point: THREE.Vector3;
  planes: number[];
};

/** Builds the convex solid cut out by a brush and a set of outward planes. */
export class SolidHalfspaceIntersection {
  /**
   * Intersects a brush with outward cut planes.
   *
   * @param brush Source convex brush.
   * @param cuts Outward planes. A cut that misses or erases the brush is
   *   ignored.
   * @returns Cut brush, the input brush when no cut remains, or null when the
   *   solid cannot be built.
   */
  static build(brush: SolidBrush, cuts: readonly SolidPlane[]): SolidBrush | null {
    const planes = this.boundingPlanes(brush, cuts);
    if (planes.length === brush.planes.length) return brush;
    const interior = this.interiorPoint(planes, this.centroid(brush.vertices));
    if (!interior) return null;
    const loops = this.loopsFromPlanes(planes, interior);
    if (!loops) return null;
    return SolidBrushFactory.createFromFaceLoops(loops);
  }

  /**
   * Keeps brush planes and cuts that cross the brush.
   *
   * @param brush Source brush.
   * @param cuts Candidate cut planes.
   * @returns Planes that bound the result.
   */
  private static boundingPlanes(brush: SolidBrush, cuts: readonly SolidPlane[]): SolidPlane[] {
    const planes = brush.planes.slice();
    for (const cut of cuts) {
      if (this.cutCrossesBrush(brush, cut)) planes.push(cut);
    }
    return planes;
  }

  /**
   * Returns whether a cut has brush vertices on both sides.
   *
   * @param brush Source brush.
   * @param cut Candidate cut.
   * @returns True when the cut meets the brush and leaves part of it.
   */
  private static cutCrossesBrush(brush: SolidBrush, cut: SolidPlane): boolean {
    let inside = false;
    let outside = false;
    for (const vertex of brush.vertices) {
      const distance = cut.signedDistance(vertex);
      if (distance < -HALFSPACE_INSIDE_EPSILON) inside = true;
      if (distance > HALFSPACE_INSIDE_EPSILON) outside = true;
    }
    return inside && outside;
  }

  /**
   * Returns the average of the brush vertices.
   *
   * @param vertices Brush vertices.
   * @returns Centroid, or the origin when the brush is empty.
   */
  private static centroid(vertices: readonly THREE.Vector3[]): THREE.Vector3 {
    const center = new THREE.Vector3();
    if (vertices.length === 0) return center;
    for (const vertex of vertices) center.add(vertex);
    return center.multiplyScalar(1 / vertices.length);
  }

  /**
   * Moves a seed until it lies inside every plane.
   *
   * @param planes Bounding planes.
   * @param seed Starting point.
   * @returns Interior point, or null when the seed never gets inside.
   */
  private static interiorPoint(planes: readonly SolidPlane[], seed: THREE.Vector3): THREE.Vector3 | null {
    const point = seed.clone();
    for (let step = 0; step < HALFSPACE_INTERIOR_STEPS; step += 1) {
      const worst = this.mostOutsidePlane(planes, point);
      if (!worst) return point;
      const distance = worst.signedDistance(point);
      point.addScaledVector(worst.normal, -(distance + HALFSPACE_INTERIOR_MARGIN));
    }
    return this.mostOutsidePlane(planes, point) ? null : point;
  }

  /**
   * Returns the plane that leaves the point farthest outside.
   *
   * @param planes Bounding planes.
   * @param point Candidate interior point.
   * @returns Worst plane, or null when the point is inside all of them.
   */
  private static mostOutsidePlane(planes: readonly SolidPlane[], point: THREE.Vector3): SolidPlane | null {
    let worst: SolidPlane | null = null;
    let worstDistance = -HALFSPACE_INTERIOR_MARGIN;
    for (const plane of planes) {
      const distance = plane.signedDistance(point);
      if (distance <= worstDistance) continue;
      worstDistance = distance;
      worst = plane;
    }
    return worst;
  }

  /**
   * Builds face loops from the dual hull of the planes.
   *
   * @param planes Bounding planes, with a known interior point.
   * @param interior Point strictly inside every plane.
   * @returns Face loops, or null when the hull does not close.
   */
  private static loopsFromPlanes(planes: readonly SolidPlane[], interior: THREE.Vector3): THREE.Vector3[][] | null {
    const dual = this.dualPoints(planes, interior);
    if (!dual) return null;
    const triangles = SolidDualHull.triangles(dual);
    if (!triangles) return null;
    return this.loopsFromTriangles(planes, triangles);
  }

  /**
   * Maps each plane to the dual point used by the hull.
   *
   * @param planes Bounding planes.
   * @param interior Interior point, treated as the origin of the dual.
   * @returns Dual points, or null when a plane does not leave the origin
   *   inside.
   */
  private static dualPoints(planes: readonly SolidPlane[], interior: THREE.Vector3): THREE.Vector3[] | null {
    const dual: THREE.Vector3[] = [];
    for (const plane of planes) {
      const point = this.dualPoint(plane, interior);
      if (!point) return null;
      dual.push(point);
    }
    return dual;
  }

  /**
   * Returns the dual of one outward plane.
   *
   * @param plane Outward plane.
   * @param interior Interior point.
   * @returns Dual point, or null when the interior point is not inside the
   *   plane.
   */
  private static dualPoint(plane: SolidPlane, interior: THREE.Vector3): THREE.Vector3 | null {
    const depth = plane.offset + plane.normal.dot(interior);
    if (depth >= -HALFSPACE_ON_PLANE_EPSILON) return null;
    const scale = -1 / depth;
    return new THREE.Vector3(plane.normal.x * scale, plane.normal.y * scale, plane.normal.z * scale);
  }

  /**
   * Turns hull triangles into ordered face loops.
   *
   * @param planes Bounding planes.
   * @param triangles Dual hull triangles, as plane indices.
   * @returns Face loops, or null when fewer than four faces survive.
   */
  private static loopsFromTriangles(
    planes: readonly SolidPlane[],
    triangles: readonly number[][],
  ): THREE.Vector3[][] | null {
    const vertices = this.verticesFromTriangles(planes, triangles);
    const grouped = this.groupByPlane(planes, vertices);
    const loops: THREE.Vector3[][] = [];
    for (let index = 0; index < planes.length; index += 1) {
      const loop = this.orderedLoop(grouped[index] ?? [], index, planes[index]);
      if (loop) loops.push(loop);
    }
    return loops.length >= 4 ? loops : null;
  }

  /**
   * Intersects each hull triangle and keeps points that lie inside the solid.
   *
   * @param planes Bounding planes.
   * @param triangles Dual hull triangles.
   * @returns Vertices tagged with the planes that pass through them.
   */
  private static verticesFromTriangles(
    planes: readonly SolidPlane[],
    triangles: readonly number[][],
  ): HalfspaceVertex[] {
    const vertices: HalfspaceVertex[] = [];
    for (const triangle of triangles) {
      const vertex = this.vertexFromTriangle(planes, triangle);
      if (vertex) this.rememberVertex(vertices, vertex);
    }
    return vertices;
  }

  /**
   * Keeps a vertex, or merges it into an earlier vertex at the same corner.
   *
   * @param vertices Vertices accepted so far.
   * @param vertex New vertex.
   */
  private static rememberVertex(vertices: HalfspaceVertex[], vertex: HalfspaceVertex): void {
    for (const existing of vertices) {
      if (existing.point.distanceToSquared(vertex.point) > HALFSPACE_CLUSTER_DISTANCE_SQUARED) continue;
      this.mergePlanes(existing, vertex);
      return;
    }
    vertices.push(vertex);
  }

  /**
   * Adds any new plane owners onto an existing vertex.
   *
   * @param existing Vertex already stored.
   * @param vertex Vertex being merged.
   */
  private static mergePlanes(existing: HalfspaceVertex, vertex: HalfspaceVertex): void {
    for (const plane of vertex.planes) {
      if (!existing.planes.includes(plane)) existing.planes.push(plane);
    }
  }

  /**
   * Builds one vertex from three plane indices.
   *
   * @param planes Bounding planes.
   * @param triangle Three plane indices.
   * @returns Vertex, or null when the intersection is missing or outside.
   */
  private static vertexFromTriangle(
    planes: readonly SolidPlane[],
    triangle: readonly number[],
  ): HalfspaceVertex | null {
    const first = planes[triangle[0] ?? -1];
    const second = planes[triangle[1] ?? -1];
    const third = planes[triangle[2] ?? -1];
    if (!first || !second || !third) return null;
    const point = this.intersectThree(first, second, third);
    if (!point || !this.insideAll(planes, point)) return null;
    return { point, planes: this.planeIndices(triangle) };
  }

  /**
   * Solves n·x + d = 0 for three planes.
   *
   * @param first First plane.
   * @param second Second plane.
   * @param third Third plane.
   * @returns Intersection, or null when the planes are parallel.
   */
  private static intersectThree(first: SolidPlane, second: SolidPlane, third: SolidPlane): THREE.Vector3 | null {
    const normal23 = new THREE.Vector3().crossVectors(second.normal, third.normal);
    const denominator = first.normal.dot(normal23);
    if (Math.abs(denominator) < HALFSPACE_PARALLEL_EPSILON) return null;
    const normal31 = new THREE.Vector3().crossVectors(third.normal, first.normal);
    const normal12 = new THREE.Vector3().crossVectors(first.normal, second.normal);
    const point = new THREE.Vector3();
    point.addScaledVector(normal23, -first.offset);
    point.addScaledVector(normal31, -second.offset);
    point.addScaledVector(normal12, -third.offset);
    return point.multiplyScalar(1 / denominator);
  }

  /**
   * Returns whether a point is inside every plane.
   *
   * @param planes Bounding planes.
   * @param point Candidate vertex.
   * @returns True when no plane leaves the point outside.
   */
  private static insideAll(planes: readonly SolidPlane[], point: THREE.Vector3): boolean {
    for (const plane of planes) {
      if (plane.signedDistance(point) > HALFSPACE_INSIDE_EPSILON) return false;
    }
    return true;
  }

  /**
   * Returns the distinct plane indices of a hull triangle.
   *
   * @param triangle Plane indices.
   * @returns Unique indices.
   */
  private static planeIndices(triangle: readonly number[]): number[] {
    return [...new Set(triangle)];
  }

  /**
   * Buckets vertex positions by the planes that contain them.
   *
   * @param planes Bounding planes.
   * @param vertices Tagged vertices.
   * @returns One corner list per plane.
   */
  private static groupByPlane(
    planes: readonly SolidPlane[],
    vertices: readonly HalfspaceVertex[],
  ): HalfspaceVertex[][] {
    const grouped = planes.map(() => [] as HalfspaceVertex[]);
    for (const vertex of vertices) this.scatterVertex(grouped, vertex);
    return grouped;
  }

  /**
   * Adds one vertex to each of its planes.
   *
   * @param grouped Corners per plane.
   * @param vertex Tagged vertex.
   */
  private static scatterVertex(grouped: HalfspaceVertex[][], vertex: HalfspaceVertex): void {
    for (const plane of vertex.planes) {
      const list = grouped[plane];
      if (list) list.push(vertex);
    }
  }

  /**
   * Orders a face's corners so shared edges agree, then faces them outward.
   *
   * @param corners Corners that use this plane.
   * @param planeIndex Index of the face plane.
   * @param plane Face plane.
   * @returns Ordered loop, or null when the face has fewer than three corners.
   */
  private static orderedLoop(
    corners: readonly HalfspaceVertex[],
    planeIndex: number,
    plane: SolidPlane | undefined,
  ): THREE.Vector3[] | null {
    if (!plane || corners.length < 3) return null;
    const walked = this.walkCorners(corners, planeIndex);
    const points = walked
      ? walked.map((corner) => corner.point)
      : this.sortAroundNormal(this.cornerPoints(corners), plane.normal);
    if (points.length < 3) return null;
    return this.alignOutward(points, plane.normal);
  }

  /**
   * Walks a face cycle by stepping to a corner that shares an edge plane.
   *
   * @param corners Corners that use this plane.
   * @param planeIndex Index of the face plane.
   * @returns Every corner in cycle order, or null when the cycle is broken.
   */
  private static walkCorners(corners: readonly HalfspaceVertex[], planeIndex: number): HalfspaceVertex[] | null {
    const first = corners[0];
    if (!first) return null;
    const ordered = [first];
    const used = new Set<HalfspaceVertex>([first]);
    while (ordered.length < corners.length) {
      const current = ordered[ordered.length - 1];
      if (!current) return null;
      const next = this.nextCorner(corners, used, current, planeIndex);
      if (!next) return null;
      used.add(next);
      ordered.push(next);
    }
    return ordered;
  }

  /**
   * Returns the next unused corner that shares an edge plane.
   *
   * @param corners Corners that use this plane.
   * @param used Corners already placed.
   * @param current Corner to leave.
   * @param planeIndex Index of the face plane.
   * @returns Neighbor corner, or null when the cycle stops.
   */
  private static nextCorner(
    corners: readonly HalfspaceVertex[],
    used: ReadonlySet<HalfspaceVertex>,
    current: HalfspaceVertex,
    planeIndex: number,
  ): HalfspaceVertex | null {
    for (const corner of corners) {
      if (used.has(corner)) continue;
      if (this.shareEdgePlane(current, corner, planeIndex)) return corner;
    }
    return null;
  }

  /**
   * Returns whether two corners meet on a plane other than the face.
   *
   * @param current Current corner.
   * @param corner Candidate neighbor.
   * @param planeIndex Index of the face plane.
   * @returns True when the corners share an edge plane.
   */
  private static shareEdgePlane(current: HalfspaceVertex, corner: HalfspaceVertex, planeIndex: number): boolean {
    for (const plane of current.planes) {
      if (plane !== planeIndex && corner.planes.includes(plane)) return true;
    }
    return false;
  }

  /**
   * Copies corner positions.
   *
   * @param corners Corners on one face.
   * @returns Positions.
   */
  private static cornerPoints(corners: readonly HalfspaceVertex[]): THREE.Vector3[] {
    return corners.map((corner) => corner.point);
  }

  /**
   * Reverses a loop when its first corner faces against the plane.
   *
   * @param points Ordered face vertices.
   * @param normal Outward plane normal.
   * @returns The same array, reversed when needed.
   */
  private static alignOutward(points: THREE.Vector3[], normal: THREE.Vector3): THREE.Vector3[] {
    const first = points[0];
    const second = points[1];
    const third = points[2];
    if (!first || !second || !third) return points;
    const edge = new THREE.Vector3().subVectors(second, first);
    const span = new THREE.Vector3().subVectors(third, first);
    if (edge.cross(span).dot(normal) < 0) points.reverse();
    return points;
  }

  /**
   * Sorts positions counter-clockwise around an outward normal.
   *
   * @param points Unique face vertices.
   * @param normal Outward unit normal.
   * @returns Ordered loop.
   */
  private static sortAroundNormal(points: readonly THREE.Vector3[], normal: THREE.Vector3): THREE.Vector3[] {
    const center = this.pointCentroid(points);
    const basis = this.tangentBasis(normal);
    const scored = points.map((point) => ({ point, angle: this.tangentAngle(point, center, basis) }));
    scored.sort((left, right) => left.angle - right.angle);
    return scored.map((entry) => entry.point);
  }

  /**
   * Returns the average of a point list.
   *
   * @param points Positions.
   * @returns Centroid.
   */
  private static pointCentroid(points: readonly THREE.Vector3[]): THREE.Vector3 {
    const center = new THREE.Vector3();
    for (const point of points) center.add(point);
    return center.multiplyScalar(1 / points.length);
  }

  /**
   * Builds a right-handed tangent frame.
   *
   * @param normal Unit normal.
   * @returns Axes whose cross product is the normal.
   */
  private static tangentBasis(normal: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
    const seed = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(seed, normal).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    return { u, v };
  }

  /**
   * Returns the tangent angle of a point around a center.
   *
   * @param point Sample position.
   * @param center Face center.
   * @param basis Tangent axes.
   * @returns Angle in radians.
   */
  private static tangentAngle(
    point: THREE.Vector3,
    center: THREE.Vector3,
    basis: { u: THREE.Vector3; v: THREE.Vector3 },
  ): number {
    const relative = new THREE.Vector3().subVectors(point, center);
    return Math.atan2(relative.dot(basis.v), relative.dot(basis.u));
  }
}
