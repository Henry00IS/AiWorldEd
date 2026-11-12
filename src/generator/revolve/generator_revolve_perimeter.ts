import { generatorRevolveOutlineSimplify } from './generator_revolve_section.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';
import * as THREE from 'three';
import {
  generatorRevolveRing,
  generatorRevolveSectionFrame,
  type GeneratorRevolveFrame,
} from './generator_revolve_brush.js';

/**
 * Measures the closed polygon perimeter of a ring.
 *
 * @param ring Ring vertices in winding order.
 * @returns Perimeter in world units.
 */
export function generatorRevolvePerimeter(ring: readonly THREE.Vector3[]): number {
  return ring.reduce((sum, point, index) => sum + point.distanceTo(ring[(index + 1) % ring.length] ?? point), 0);
}

/** Perimeter texture coordinates of one side edge. */
interface GeneratorRevolvePerimeterEdge {
  /** Width at profile radius one. */
  width: number;
  /** Fraction of the whole perimeter covered by this face. */
  share: number;
  /** Texture coordinate at the edge centre, with a closed seam. */
  centre: number;
}

/** A measured polygon edge with an outward horizontal normal. */
interface GeneratorRevolveMeasuredEdge extends GeneratorRevolvePerimeterEdge {
  /** Stable intrinsic edge index. */
  index: number;
  /** Outward horizontal normal. */
  normal: THREE.Vector3;
  /** Edge midpoint on the unit ring, relative to the axis. */
  middle: THREE.Vector3;
}

/** Normal agreement within which edges count as facing the same way. */
const GENERATOR_REVOLVE_EDGE_FACING_EPSILON = 1e-6;

/** Unit rings and perimeter shares reused by every side face of one brush. */
export class GeneratorRevolvePerimeterLayout {
  private readonly ring: THREE.Vector3[];
  private readonly directions: THREE.Vector3[];
  private readonly edges: GeneratorRevolveMeasuredEdge[];

  /**
   * Measures one cross-section at radius one.
   *
   * @param frame Cross-section, aspect and axis base.
   */
  constructor(private readonly frame: GeneratorRevolveFrame) {
    this.ring = generatorRevolveRing({ ...frame, center: new THREE.Vector3() }, { height: 0, radius: 1 });
    this.directions = this.ring.map((point) => point.clone().normalize());
    this.edges = this.measureEdges(generatorRevolveOutlineSimplify(this.ring));
  }

  /**
   * Finds the polygon edge facing a side normal.
   *
   * @param normal Outward face normal.
   * @returns Edge width and perimeter coordinates.
   */
  edge(normal: THREE.Vector3): GeneratorRevolveMeasuredEdge {
    return this.edges.reduce((best, next) => (next.normal.dot(normal) > best.normal.dot(normal) ? next : best));
  }

  /**
   * Finds the polygon edge a side face lies on. Among edges facing the same
   * way, such as the tip and the inner sides of a cross, the one nearest the
   * face wins.
   *
   * @param normal Outward face normal.
   * @param corners Face corners in frame coordinates.
   * @returns Edge width and perimeter coordinates.
   */
  edgeOfFace(normal: THREE.Vector3, corners: readonly THREE.Vector3[]): GeneratorRevolveMeasuredEdge {
    const facing = this.edge(normal).normal.dot(normal) - GENERATOR_REVOLVE_EDGE_FACING_EPSILON;
    const candidates = this.edges.filter((edge) => edge.normal.dot(normal) >= facing);
    if (candidates.length < 2) return this.edge(normal);
    const place = this.unitPlace(corners);
    return candidates.reduce((best, next) =>
      next.middle.distanceToSquared(place) < best.middle.distanceToSquared(place) ? next : best,
    );
  }

  /**
   * Places a face centre on the unit ring by dividing its offset from the axis
   * by the mean profile radius of its corners.
   *
   * @param corners Face corners in frame coordinates.
   * @returns Horizontal offset at profile radius one.
   */
  private unitPlace(corners: readonly THREE.Vector3[]): THREE.Vector3 {
    const centre = corners.reduce((sum, corner) => sum.add(corner), new THREE.Vector3());
    centre.divideScalar(Math.max(1, corners.length)).sub(this.frame.center).setY(0);
    const radius = corners.reduce((sum, corner) => sum + this.radiusOf(corner), 0) / Math.max(1, corners.length);
    return centre.divideScalar(Math.max(radius, 1e-9));
  }

  /**
   * Recovers the profile station of a ring edge. Sided rings are shifted off
   * the axis, so their radius comes from the edge length instead.
   *
   * @param points Edge corners at one height.
   * @param edgeWidth Width of the matching unit-ring edge.
   * @returns Height and radius before section scaling.
   */
  stationOf(points: readonly THREE.Vector3[], edgeWidth: number): GeneratorRevolveStation {
    const height = (points[0]?.y ?? this.frame.center.y) - this.frame.center.y;
    if (this.frame.sided) return { height, radius: generatorRevolveSpan(points) / Math.max(edgeWidth, 1e-9) };
    return { height, radius: Math.max(...points.map((point) => this.radiusOf(point))) };
  }

  /**
   * Recovers the profile radius of a ring vertex.
   *
   * @param point Ring vertex in frame coordinates.
   * @returns Radius before section and aspect scaling.
   */
  private radiusOf(point: THREE.Vector3): number {
    const offset = point.clone().sub(this.frame.center).setY(0);
    const length = offset.length();
    if (length < 1e-9) return 0;
    const direction = offset.divideScalar(length);
    let closest = 0;
    this.directions.forEach((candidate, index) => {
      if (candidate.dot(direction) > (this.directions[closest]?.dot(direction) ?? -Infinity)) closest = index;
    });
    return length / Math.max(this.ring[closest]?.length() ?? 0, 1e-9);
  }

  /**
   * Measures every edge's width, perimeter coordinates and outward normal.
   *
   * @param ring Outline without collinear samples.
   * @returns Measured edges in winding order.
   */
  private measureEdges(ring: readonly THREE.Vector3[]): GeneratorRevolveMeasuredEdge[] {
    const perimeter = generatorRevolvePerimeter(ring);
    let walked = 0;
    return ring.map((point, index) => {
      const delta = (ring[(index + 1) % ring.length] ?? point).clone().sub(point);
      const width = delta.length();
      const normal = new THREE.Vector3(delta.z, 0, -delta.x).normalize();
      const middle = point.clone().addScaledVector(delta, 0.5).setY(0);
      const centre = 1 - (walked + width / 2) / perimeter;
      walked += width;
      return { index, width, normal, middle, centre, share: width / perimeter };
    });
  }
}

/**
 * Returns the largest distance between any two points.
 *
 * @param points Points.
 * @returns Span; 0 for fewer than two points.
 */
function generatorRevolveSpan(points: readonly THREE.Vector3[]): number {
  return Math.max(0, ...points.flatMap((point) => points.map((other) => point.distanceTo(other))));
}

/**
 * Measures the widest actual ring, including both section shapes at a junction.
 *
 * @param stations Profile samples.
 * @param sides Round polygon resolution.
 * @param aspect Depth relative to width.
 * @returns Largest perimeter in metres.
 */
export function generatorRevolveWidestPerimeter(
  stations: readonly GeneratorRevolveStation[],
  sides: number,
  aspect: number,
): number {
  const frame = { center: new THREE.Vector3(), sides, aspect };
  return Math.max(
    1e-6,
    ...stations.flatMap((station, index) => {
      const sections = [station, stations[index - 1] ?? station];
      return sections.map((section) =>
        generatorRevolvePerimeter(
          generatorRevolveRing(generatorRevolveSectionFrame(frame, section), { ...station, height: 0 }),
        ),
      );
    }),
  );
}
