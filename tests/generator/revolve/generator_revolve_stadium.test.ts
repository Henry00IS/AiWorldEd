import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveSegmentPropertySet, curveSegmentSectionSet } from '@/curve/model/curve_edit.js';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { CURVE_STADIUM_STRAIGHT_DEFAULT, CURVE_STADIUM_STRAIGHT_MIN } from '@/curve/model/curve_section.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import {
  generatorRevolveBrushes,
  generatorRevolveSectionFrame,
  type GeneratorRevolveFrame,
} from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveSurfaces, generatorRevolveUvLayout } from '@/generator/revolve/generator_revolve_surface.js';
import { generatorRevolveSmoothClasses } from '@/generator/revolve/generator_revolve_shading.js';
import { MODIFIER_SMOOTH_FLAT } from '@/modifier/smooth/modifier_smooth_shading.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';

/**
 * Builds a straight profile whose segment uses the stadium section.
 *
 * @param radius Profile value.
 * @param straight Optional flat side length.
 * @returns Stadium profile.
 */
function stadiumCurve(radius: number, straight?: number): Curve {
  const curve = curveSegmentSectionSet(
    curveFromPolyline([
      [0, radius],
      [1, radius],
    ]),
    [0],
    'stadium',
  );
  return straight === undefined ? curve : curveSegmentPropertySet(curve, [0], 'straight', straight);
}

/**
 * Revolves a profile at a frame centred away from the origin.
 *
 * @param curve Profile.
 * @param sides Round side count.
 * @returns Frame, stations, section frame and brushes.
 */
function revolve(curve: Curve, sides = 8) {
  const frame: GeneratorRevolveFrame = { center: new THREE.Vector3(1, 2, 3), sides };
  const stations = generatorRevolveStationsFromCurve(curve, 2, 1);
  const section = generatorRevolveSectionFrame(frame, stations[0] ?? false);
  return { frame, stations, section, brushes: generatorRevolveBrushes(frame, generatorRevolveRuns(stations)) };
}

/**
 * Returns the side faces of a brush whose normal points along a direction.
 *
 * @param brush Brush.
 * @param direction Unit direction.
 * @returns Face indices.
 */
function facesFacing(brush: SolidBrush, direction: THREE.Vector3): number[] {
  return brush.planes.flatMap((plane, index) => (plane.normal.dot(direction) > 1 - 1e-9 ? [index] : []));
}

/**
 * Returns a face's corners.
 *
 * @param brush Brush.
 * @param face Face index.
 * @returns Corner positions.
 */
function faceCorners(brush: SolidBrush, face: number): THREE.Vector3[] {
  const loop = brush.faces[face];
  return loop ? brush.getFaceVertexIndices(loop).map((corner) => brush.vertices[corner] ?? new THREE.Vector3()) : [];
}

describe('stadium column sections', () => {
  it('stores the straight length in the profile text and repairs it', () => {
    const curve = stadiumCurve(0.8, 0.6);
    expect(curveDecode(curveEncode(curve))).toEqual(curve);
    expect(stadiumCurve(1).segments[0]?.straight).toBe(CURVE_STADIUM_STRAIGHT_DEFAULT);
    expect(stadiumCurve(1, -2).segments[0]?.straight).toBe(CURVE_STADIUM_STRAIGHT_MIN);
    expect(curveSegmentSectionSet(curve, [0], 'round').segments[0]?.straight).toBeUndefined();
  });

  it('builds one convex brush whose two long sides are single flat faces', () => {
    const { brushes, frame } = revolve(stadiumCurve(0.8, 0.6), 8);
    expect(brushes).toHaveLength(1);
    const brush = brushes[0]!;
    expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
    expect(brush.faces).toHaveLength(2 * (4 + 1) + 2);
    for (const direction of [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)]) {
      const faces = facesFacing(brush, direction);
      expect(faces).toHaveLength(1);
      const corners = faceCorners(brush, faces[0] ?? -1);
      expect(corners).toHaveLength(4);
      const xs = corners.map((corner) => corner.x - frame.center.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * 0.6 * 0.8, 9);
    }
  });

  it('fills the width with round ends whose diameter is the depth', () => {
    const { brushes, frame } = revolve(stadiumCurve(0.8, 0.6), 16);
    const bounds = brushes[0]!.computeLocalBounds();
    expect(bounds.max.x - frame.center.x).toBeCloseTo(0.8, 9);
    expect(bounds.max.z - frame.center.z).toBeCloseTo(0.8 * 0.4, 9);
    for (const vertex of brushes[0]!.vertices) {
      const end = new THREE.Vector3(
        frame.center.x + Math.sign(vertex.x - frame.center.x) * 0.48,
        vertex.y,
        frame.center.z,
      );
      if (Math.abs(vertex.x - frame.center.x) > 0.48 + 1e-9) expect(vertex.distanceTo(end)).toBeCloseTo(0.32, 9);
    }
  });

  it('shades the flat sides hard and the round ends smooth', () => {
    const { brushes, section } = revolve(stadiumCurve(0.8));
    const brush = brushes[0]!;
    const classes = generatorRevolveSmoothClasses(brush, section);
    brush.planes.forEach((plane, index) => {
      const flat = Math.abs(plane.normal.y) > 0.999 || Math.abs(plane.normal.z) > 1 - 1e-9;
      expect(classes[index] === MODIFIER_SMOOTH_FLAT).toBe(flat);
    });
  });

  it('turns its flat sides with the segment rotation', () => {
    const { brushes } = revolve(curveSegmentPropertySet(stadiumCurve(0.8), [0], 'rotation', 90));
    expect(facesFacing(brushes[0]!, new THREE.Vector3(1, 0, 0))).toHaveLength(1);
    expect(facesFacing(brushes[0]!, new THREE.Vector3(0, 0, 1))).toHaveLength(0);
  });

  it('wraps the texture once around with a closed seam and one slice per side', () => {
    const { brushes, frame, stations, section } = revolve(stadiumCurve(0.8));
    const layout = generatorRevolveUvLayout(stations, frame.sides, { mode: 'stretch', around: 1, along: 1 });
    const brush = brushes[0]!;
    const surfaces = generatorRevolveSurfaces(brush, section, layout);
    const byCorner = new Map<string, number[]>();
    brush.planes.forEach((plane, face) => {
      if (Math.abs(plane.normal.y) > 0.5) return;
      for (const corner of faceCorners(brush, face)) {
        const key = `${corner.x.toFixed(5)},${corner.y.toFixed(5)},${corner.z.toFixed(5)}`;
        byCorner.set(key, [...(byCorner.get(key) ?? []), surfaces[face]?.uv.project(corner).u ?? 0]);
      }
    });
    expect(byCorner.size).toBe(20);
    for (const us of byCorner.values()) {
      const difference = Math.abs((us[0] ?? 0) - (us[1] ?? 0)) % 1;
      expect(Math.min(difference, 1 - difference)).toBeCloseTo(0, 9);
    }
  });
});
