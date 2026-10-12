import * as THREE from 'three';
import { SurfaceUvMatrix } from './surface_uv_matrix.js';

/** One world-space position paired with the UV it should project to. */
export interface SurfaceUvWorldSample {
  /** World-space position. */
  world: THREE.Vector3;
  /** Texture U at that position. */
  u: number;
  /** Texture V at that position. */
  v: number;
}

/** Three non-collinear samples that define a planar UV fit. */
interface SurfaceUvSampleTriple {
  first: SurfaceUvWorldSample;
  second: SurfaceUvWorldSample;
  third: SurfaceUvWorldSample;
}

/**
 * Fits a planar UV matrix so three or more world samples project to their UVs.
 *
 * @param samples World positions and the UVs they must reproduce.
 * @returns Fitted matrix, or null when the samples are collinear or too few.
 */
export function fitSurfaceUvMatrixFromWorldSamples(samples: readonly SurfaceUvWorldSample[]): SurfaceUvMatrix | null {
  const triple = pickNonCollinearSampleTriple(samples);
  if (!triple) {
    return null;
  }
  const uRow = solveAffineRow(triple.first, triple.second, triple.third, 'u');
  const vRow = solveAffineRow(triple.first, triple.second, triple.third, 'v');
  return new SurfaceUvMatrix(uRow, vRow);
}

/**
 * Picks three samples that are not on one line.
 *
 * @param samples Candidate samples.
 * @returns Triple, or null when none exists.
 */
function pickNonCollinearSampleTriple(samples: readonly SurfaceUvWorldSample[]): SurfaceUvSampleTriple | null {
  const first = samples[0];
  if (!first || samples.length < 3) {
    return null;
  }
  const second = pickSeparatedSample(samples, first);
  if (!second) {
    return null;
  }
  const third = pickNonCollinearSample(samples, first, second);
  if (!third) {
    return null;
  }
  return { first, second, third };
}

/**
 * Finds a sample that is not on top of the origin sample.
 *
 * @param samples Candidate samples.
 * @param origin Sample to move away from.
 * @returns Separated sample, or null.
 */
function pickSeparatedSample(
  samples: readonly SurfaceUvWorldSample[],
  origin: SurfaceUvWorldSample,
): SurfaceUvWorldSample | null {
  for (const sample of samples) {
    if (sample.world.distanceToSquared(origin.world) > 1e-8) {
      return sample;
    }
  }
  return null;
}

/**
 * Finds a sample that is not on the line through the first two.
 *
 * @param samples Candidate samples.
 * @param origin First sample.
 * @param second Second sample.
 * @returns Off-line sample, or null.
 */
function pickNonCollinearSample(
  samples: readonly SurfaceUvWorldSample[],
  origin: SurfaceUvWorldSample,
  second: SurfaceUvWorldSample,
): SurfaceUvWorldSample | null {
  const edge = new THREE.Vector3().subVectors(second.world, origin.world);
  for (const sample of samples) {
    if (sampleLeavesEdge(origin, edge, sample)) {
      return sample;
    }
  }
  return null;
}

/**
 * Returns whether a sample leaves the line of an edge.
 *
 * @param origin Edge start.
 * @param edge Edge direction.
 * @param sample Candidate sample.
 * @returns True when the sample is off the line.
 */
function sampleLeavesEdge(origin: SurfaceUvWorldSample, edge: THREE.Vector3, sample: SurfaceUvWorldSample): boolean {
  const other = new THREE.Vector3().subVectors(sample.world, origin.world);
  return new THREE.Vector3().crossVectors(edge, other).lengthSq() > 1e-10;
}

/**
 * Solves n·p + w = u or v for three samples.
 *
 * @param first First sample.
 * @param second Second sample.
 * @param third Third sample.
 * @param channel U or V.
 * @returns Row (n, w).
 */
function solveAffineRow(
  first: SurfaceUvWorldSample,
  second: SurfaceUvWorldSample,
  third: SurfaceUvWorldSample,
  channel: 'u' | 'v',
): THREE.Vector4 {
  return solveRowFromDeltas(
    first.world,
    sampleChannel(first, channel),
    second.world,
    sampleChannel(second, channel),
    third.world,
    sampleChannel(third, channel),
  );
}

/**
 * Reads U or V from a sample.
 *
 * @param sample Sample to read.
 * @param channel U or V.
 * @returns Channel value.
 */
function sampleChannel(sample: SurfaceUvWorldSample, channel: 'u' | 'v'): number {
  if (channel === 'u') {
    return sample.u;
  }
  return sample.v;
}

/**
 * Solves n·p + w = value from three points using edge differences.
 *
 * @param p0 First point.
 * @param s0 First scalar.
 * @param p1 Second point.
 * @param s1 Second scalar.
 * @param p2 Third point.
 * @param s2 Third scalar.
 * @returns Row (n, w).
 */
function solveRowFromDeltas(
  p0: THREE.Vector3,
  s0: number,
  p1: THREE.Vector3,
  s1: number,
  p2: THREE.Vector3,
  s2: number,
): THREE.Vector4 {
  const e1 = new THREE.Vector3().subVectors(p1, p0);
  const e2 = new THREE.Vector3().subVectors(p2, p0);
  const gradient = solvePlaneGradient(e1, e2, s1 - s0, s2 - s0);
  if (!gradient) {
    return new THREE.Vector4(0, 0, 0, s0);
  }
  return new THREE.Vector4(gradient.x, gradient.y, gradient.z, s0 - gradient.dot(p0));
}

/**
 * Solves e1·n = ds1 and e2·n = ds2 in the plane of the two edges.
 *
 * @param e1 First edge.
 * @param e2 Second edge.
 * @param ds1 Scalar change along the first edge.
 * @param ds2 Scalar change along the second edge.
 * @returns Gradient, or null when the edges are parallel.
 */
function solvePlaneGradient(e1: THREE.Vector3, e2: THREE.Vector3, ds1: number, ds2: number): THREE.Vector3 | null {
  const a11 = e1.dot(e1);
  const a12 = e1.dot(e2);
  const a22 = e2.dot(e2);
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-14) {
    return null;
  }
  const c1 = (a22 * ds1 - a12 * ds2) / det;
  const c2 = (a11 * ds2 - a12 * ds1) / det;
  return new THREE.Vector3().addScaledVector(e1, c1).addScaledVector(e2, c2);
}
