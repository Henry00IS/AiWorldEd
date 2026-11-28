import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { solidCsgCoverageCheck, type SolidCsgCoverageBrush } from './solid_csg_coverage_oracle.js';
import curvedTrimProfile from './fixtures/curved_trim_profile.json';

/** One brush of the curved trim fixture, in model space. */
interface CurvedTrimBrush {
  name: string;
  vertices: number[];
  faces: number[][];
}

/**
 * Curve wedges whose room-facing curved face lost a strip next to the thin
 * wedge beyond them, one per run of the trim.
 */
const CURVED_TRIM_STRIP_BRUSHES = ['Solid Script.1DB', 'Solid Script.909', 'Solid Script.17F'];

/**
 * Wedges at most 0.57 mm thick, thinner than the fat-plane band. Their whole
 * end cap lies within the band of both neighbours' coplanar caps, so the caps
 * (about 17 mm² each) count as covered: a known threshold limit, not checked.
 */
const CURVED_TRIM_SUB_BAND_WEDGES = ['Solid Script.F51', 'Solid Script.EF5'];

/** Coverage tolerance: the lost strips lie within 0.6 mm of the thin wedge. */
const CURVED_TRIM_COVERAGE_TOLERANCE = 1e-5;

/**
 * Builds one fixture brush from its model-space vertices and face index loops.
 *
 * @param entry Fixture brush.
 * @returns Convex brush.
 */
function fixtureBrush(entry: CurvedTrimBrush): SolidBrush {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index + 2 < entry.vertices.length; index += 3) {
    points.push(new THREE.Vector3(entry.vertices[index], entry.vertices[index + 1], entry.vertices[index + 2]));
  }
  const brush = SolidBrushFactory.createFromFaceLoops(entry.faces.map((loop) => loop.map((at) => points[at]!)));
  if (!brush) throw new Error(`fixture brush ${entry.name} does not close`);
  return brush;
}

/** Length of the generated trim along Z. */
const GENERATED_TRIM_LENGTH = 2;

/**
 * Builds a prism brush from a counter-clockwise XY profile, centred on Z, with
 * the side faces in profile edge order after the two caps.
 *
 * @param profile Profile corners in XY, counter-clockwise.
 * @returns Convex brush.
 */
function prism(profile: readonly THREE.Vector2[]): SolidBrush {
  const front = profile.map((corner) => new THREE.Vector3(corner.x, corner.y, GENERATED_TRIM_LENGTH / 2));
  const back = profile.map((corner) => new THREE.Vector3(corner.x, corner.y, -GENERATED_TRIM_LENGTH / 2));
  const sides = profile.map((_, index) => {
    const next = (index + 1) % profile.length;
    return [front[next]!, front[index]!, back[index]!, back[next]!];
  });
  const brush = SolidBrushFactory.createFromFaceLoops([front, [...back].reverse(), ...sides]);
  if (!brush) throw new Error('prism does not close');
  return brush;
}

/**
 * Shape of a curve slice followed by a thin last slice, as a curve script cuts
 * it.
 */
interface CurvedTrimSliceShape {
  /** Length of the thick slice's curved side, in metres. */
  curveLength: number;
  /** Angle the thin slice's outer side turns further round, in radians. */
  turn: number;
  /** Length of the thin slice's outer side, in metres. */
  thinLength: number;
  /** Thickness of the thin slice across its shared side, in metres. */
  thinThickness: number;
  /** Length of the side the two slices share, in metres. */
  sharedLength: number;
}

/**
 * Returns a unit XY direction turned clockwise from +Y by an angle.
 *
 * @param angle Clockwise angle from +Y, in radians.
 * @returns Unit direction.
 */
function directionFromUp(angle: number): THREE.Vector2 {
  return new THREE.Vector2(Math.sin(angle), Math.cos(angle));
}

/**
 * Builds two curve slices: a thick one whose curved side runs up +Y into the
 * shared corner, and a thin one beyond it whose outer side turns a little
 * further round, both reaching the same far corner along the shared side.
 *
 * @param shape Slice shape.
 * @returns Named brushes, thick slice first, and the thick slice's curved face
 *   index.
 */
function curvedTrimSlices(shape: CurvedTrimSliceShape) {
  const corner = new THREE.Vector2(0, 0);
  const curveStart = corner.clone().addScaledVector(directionFromUp(0), -shape.curveLength);
  const thinTip = corner.clone().addScaledVector(directionFromUp(shape.turn), shape.thinLength);
  const sharedAngle = shape.turn + Math.asin(shape.thinThickness / shape.thinLength);
  const farCorner = corner.clone().addScaledVector(directionFromUp(sharedAngle), shape.sharedLength);
  const thick = prism([corner, curveStart, farCorner]);
  const thin = prism([thinTip, corner, farCorner]);
  const brushes: SolidCsgCoverageBrush[] = [
    { id: 'thick', name: 'thick', brush: thick },
    { id: 'thin', name: 'thin', brush: thin },
  ];
  return { brushes, curvedFaceIndex: 2 };
}

/**
 * Compiles a union of model-space brushes and checks its surface coverage.
 *
 * @param brushes Named brushes.
 * @returns Coverage report.
 */
function compileAndCheck(brushes: readonly SolidCsgCoverageBrush[]) {
  const instances = brushes.map(
    ({ id, name, brush }) => new SolidBrushInstance(id, name, brush, SolidOperation.Additive),
  );
  const polygons = new SolidCsgCompiler().compile(instances, { forceFull: true });
  return solidCsgCoverageCheck(brushes, polygons, CURVED_TRIM_COVERAGE_TOLERANCE);
}

describe('CSG of a curved trim fanned out of thin wedges', () => {
  const fixture = (curvedTrimProfile as { brushes: CurvedTrimBrush[] }).brushes;
  const trim = fixture.map((entry) => ({ id: entry.name, name: entry.name, brush: fixtureBrush(entry) }));

  it('keeps the whole curved face of each wedge next to a thinner wedge', () => {
    const report = compileAndCheck(trim);
    const brushOf = (face: string) => face.slice(0, face.lastIndexOf(':'));
    expect(report.missingFaces.filter((face) => CURVED_TRIM_STRIP_BRUSHES.includes(brushOf(face)))).toEqual([]);
    expect(report.missingFaces.filter((face) => !CURVED_TRIM_SUB_BAND_WEDGES.includes(brushOf(face)))).toEqual([]);
    expect(report.extraPolygons).toBe(0);
  });

  it('keeps the curved face when only the wedge and its thin neighbour are present', () => {
    const pair = trim.filter((entry) => ['Solid Script.1DB', 'Solid Script.F51'].includes(entry.name));
    const report = compileAndCheck(pair);
    expect(report.missingFaces.filter((face) => face.startsWith('Solid Script.1DB:'))).toEqual([]);
  });

  it.each([
    [0.0073, 0.00057],
    [0.0073, 0.0003],
    [0.003, 0.00057],
    [0.012, 0.0004],
  ])('keeps the curved face before a thin slice turning %s rad further, %s m thick', (turn, thinThickness) => {
    const { brushes, curvedFaceIndex } = curvedTrimSlices({
      curveLength: 0.019,
      turn,
      thinLength: 0.0096,
      thinThickness,
      sharedLength: 0.058,
    });
    const report = compileAndCheck(brushes);
    expect(report.missingFaces).not.toContain(`thick:${curvedFaceIndex}`);
    expect(report.extraPolygons).toBe(0);
  });
});
