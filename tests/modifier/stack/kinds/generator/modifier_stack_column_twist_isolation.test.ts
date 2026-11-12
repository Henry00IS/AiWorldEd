import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import twistData from '../../../../generator/revolve/fixtures/twist_bug.json';
import { curveFromData, curveEncode } from '@/curve/model/curve_codec.js';
import { curveSegmentPropertySet, curveSegmentSectionSet } from '@/curve/model/curve_edit.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Compiles the stepped TwistBug profile with a twisted middle section.
 *
 * @param twist Middle segment rotation in degrees.
 * @param section Middle section type.
 * @param aspect Cross-section depth relative to width.
 * @returns Generated brushes in bottom-to-top order.
 */
function twistColumn(twist: number, section: 'square' | 'polygon' = 'square', aspect = 1) {
  const decoded = curveFromData(twistData.curve);
  if (!decoded) throw new Error('Expected TwistBug.curve');
  const curve = curveSegmentPropertySet(curveSegmentSectionSet(decoded, [2], section), [2], 'twist', twist);
  return stackFixture([{ kind: 'column', parameters: { profile: curveEncode(curve), sides: '8', aspect } }], 3)
    .compile()
    .instances.slice(1);
}

/**
 * Returns the vertex arrays of the two end brushes.
 *
 * @param pieces Compiled column brushes.
 * @returns End geometry without generated identifiers.
 */
function endVertices(pieces: SolidBrushInstance[]) {
  return [pieces[0], pieces.at(-1)].map((piece) => piece?.brush.vertices.map((vertex) => vertex.toArray()));
}

/**
 * Checks that rotating every twisted ring back recovers the original section.
 *
 * @param pieces Twisted column brushes.
 * @param reference Original middle brush.
 * @param twist Total twist in degrees.
 */
function expectUnscaledRings(pieces: SolidBrushInstance[], reference: SolidBrushInstance, twist: number): void {
  const bounds = new THREE.Box3().setFromPoints(reference.brush.vertices);
  const height = bounds.max.y - bounds.min.y;
  for (const piece of pieces.slice(1, -1)) {
    expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
    for (const vertex of piece.brush.vertices) {
      const angle = THREE.MathUtils.degToRad((twist * (vertex.y - bounds.min.y)) / height);
      const point = vertex.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
      expect(
        reference.brush.vertices.some((original) => Math.hypot(original.x - point.x, original.z - point.z) < 1e-6),
      ).toBe(true);
    }
  }
}

/**
 * Regression for a middle twist changing the dimensions of unrelated end
 * brushes.
 */
describe('column twist isolation', () => {
  it.each(['square', 'polygon'] as const)('keeps Round end vertices identical around a twisted %s', (section) => {
    const reference = twistColumn(0, section);
    expect(reference).toHaveLength(3);
    const middle = reference[1];
    if (!middle) throw new Error('Expected a middle brush');
    for (const twist of [0, 30, 45, 90]) {
      const pieces = twistColumn(twist, section);
      expect(pieces).toHaveLength(2 + Math.max(1, Math.ceil(twist / 5)));
      expect(endVertices(pieces)).toEqual(endVertices(reference));
      expectUnscaledRings(pieces, middle, twist);
    }
  });

  it.each([0.5, 2])('preserves end vertices and section size with aspect %s', (aspect) => {
    const reference = twistColumn(0, 'square', aspect);
    const middle = reference[1];
    if (!middle) throw new Error('Expected a middle brush');
    for (const twist of [30, 45, 90]) {
      const pieces = twistColumn(twist, 'square', aspect);
      expect(endVertices(pieces)).toEqual(endVertices(reference));
      expectUnscaledRings(pieces, middle, twist);
    }
  });

  it('allows rotated square corners outside the box instead of shrinking the whole column', () => {
    const square = curveSegmentSectionSet(
      curveFromPolyline([
        [0, 1],
        [1, 1],
      ]),
      [0],
      'square',
    );
    const curve = curveSegmentPropertySet(square, [0], 'twist', 45);
    const pieces = stackFixture([{ kind: 'column', parameters: { profile: curveEncode(curve) } }], 3)
      .compile()
      .instances.slice(1);
    const vertices = pieces.flatMap((piece) => piece.brush.vertices);
    expect(vertices.length).toBeGreaterThan(0);
    for (const vertex of vertices) expect(Math.hypot(vertex.x, vertex.z)).toBeCloseTo(1.5 * Math.SQRT2, 6);
    expect(Math.max(...vertices.map((vertex) => Math.abs(vertex.x)))).toBeGreaterThan(1.5);
  });
});
