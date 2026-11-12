import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveDeletePoint, curveInsertPoint, curveMirror, curveSegmentSectionSet } from '@/curve/model/curve_edit.js';
import { curveSegmentBlendSet } from '@/curve/model/curve_blend.js';
import { curveEquals, curveFromPolyline } from '@/curve/model/curve_model.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESETS_TURNERY } from '@/curve/model/curve_preset_turnery.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Straight profile: square block, then a round shaft of the same radius, with
 * the default blend switched off so the block keeps a hard step.
 */
const BLOCK_THEN_SHAFT = curveSegmentBlendSet(
  curveSegmentSectionSet(
    curveFromPolyline([
      [0, 0.8],
      [0.3, 0.8],
      [1, 0.8],
    ]),
    [0],
    'square',
  ),
  [0, 1],
  false,
);

/**
 * Builds a column in a unit volume and returns its pieces.
 *
 * @param profile Encoded profile.
 * @param sides Side count.
 * @returns Pieces.
 */
function column(profile: string, sides = '16'): SolidBrushInstance[] {
  return stackFixture([{ kind: 'column', parameters: { profile, sides } }], 1)
    .compile()
    .instances.slice(1);
}

/**
 * Returns a piece's world-space vertices.
 *
 * @param piece Piece.
 * @returns Vertices.
 */
function vertices(piece: SolidBrushInstance): THREE.Vector3[] {
  const matrix = piece.getLocalMatrix();
  return piece.brush.vertices.map((vertex) => vertex.clone().applyMatrix4(matrix));
}

describe('square and round segment sections', () => {
  it('saves square sections in the profile text and keeps them through edits', () => {
    const decoded = curveDecode(curveEncode(BLOCK_THEN_SHAFT))!;
    expect(decoded.segments.map((segment) => segment.section ?? 'round')).toEqual(['square', 'round']);
    expect(curveEquals(decoded, BLOCK_THEN_SHAFT)).toBe(true);
    expect(curveEquals(decoded, curveSegmentSectionSet(decoded, [0], 'round'))).toBe(false);
    expect(curveDecode('{"points":[[0,1],[1,1]],"segments":[["linear",8]]}')?.segments[0]?.section).toBeUndefined();
    const split = curveInsertPoint(BLOCK_THEN_SHAFT, 0.1).curve;
    expect(split.segments.map((segment) => segment.section ?? 'round')).toEqual(['square', 'square', 'round']);
    expect(curveMirror(BLOCK_THEN_SHAFT).segments.map((segment) => segment.section ?? 'round')).toEqual([
      'round',
      'square',
    ]);
    expect(curveDeletePoint(BLOCK_THEN_SHAFT, 1).segments[0]?.section).toBe('square');
  });

  it('marks square stations and splits runs where the section changes', () => {
    const stations = generatorRevolveStationsFromCurve(BLOCK_THEN_SHAFT, 2, 1);
    expect(stations.map((station) => !!station.square)).toEqual([true, false, false]);
    expect(generatorRevolveRuns(stations)).toHaveLength(2);
  });

  it('builds a square block filling the bounds at its value and a round shaft above', () => {
    const pieces = column(curveEncode(BLOCK_THEN_SHAFT));
    expect(pieces).toHaveLength(2);
    const [block, shaft] = pieces.map(vertices);
    const half = 0.5 * 0.8;
    expect(block).toHaveLength(8);
    for (const vertex of block!) {
      expect(Math.abs(vertex.x)).toBeCloseTo(half, 6);
      expect(Math.abs(vertex.z)).toBeCloseTo(half, 6);
    }
    expect(shaft).toHaveLength(32);
    for (const vertex of shaft!) expect(Math.hypot(vertex.x, vertex.z)).toBeCloseTo(half, 6);
  });

  it('gives each square face a quarter of the texture around, like a four-sided ring', () => {
    const [block] = column(curveEncode(BLOCK_THEN_SHAFT));
    const spans = block!.brush.faces.flatMap((face, index) => {
      const normal = block!.brush.planes[index]!.normal;
      if (Math.abs(normal.y) > 0.9) return [];
      const us = block!.brush
        .getFaceVertexIndices(face)
        .map((corner) => block!.getFaceSurface(index).uv.project(block!.brush.vertices[corner]!).u);
      return [Math.max(...us) - Math.min(...us)];
    });
    expect(spans).toHaveLength(4);
    for (const span of spans) expect(span).toBeCloseTo(0.25, 5);
  });

  it('builds every turnery preset into valid pieces inside the bounds', () => {
    for (const preset of CURVE_PRESETS_TURNERY) {
      const pieces = column(curveEncode(curvePresetBuild(preset)));
      expect(pieces.length, preset.id).toBeGreaterThan(0);
      for (const piece of pieces) {
        expect(SolidBrushValidator.validateGenerated(piece.brush).valid, preset.id).toBe(true);
        for (const vertex of vertices(piece)) {
          expect(Math.abs(vertex.x), preset.id).toBeLessThanOrEqual(0.5 + 1e-6);
          expect(Math.abs(vertex.z), preset.id).toBeLessThanOrEqual(0.5 + 1e-6);
        }
      }
      const squares = preset.square?.length ?? 0;
      if (squares > 0)
        expect(
          pieces.some((piece) => piece.brush.vertices.length === 8),
          preset.id,
        ).toBe(true);
    }
  });
});
