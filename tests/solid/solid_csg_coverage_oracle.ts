import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';

/**
 * Default distance a sample must keep from every other brush to count as
 * clearly visible or hidden.
 */
export const SOLID_CSG_COVERAGE_TOLERANCE = 0.0025;

/** Sample rows per face triangle fan wedge. */
const SOLID_CSG_COVERAGE_SAMPLE_ROWS = 10;

/**
 * Smallest normal agreement between a sample's face and the emitted polygon
 * covering it.
 */
const SOLID_CSG_COVERAGE_NORMAL_AGREEMENT = 0.99;

/** One additive brush of a union, in model space. */
export interface SolidCsgCoverageBrush {
  /** Brush id the compiled polygons carry. */
  id: string;
  /** Human readable name for failure messages. */
  name: string;
  /** Convex brush in model space. */
  brush: SolidBrush;
}

/** Problems found in a union's compiled surface. */
export interface SolidCsgCoverageReport {
  /**
   * Face samples clearly outside every other brush that no emitted polygon of
   * their own face covers.
   */
  missingSamples: number;
  /** Emitted polygons whose centroid lies clearly inside another brush. */
  extraPolygons: number;
  /** Names of the brush faces with missing samples, as name:faceIndex. */
  missingFaces: string[];
}

/**
 * Checks that the compiled surface of a union of additive convex solides is
 * complete: every face point clearly outside all other brushes is emitted for
 * its own face, and no emitted polygon sits clearly inside another brush.
 *
 * @param brushes Additive brushes in model space.
 * @param polygons Compiled polygons of the union.
 * @param tolerance Distance from other brushes below which a point is
 *   ambiguous.
 * @returns Report of missing samples and extra polygons.
 */
export function solidCsgCoverageCheck(
  brushes: readonly SolidCsgCoverageBrush[],
  polygons: readonly SolidCompiledPolygon[],
  tolerance = SOLID_CSG_COVERAGE_TOLERANCE,
): SolidCsgCoverageReport {
  const report: SolidCsgCoverageReport = { missingSamples: 0, extraPolygons: 0, missingFaces: [] };
  const polygonsByFace = solidCsgCoveragePolygonsByFace(polygons);
  for (const subject of brushes) {
    subject.brush.faces.forEach((face, faceIndex) => {
      const own = polygonsByFace.get(`${subject.id}:${face.surfaceIndex}`) ?? [];
      const missing = solidCsgCoverageFaceMissing(subject, faceIndex, own, brushes, tolerance);
      report.missingSamples += missing;
      if (missing > 0) report.missingFaces.push(`${subject.name}:${faceIndex}`);
    });
  }
  report.extraPolygons = solidCsgCoverageExtraCount(brushes, polygons, tolerance);
  return report;
}

/**
 * Groups compiled polygons by brush id and surface index.
 *
 * @param polygons Compiled polygons.
 * @returns Map from brushId:surfaceIndex to its polygons.
 */
function solidCsgCoveragePolygonsByFace(
  polygons: readonly SolidCompiledPolygon[],
): Map<string, SolidCompiledPolygon[]> {
  const byFace = new Map<string, SolidCompiledPolygon[]>();
  for (const polygon of polygons) {
    const key = `${polygon.brushId}:${polygon.surfaceIndex}`;
    const list = byFace.get(key) ?? [];
    list.push(polygon);
    byFace.set(key, list);
  }
  return byFace;
}

/**
 * Counts the clearly visible samples of one face that its own emitted polygons
 * do not cover.
 *
 * @param subject Brush that owns the face.
 * @param faceIndex Face index into the brush faces and planes.
 * @param own Emitted polygons of that face.
 * @param brushes Every brush of the union.
 * @param tolerance Ambiguity distance.
 * @returns Number of uncovered visible samples.
 */
function solidCsgCoverageFaceMissing(
  subject: SolidCsgCoverageBrush,
  faceIndex: number,
  own: readonly SolidCompiledPolygon[],
  brushes: readonly SolidCsgCoverageBrush[],
  tolerance: number,
): number {
  const face = subject.brush.faces[faceIndex];
  const plane = subject.brush.planes[faceIndex];
  if (!face || !plane) return 0;
  let missing = 0;
  for (const sample of solidCsgCoverageFaceSamples(subject.brush.getFaceVertices(face))) {
    if (!solidCsgCoverageClearlyOutsideOthers(sample, subject, brushes, tolerance)) continue;
    if (!own.some((polygon) => solidCsgCoveragePolygonCovers(polygon, sample, plane.normal))) missing++;
  }
  return missing;
}

/**
 * Spreads sample points evenly over a convex polygon, away from its edges.
 *
 * @param loop Ordered convex polygon.
 * @returns Sample points inside the polygon.
 */
export function solidCsgCoverageFaceSamples(loop: readonly THREE.Vector3[]): THREE.Vector3[] {
  const samples: THREE.Vector3[] = [];
  const first = loop[0];
  if (!first) return samples;
  for (let wedge = 1; wedge + 1 < loop.length; wedge++) {
    const second = loop[wedge]!;
    const third = loop[wedge + 1]!;
    for (let row = 0; row < SOLID_CSG_COVERAGE_SAMPLE_ROWS; row++) {
      for (let column = 0; column < SOLID_CSG_COVERAGE_SAMPLE_ROWS - row; column++) {
        const u = (row + 0.31) / SOLID_CSG_COVERAGE_SAMPLE_ROWS;
        const v = (column + 0.37) / SOLID_CSG_COVERAGE_SAMPLE_ROWS;
        if (u + v >= 1) continue;
        samples.push(
          first
            .clone()
            .multiplyScalar(1 - u - v)
            .addScaledVector(second, u)
            .addScaledVector(third, v),
        );
      }
    }
  }
  return samples;
}

/**
 * Returns the largest signed distance of a point to a brush's planes, which is
 * negative inside the brush and positive outside it.
 *
 * @param brush Convex brush.
 * @param point Point to measure.
 * @returns Signed distance to the brush volume.
 */
export function solidCsgCoverageSignedDistance(brush: SolidBrush, point: THREE.Vector3): number {
  let distance = Number.NEGATIVE_INFINITY;
  for (const plane of brush.planes) distance = Math.max(distance, plane.signedDistance(point));
  return distance;
}

/**
 * Returns whether a point lies clearly outside every brush but the subject.
 *
 * @param point Point to test.
 * @param subject Brush the point belongs to.
 * @param brushes Every brush of the union.
 * @param tolerance Ambiguity distance.
 * @returns True when no other brush comes within the tolerance.
 */
function solidCsgCoverageClearlyOutsideOthers(
  point: THREE.Vector3,
  subject: SolidCsgCoverageBrush,
  brushes: readonly SolidCsgCoverageBrush[],
  tolerance: number,
): boolean {
  for (const other of brushes) {
    if (other !== subject && solidCsgCoverageSignedDistance(other.brush, point) < tolerance) return false;
  }
  return true;
}

/**
 * Returns whether an emitted convex polygon facing the same way covers a point.
 *
 * @param polygon Emitted polygon.
 * @param point Point on the face.
 * @param normal Face normal.
 * @returns True when the point projects inside the polygon.
 */
function solidCsgCoveragePolygonCovers(
  polygon: SolidCompiledPolygon,
  point: THREE.Vector3,
  normal: THREE.Vector3,
): boolean {
  if (polygon.normal.dot(normal) < SOLID_CSG_COVERAGE_NORMAL_AGREEMENT) return false;
  const vertices = polygon.vertices;
  const edge = new THREE.Vector3();
  const toPoint = new THREE.Vector3();
  for (let index = 0; index < vertices.length; index++) {
    const start = vertices[index]!;
    edge.subVectors(vertices[(index + 1) % vertices.length]!, start);
    toPoint.subVectors(point, start);
    if (edge.cross(toPoint).dot(polygon.normal) < -1e-9) return false;
  }
  return true;
}

/**
 * Counts emitted polygons whose centroid lies clearly inside a brush other than
 * the one that emitted it.
 *
 * @param brushes Every brush of the union.
 * @param polygons Compiled polygons.
 * @param tolerance Ambiguity distance.
 * @returns Number of polygons buried inside another brush.
 */
function solidCsgCoverageExtraCount(
  brushes: readonly SolidCsgCoverageBrush[],
  polygons: readonly SolidCompiledPolygon[],
  tolerance: number,
): number {
  let extra = 0;
  for (const polygon of polygons) {
    const centroid = new THREE.Vector3();
    for (const vertex of polygon.vertices) centroid.add(vertex);
    centroid.divideScalar(Math.max(1, polygon.vertices.length));
    const buried = brushes.some(
      (other) => other.id !== polygon.brushId && solidCsgCoverageSignedDistance(other.brush, centroid) < -tolerance,
    );
    if (buried) extra++;
  }
  return extra;
}
