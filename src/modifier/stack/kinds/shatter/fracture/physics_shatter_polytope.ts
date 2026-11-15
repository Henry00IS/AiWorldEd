import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SOLID_BRUSH_VERTEX_WELD_EPSILON } from '@/solid/brush/solid_brush_vertex_weld.js';
import { PhysicsShatterPolytopeCap } from './physics_shatter_polytope_cap.js';

/** Distance from a plane within which a vertex counts as lying on it. */
const PHYSICS_SHATTER_ON_PLANE = SOLID_BRUSH_VERTEX_WELD_EPSILON * 1.01;

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
   * @returns This polytope when the plane misses it, the cut polytope, or null
   *   when nothing is left.
   */
  clip(plane: SolidPlane): PhysicsShatterPolytope | null {
    const sides = this.vertices.map((vertex) => this.sideOf(plane.signedDistance(vertex)));
    if (!sides.includes(1)) return this;
    if (!sides.includes(-1)) return null;
    const vertices = this.vertices.slice();
    const crossings = new Map<string, number>();
    const cut = { plane, sides, vertices, crossings };
    const faces = this.faces
      .map((face) => this.clipFace(face, cut))
      .filter((face) => face.loop.length >= 3 && face.loop.some((index) => sides[index] === -1));
    const cap = PhysicsShatterPolytopeCap.build(faces, vertices, sides, plane);
    if (cap) faces.push({ loop: cap, origin: -1 });
    return faces.length >= 4 ? new PhysicsShatterPolytope(vertices, faces) : null;
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
   * Builds the brush and the origin of each of its faces.
   *
   * @returns Brush with face origins in face order, or null when the shell is
   *   broken.
   */
  toBrush(): { brush: SolidBrush; origins: number[] } | null {
    const loops = this.faces.map((face) => face.loop.map((index) => this.vertices[index] ?? new THREE.Vector3()));
    const brush = SolidBrushFactory.createFromFaceLoops(loops);
    return brush ? { brush, origins: this.faces.map((face) => face.origin) } : null;
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
    const key = `${low}:${high}`;
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
  crossings: Map<string, number>;
}
