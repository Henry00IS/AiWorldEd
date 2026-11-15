import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SOLID_BRUSH_VERTEX_WELD_EPSILON } from '@/solid/brush/solid_brush_vertex_weld.js';
import { PhysicsShatterPolytopeCap } from './physics_shatter_polytope_cap.js';

/** Distance from a plane within which a vertex counts as lying on it. */
const PHYSICS_SHATTER_ON_PLANE = SOLID_BRUSH_VERTEX_WELD_EPSILON * 1.01;

/** Key stride of an edge's crossing: more than any polytope's vertex count. */
const PHYSICS_SHATTER_CROSSING_STRIDE = 1 << 20;

/** One face loop of a polytope. */
export interface PhysicsShatterPolytopeFace {
  /** Vertex indices, counter-clockwise seen from outside. */
  loop: number[];
  /** Input face index the face lies on, or -1 for a crack face. */
  origin: number;
}

/** Side of a plane a vertex lies on: -1 inside, 0 on, 1 outside. */
type PhysicsShatterSide = -1 | 0 | 1;

/**
 * Convex polyhedron with shared vertices, cut by planes without rebuilding
 * brush topology on every cut. Faces remember which input face they lie on.
 */
export class PhysicsShatterPolytope {
  /**
   * Creates a polytope.
   *
   * @param vertices Shared vertex positions.
   * @param faces Face loops into the vertices.
   */
  constructor(
    readonly vertices: THREE.Vector3[],
    readonly faces: PhysicsShatterPolytopeFace[],
  ) {}

  /**
   * Reads a convex brush; every face keeps its own index as origin.
   *
   * @param brush Convex brush.
   * @returns Polytope of the brush.
   */
  static fromBrush(brush: SolidBrush): PhysicsShatterPolytope {
    const vertices = brush.vertices.map((vertex) => vertex.clone());
    const faces = brush.faces.map((face, origin) => ({ loop: brush.getFaceVertexIndices(face), origin }));
    return new PhysicsShatterPolytope(vertices, faces);
  }

  /**
   * Keeps the part behind an outward plane and closes the cut with a crack
   * face.
   *
   * @param plane Outward plane; its negative side is kept.
   * @param capOrigin Origin of the closing face; -1 for a crack face.
   * @returns This polytope when the plane misses it, the cut polytope, or null
   *   when nothing is left.
   */
  clip(plane: SolidPlane, capOrigin = -1): PhysicsShatterPolytope | null {
    const sides = this.vertices.map((vertex) => this.sideOf(plane.signedDistance(vertex)));
    if (!sides.includes(1)) return this;
    if (!sides.includes(-1)) return null;
    const vertices = this.vertices.slice();
    const crossings = new Map<number, number>();
    const cut = { plane, sides, vertices, crossings };
    const faces = this.faces
      .map((face) => this.clipFace(face, cut))
      .filter((face) => face.loop.length >= 3 && face.loop.some((index) => sides[index] === -1));
    const cap = PhysicsShatterPolytopeCap.build(faces, vertices, sides, plane);
    if (cap) faces.push({ loop: cap, origin: capOrigin });
    return faces.length >= 4 ? PhysicsShatterPolytope.compacted(vertices, faces) : null;
  }

  /**
   * Builds a polytope that keeps only the vertices its faces use, so later cuts
   * test no vertex that was already cut away.
   *
   * @param vertices Vertices, some unused.
   * @param faces Face loops into the vertices.
   * @returns Polytope with renumbered loops.
   */
  private static compacted(
    vertices: readonly THREE.Vector3[],
    faces: PhysicsShatterPolytopeFace[],
  ): PhysicsShatterPolytope {
    const renumber = new Map<number, number>();
    const kept: THREE.Vector3[] = [];
    for (const face of faces)
      face.loop = face.loop.map((index) => {
        let target = renumber.get(index);
        if (target === undefined) {
          target = kept.push(vertices[index] ?? new THREE.Vector3()) - 1;
          renumber.set(index, target);
        }
        return target;
      });
    return new PhysicsShatterPolytope(kept, faces);
  }

  /**
   * Returns the largest distance from a point to a used vertex.
   *
   * @param point Reference point.
   * @returns Radius around the point.
   */
  radiusAround(point: THREE.Vector3): number {
    let radiusSquared = 0;
    for (const face of this.faces)
      for (const index of face.loop)
        radiusSquared = Math.max(radiusSquared, this.vertices[index]?.distanceToSquared(point) ?? 0);
    return Math.sqrt(radiusSquared);
  }

  /**
   * Returns the enclosed volume, summed over a triangle fan of each face.
   *
   * @returns Volume in cubic metres.
   */
  volume(): number {
    let sixfold = 0;
    const cross = new THREE.Vector3();
    for (const { loop } of this.faces) {
      const first = this.vertices[loop[0] ?? -1];
      for (let corner = 1; first && corner + 1 < loop.length; corner++) {
        const b = this.vertices[loop[corner] ?? -1];
        const c = this.vertices[loop[corner + 1] ?? -1];
        if (b && c) sixfold += first.dot(cross.crossVectors(b, c));
      }
    }
    return sixfold / 6;
  }

  /**
   * Returns the volume centroid, from a tetrahedron fan around the first
   * vertex.
   *
   * @returns Centroid, or the first vertex when the volume is zero.
   */
  centroid(): THREE.Vector3 {
    const apex = this.vertices[this.faces[0]?.loop[0] ?? -1]?.clone() ?? new THREE.Vector3();
    const sum = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const cross = new THREE.Vector3();
    let total = 0;
    for (const { loop } of this.faces) {
      const first = this.vertices[loop[0] ?? -1];
      if (!first) continue;
      a.subVectors(first, apex);
      for (let corner = 1; corner + 1 < loop.length; corner++) {
        const second = this.vertices[loop[corner] ?? -1];
        const third = this.vertices[loop[corner + 1] ?? -1];
        if (!second || !third) continue;
        b.subVectors(second, apex);
        c.subVectors(third, apex);
        const sixfold = a.dot(cross.crossVectors(b, c));
        total += sixfold;
        sum.addScaledVector(a, sixfold).addScaledVector(b, sixfold).addScaledVector(c, sixfold);
      }
    }
    return Math.abs(total) > 1e-18 ? apex.addScaledVector(sum, 1 / (4 * total)) : apex;
  }

  /**
   * Builds the brush and the origin of each of its faces. When a sliver face
   * left by a cut passing near a corner breaks the shell, the build is retried
   * with vertices closer than a millimetre welded, so that face disappears.
   *
   * @returns Brush with face origins in face order, or null when the shell is
   *   broken.
   */
  toBrush(): { brush: SolidBrush; origins: number[] } | null {
    return this.toBrushWelded(0) ?? this.toBrushWelded(PHYSICS_SHATTER_WELD_DISTANCE);
  }

  /**
   * Builds the brush after welding vertices within a distance.
   *
   * @param distance Weld distance in metres; 0 welds only what the brush would.
   * @returns Brush with face origins, or null when the shell is broken.
   */
  private toBrushWelded(distance: number): { brush: SolidBrush; origins: number[] } | null {
    const welded: THREE.Vector3[] = [];
    const loops: THREE.Vector3[][] = [];
    const origins: number[] = [];
    for (const face of this.faces) {
      const loop = physicsShatterWeldLoop(face.loop, this.vertices, welded, distance);
      if (loop === null) return null;
      if (loop.length < 3) continue;
      loops.push(loop.map((index) => welded[index] ?? new THREE.Vector3()));
      origins.push(face.origin);
    }
    const brush = SolidBrushFactory.createFromFaceLoops(loops);
    return brush ? { brush, origins } : null;
  }

  /**
   * Classifies a signed distance.
   *
   * @param distance Signed plane distance.
   * @returns Side of the plane.
   */
  private sideOf(distance: number): PhysicsShatterSide {
    if (distance > PHYSICS_SHATTER_ON_PLANE) return 1;
    return distance < -PHYSICS_SHATTER_ON_PLANE ? -1 : 0;
  }

  /**
   * Keeps the inside part of one face loop, adding crossing vertices where
   * edges pass through the plane.
   *
   * @param face Face to clip.
   * @param cut Shared cut state.
   * @returns Clipped face; an empty loop when nothing is left.
   */
  private clipFace(face: PhysicsShatterPolytopeFace, cut: PhysicsShatterCut): PhysicsShatterPolytopeFace {
    const loop: number[] = [];
    face.loop.forEach((from, position) => {
      const to = face.loop[(position + 1) % face.loop.length] ?? from;
      if (cut.sides[from] !== 1) loop.push(from);
      if ((cut.sides[from] ?? 0) * (cut.sides[to] ?? 0) === -1) loop.push(this.crossingOf(from, to, cut));
    });
    return { loop, origin: face.origin };
  }

  /**
   * Returns the vertex where an edge crosses the plane, shared by both faces of
   * the edge.
   *
   * @param from Edge start index.
   * @param to Edge end index.
   * @param cut Shared cut state.
   * @returns Index of the crossing vertex.
   */
  private crossingOf(from: number, to: number, cut: PhysicsShatterCut): number {
    const [low, high] = from < to ? [from, to] : [to, from];
    const key = low * PHYSICS_SHATTER_CROSSING_STRIDE + high;
    const known = cut.crossings.get(key);
    if (known !== undefined) return known;
    const start = this.vertices[low] ?? new THREE.Vector3();
    const end = this.vertices[high] ?? new THREE.Vector3();
    const [startDistance, endDistance] = [cut.plane.signedDistance(start), cut.plane.signedDistance(end)];
    const point = start.clone().lerp(end, startDistance / (startDistance - endDistance));
    cut.crossings.set(key, cut.vertices.push(point) - 1);
    return cut.vertices.length - 1;
  }
}

/** Shared state of one plane cut. */
interface PhysicsShatterCut {
  plane: SolidPlane;
  sides: PhysicsShatterSide[];
  vertices: THREE.Vector3[];
  crossings: Map<number, number>;
}

/** Distance below which polytope vertices become one brush vertex, in metres. */
const PHYSICS_SHATTER_WELD_DISTANCE = 1e-3;

/**
 * Maps a face loop onto welded vertices and drops repeats of the same welded
 * vertex in a row.
 *
 * @param loop Face loop into the polytope vertices.
 * @param vertices Polytope vertices.
 * @param welded Welded vertices so far; extended in place.
 * @param distance Weld distance in metres.
 * @returns Welded loop, shorter than 3 when the face vanished, or null when the
 *   face folds onto itself.
 */
function physicsShatterWeldLoop(
  loop: readonly number[],
  vertices: readonly THREE.Vector3[],
  welded: THREE.Vector3[],
  distance: number,
): number[] | null {
  const out: number[] = [];
  for (const index of loop) {
    const point = vertices[index] ?? new THREE.Vector3();
    let target = welded.findIndex((vertex) => vertex.distanceTo(point) <= distance);
    if (target < 0) target = welded.push(point.clone()) - 1;
    if (out[out.length - 1] !== target) out.push(target);
  }
  while (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
  return new Set(out).size === out.length ? out : null;
}
