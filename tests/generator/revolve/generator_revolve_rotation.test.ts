import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { curveInsertPoint, curveSegmentPropertySet, curveSegmentSectionSet } from '@/curve/model/curve_edit.js';
import { curveDecode, curveEncode, curveToData } from '@/curve/model/curve_codec.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import { generatorRevolveBrushes, generatorRevolveSectionFrame } from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveSurfaces, generatorRevolveUvLayout } from '@/generator/revolve/generator_revolve_surface.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { CurveSegmentSection } from '@/curve/model/curve_model.js';

/** Revolve frame shared by every test column. */
const FRAME = { center: new THREE.Vector3(), sides: 16 };

/**
 * Builds a straight one-segment profile with a section, rotation and twist.
 *
 * @param section Cross-section of the segment.
 * @param rotation Segment rotation in degrees.
 * @param twist Segment twist in degrees.
 * @returns Curve.
 */
function straightProfile(section: CurveSegmentSection, rotation: number, twist = 0): Curve {
  let curve = curveSegmentSectionSet(
    curveFromPolyline([
      [0, 0.6],
      [1, 0.6],
    ]),
    [0],
    section,
  );
  curve = curveSegmentPropertySet(curve, [0], 'rotation', rotation);
  return curveSegmentPropertySet(curve, [0], 'twist', twist);
}

/**
 * Revolves a profile into convex brushes.
 *
 * @param curve Profile.
 * @returns Brushes bottom to top, each checked for validity.
 */
function revolve(curve: Curve): SolidBrush[] {
  const brushes = generatorRevolveBrushes(FRAME, generatorRevolveRuns(generatorRevolveStationsFromCurve(curve, 2, 1)));
  for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
  return brushes;
}

/**
 * Returns sorted vertex keys, optionally rotated about the column axis first.
 *
 * @param brushes Brushes.
 * @param degrees Rotation applied to every vertex.
 * @returns Sorted rounded coordinates.
 */
function vertexKeys(brushes: readonly SolidBrush[], degrees = 0): string[] {
  const axis = new THREE.Vector3(0, 1, 0);
  return brushes
    .flatMap((brush) => brush.vertices)
    .map((vertex) => vertex.clone().applyAxisAngle(axis, THREE.MathUtils.degToRad(degrees)))
    .map((vertex) =>
      vertex
        .toArray()
        .map((value) => (Math.abs(value) < 5e-7 ? 0 : value).toFixed(6))
        .join(','),
    )
    .sort();
}

/**
 * Builds a two-segment square profile with per-segment rotation and twist.
 *
 * @param rotations Rotation of each segment.
 * @param twists Twist of each segment.
 * @returns Curve.
 */
function twoSegmentProfile(rotations: readonly number[], twists: readonly number[] = [0, 0]): Curve {
  let curve = curveSegmentSectionSet(
    curveFromPolyline([
      [0, 0.6],
      [0.5, 0.6],
      [1, 0.6],
    ]),
    [0, 1],
    'square',
  );
  rotations.forEach((rotation, index) => (curve = curveSegmentPropertySet(curve, [index], 'rotation', rotation)));
  twists.forEach((twist, index) => (curve = curveSegmentPropertySet(curve, [index], 'twist', twist)));
  return curve;
}

/** Per-segment rigid rotation of column sections. */
describe('column segment rotation', () => {
  it.each(['square', 'polygon', 'round'] as const)('turns a %s segment rigidly about the axis', (section) => {
    const reference = revolve(straightProfile(section, 0));
    for (const rotation of [45, -30, 90]) {
      expect(vertexKeys(revolve(straightProfile(section, rotation)))).toEqual(vertexKeys(reference, rotation));
    }
  });

  it('puts a 45° square corner on the axes, past the unrotated half-width', () => {
    const reference = revolve(straightProfile('square', 0));
    const rotated = revolve(straightProfile('square', 45));
    const halfWidth = Math.max(...reference.flatMap((brush) => brush.vertices.map((vertex) => Math.abs(vertex.x))));
    const reach = Math.max(...rotated.flatMap((brush) => brush.vertices.map((vertex) => Math.abs(vertex.x))));
    expect(reach).toBeCloseTo(halfWidth * Math.SQRT2, 6);
  });

  it('applies the segment twist on top of its rotation', () => {
    const stations = generatorRevolveStationsFromCurve(straightProfile('square', 30, 60), 2, 1);
    expect(stations[0]?.angle).toBe(30);
    expect(stations.at(-1)?.angle).toBe(90);
    const twistedOnly = revolve(straightProfile('square', 0, 60));
    expect(vertexKeys(revolve(straightProfile('square', 30, 60)))).toEqual(vertexKeys(twistedOnly, 30));
  });

  it('does not carry a rotation into the next segment, while twist still accumulates', () => {
    const plain = revolve(twoSegmentProfile([0, 0]));
    const rotatedBelow = revolve(twoSegmentProfile([45, 0]));
    expect(plain).toHaveLength(1);
    expect(rotatedBelow).toHaveLength(2);
    for (const vertex of rotatedBelow[1]?.vertices ?? []) {
      expect(Math.abs(vertex.x)).toBeCloseTo(0.6, 6);
      expect(Math.abs(vertex.z)).toBeCloseTo(0.6, 6);
    }
    const stations = generatorRevolveStationsFromCurve(twoSegmentProfile([45, 10], [20, 0]), 2, 1);
    const joint = stations.filter((station) => Math.abs(station.height - 1) < 1e-9);
    expect(joint.map((station) => station.angle)).toEqual([65, 30]);
    expect(stations.at(-1)?.angle).toBe(30);
  });

  it('keeps equally rotated neighbours in one convex run and splits different rotations', () => {
    expect(generatorRevolveRuns(generatorRevolveStationsFromCurve(twoSegmentProfile([45, 45]), 2, 1))).toHaveLength(1);
    expect(generatorRevolveRuns(generatorRevolveStationsFromCurve(twoSegmentProfile([45, 0]), 2, 1))).toHaveLength(2);
  });

  it('leaves profiles without rotation exactly as before', () => {
    const curve = twoSegmentProfile([0, 0], [30, 0]);
    expect(curve.segments.every((segment) => !('rotation' in segment))).toBe(true);
    const stations = generatorRevolveStationsFromCurve(curve, 2, 1);
    expect(stations.some((station) => 'rotation' in station)).toBe(false);
    const heights = stations.map((station) => station.height);
    expect(new Set(heights).size).toBe(heights.length);
  });

  it('maps side textures of a rotated section like the unrotated one', () => {
    const textured = (rotation: number) => {
      const curve = straightProfile('square', rotation);
      const stations = generatorRevolveStationsFromCurve(curve, 2, 1);
      const runs = generatorRevolveRuns(stations);
      const brush = generatorRevolveBrushes(FRAME, runs)[0];
      if (!brush) throw new Error('Expected a brush');
      const layout = generatorRevolveUvLayout(stations, FRAME.sides, { mode: 'stretch', around: 1, along: 1 });
      const surfaces = generatorRevolveSurfaces(
        brush,
        generatorRevolveSectionFrame(FRAME, runs[0]?.[0] ?? false),
        layout,
      );
      return { brush, surfaces };
    };
    const reference = textured(0);
    const rotated = textured(45);
    const axis = new THREE.Vector3(0, 1, 0);
    reference.brush.faces.forEach((face, index) => {
      if (Math.abs(reference.brush.planes[index]?.normal.y ?? 1) > 0.999) return;
      const normal = reference.brush.planes[index]?.normal.clone().applyAxisAngle(axis, Math.PI / 4);
      const match = rotated.brush.planes.findIndex((plane) => normal && plane.normal.dot(normal) > 1 - 1e-6);
      for (const point of reference.brush.getFaceVertices(face)) {
        const expected = reference.surfaces[index]?.uv.project(point);
        const actual = rotated.surfaces[match]?.uv.project(point.clone().applyAxisAngle(axis, Math.PI / 4));
        expect(actual?.u).toBeCloseTo(expected?.u ?? Number.NaN, 6);
        expect(actual?.v).toBeCloseTo(expected?.v ?? Number.NaN, 6);
      }
    });
  });
});

/** Storage and editing of segment rotation. */
describe('curve segment rotation storage', () => {
  it('stores rotation as the eighth tuple value and reads older tuples as unrotated', () => {
    const rotated = straightProfile('square', 45);
    expect(curveToData(rotated).segments[0]).toEqual(['linear', 8, 's', 0, 0, 0, 0, 45]);
    expect(curveDecode(curveEncode(rotated))?.segments[0]?.rotation).toBe(45);
    expect(curveToData(straightProfile('square', 0)).segments[0]).toEqual(['linear', 8, 's']);
    const older = curveDecode(
      JSON.stringify({
        points: [
          [0, 1],
          [1, 1],
        ],
        segments: [['linear', 8, 's', 0, 90]],
      }),
    );
    expect(older?.segments[0]?.rotation).toBeUndefined();
    expect(older?.segments[0]?.twist).toBe(90);
  });

  it('clamps rotation to one full turn either way', () => {
    expect(straightProfile('square', 1000).segments[0]?.rotation).toBe(360);
    expect(straightProfile('square', -1000).segments[0]?.rotation).toBe(-360);
  });

  it('gives both halves of a split segment its rotation', () => {
    const { curve } = curveInsertPoint(straightProfile('square', 45, 90), 0.5);
    expect(curve.segments.map((segment) => segment.rotation)).toEqual([45, 45]);
    const stations = generatorRevolveStationsFromCurve(curve, 2, 1);
    expect(stations.filter((station) => Math.abs(station.height - 1) < 1e-9)).toHaveLength(1);
  });
});
