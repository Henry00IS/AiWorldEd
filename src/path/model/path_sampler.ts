import * as THREE from 'three';
import type { Path } from './path_model.js';

/** Samples per span of a smooth path. */
const PATH_SAMPLES_PER_SPAN = 24;

/** A position on a path with its direction and a stable side axis. */
export interface PathFrame {
  /** Position on the path. */
  position: THREE.Vector3;
  /** Unit direction of travel. */
  tangent: THREE.Vector3;
  /** Unit axis across the path; turns with the path without sudden flips. */
  normal: THREE.Vector3;
}

/**
 * Measures a path and answers where a given distance along it lies. A smooth
 * path is a centripetal spline through its points (no loops or cusps at uneven
 * spacing); a straight path is the polyline through them. Distances past either
 * end continue straight along the end direction.
 */
export class PathSampler {
  /** Dense polyline through the path. */
  readonly samples: readonly THREE.Vector3[];
  /** Total length in path units. */
  readonly length: number;
  private readonly distances: number[];
  private readonly normals: THREE.Vector3[];

  /**
   * Builds the sampler.
   *
   * @param path Path to measure.
   */
  constructor(path: Path) {
    this.samples = pathSamplesOf(path);
    this.distances = [0];
    for (let index = 1; index < this.samples.length; index++)
      this.distances.push(this.distances[index - 1]! + this.samples[index]!.distanceTo(this.samples[index - 1]!));
    this.length = this.distances[this.distances.length - 1]!;
    this.normals = this.transportNormals();
  }

  /**
   * Returns the frame at a distance along the path.
   *
   * @param distance Distance from the start; values outside [0, length] extend
   *   the end spans.
   * @returns Frame.
   */
  frameAt(distance: number): PathFrame {
    const index = this.spanIndexOf(distance);
    const start = this.samples[index]!;
    const end = this.samples[index + 1]!;
    const span = Math.max(1e-12, this.distances[index + 1]! - this.distances[index]!);
    const t = (distance - this.distances[index]!) / span;
    const tangent = end.clone().sub(start).normalize();
    const position = start.clone().lerp(end, t);
    const normal = this.normals[index]!.clone();
    return { position, tangent, normal };
  }

  /**
   * Returns a rigid transform carrying the start frame onto the frame at a
   * distance, so an object placed at the start follows the path's turns.
   *
   * @param distance Distance along the path.
   * @param follow True turns with the path; false only moves.
   * @returns Transform in path coordinates.
   */
  carryTo(distance: number, follow: boolean): THREE.Matrix4 {
    const from = this.frameAt(0);
    const to = this.frameAt(distance);
    const move = new THREE.Matrix4().makeTranslation(to.position.x, to.position.y, to.position.z);
    if (!follow)
      return move.multiply(new THREE.Matrix4().makeTranslation(-from.position.x, -from.position.y, -from.position.z));
    const turn = pathBasis(to).multiply(pathBasis(from).invert());
    const back = new THREE.Matrix4().makeTranslation(-from.position.x, -from.position.y, -from.position.z);
    return move.multiply(turn).multiply(back);
  }

  /**
   * Returns evenly spread distances for a copy count: from start to end on an
   * open path, and around the loop without doubling the start on a closed one.
   *
   * @param count Number of positions, at least one.
   * @param closed True when the path loops.
   * @returns Distances.
   */
  spread(count: number, closed: boolean): number[] {
    const slots = closed ? count : Math.max(1, count - 1);
    return Array.from({ length: count }, (_, index) => (this.length * index) / slots);
  }

  /**
   * Finds the sample span holding a distance; outside the path, the first or
   * last span.
   *
   * @param distance Distance along the path.
   * @returns Span start index.
   */
  private spanIndexOf(distance: number): number {
    let low = 0;
    let high = this.distances.length - 2;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.distances[middle]! <= distance) low = middle;
      else high = middle - 1;
    }
    return Math.max(0, low);
  }

  /**
   * Carries a side axis along the samples by turning it with each change of
   * direction, so it never flips the way a fixed up axis does at vertical
   * spans.
   *
   * @returns One normal per span.
   */
  private transportNormals(): THREE.Vector3[] {
    const normals: THREE.Vector3[] = [];
    let previous: THREE.Vector3 | null = null;
    let normal = new THREE.Vector3();
    for (let index = 0; index + 1 < this.samples.length; index++) {
      const tangent = this.samples[index + 1]!.clone().sub(this.samples[index]!).normalize();
      if (previous === null) normal = pathInitialNormal(tangent);
      else normal.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(previous, tangent));
      normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
      normals.push(normal.clone());
      previous = tangent;
    }
    return normals;
  }
}

/**
 * Picks the starting side axis: horizontal and to the left of travel when the
 * path starts level, so a level path keeps copies upright.
 *
 * @param tangent Start direction.
 * @returns Unit normal.
 */
function pathInitialNormal(tangent: THREE.Vector3): THREE.Vector3 {
  const up = Math.abs(tangent.y) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(up, tangent).normalize();
}

/**
 * Returns the rotation whose columns are tangent, binormal and normal of a
 * frame.
 *
 * @param frame Path frame.
 * @returns Rotation matrix.
 */
function pathBasis(frame: PathFrame): THREE.Matrix4 {
  const binormal = new THREE.Vector3().crossVectors(frame.tangent, frame.normal).normalize();
  return new THREE.Matrix4().makeBasis(frame.tangent, binormal, frame.normal);
}

/**
 * Lists the dense polyline of a path, with duplicate neighbours removed.
 *
 * @param path Path.
 * @returns At least two distinct points, unless all points coincide.
 */
export function pathSamplesOf(path: Path): THREE.Vector3[] {
  const points = path.points.map((point) => new THREE.Vector3(point.x, point.y, point.z));
  let samples: THREE.Vector3[];
  if (path.smooth && points.length > 2) {
    const curve = new THREE.CatmullRomCurve3(points, path.closed, 'centripetal');
    const spans = path.closed ? points.length : points.length - 1;
    samples = curve.getPoints(spans * PATH_SAMPLES_PER_SPAN);
  } else {
    samples = path.closed ? [...points, points[0]!.clone()] : points;
  }
  const distinct: THREE.Vector3[] = [];
  for (const sample of samples) {
    const last = distinct[distinct.length - 1];
    if (!last || last.distanceToSquared(sample) > 1e-12) distinct.push(sample.clone());
  }
  if (distinct.length < 2)
    return [
      distinct[0] ?? new THREE.Vector3(),
      (distinct[0] ?? new THREE.Vector3()).clone().add(new THREE.Vector3(1e-6, 0, 0)),
    ];
  return distinct;
}
