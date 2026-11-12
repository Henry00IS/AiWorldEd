import { describe, expect, it } from 'vitest';
import weirdData from '../../../../generator/revolve/fixtures/weird.json';
import { curveFromData, curveEncode } from '@/curve/model/curve_codec.js';
import { curveSegmentPropertySet } from '@/curve/model/curve_edit.js';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { CURVE_PRESETS_TURNERY } from '@/curve/model/curve_preset_turnery.js';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Builds Henry's stepped profile with the requested middle corner resolution.
 *
 * @param cornerSides Faces on each hexagon corner.
 * @param sides Round ring resolution.
 * @returns Compiled pieces and scene fixture.
 */
function weirdColumn(cornerSides: number, sides = '8') {
  const curve = curveFromData(weirdData.curve);
  if (!curve) throw new Error('Expected Weird.curve');
  const profile = curveEncode(curveSegmentPropertySet(curve, [2], 'cornerSides', cornerSides));
  const fixture = stackFixture([{ kind: 'column', parameters: { profile, sides } }], 3);
  return { ...fixture, pieces: fixture.compile().instances.slice(1) };
}

/**
 * Serializes geometry and mapped UVs without generated object identifiers.
 *
 * @param piece Generated brush instance.
 * @returns Deterministic geometry and surface data.
 */
function geometrySignature(piece: SolidBrushInstance | undefined) {
  if (!piece) throw new Error('Expected a generated piece');
  return piece.brush.faces.map((face, index) =>
    piece.brush.getFaceVertexIndices(face).map((corner) => {
      const point = piece.brush.vertices[corner];
      if (!point) throw new Error('Expected a face vertex');
      return { position: point.toArray(), uv: piece.getFaceSurface(index).uv.project(point) };
    }),
  );
}

/** Independent section resolutions must survive the actual modifier compile. */
describe('column ring isolation', () => {
  it.each(['8', '16', '32'])('keeps both Round brushes identical with Sides %s across all corner counts', (sides) => {
    const reference = weirdColumn(1, sides).pieces;
    expect(reference).toHaveLength(3);
    for (let corners = 1; corners <= 8; corners++) {
      const { pieces } = weirdColumn(corners, sides);
      expect(pieces).toHaveLength(3);
      expect(geometrySignature(pieces[0])).toEqual(geometrySignature(reference[0]));
      expect(geometrySignature(pieces[2])).toEqual(geometrySignature(reference[2]));
      expect(pieces.map((piece) => piece.brush.vertices.length)).toEqual([
        2 * Number(sides),
        2 * 6 * (corners + 1),
        2 * Number(sides),
      ]);
      for (const piece of pieces) expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
    }
  });

  it.each([1, 4])('renders the mismatched rings through CSG with %s corner sides', (cornerSides) => {
    const fixture = weirdColumn(cornerSides);
    fixture.source.mesh?.position.setX(5);
    fixture.refresh();
    const geometry = fixture.model.getResultMesh().geometry;
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
    expect([...geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true);
  });

  it.each([...CURVE_PRESETS_ARCHITECTURE, ...CURVE_PRESETS_TURNERY, ...CURVE_PRESETS_EXTENDED])(
    'builds valid independent rings for preset $id',
    (preset) => {
      const profile = curveEncode(curvePresetBuild(preset));
      const pieces = stackFixture([{ kind: 'column', parameters: { profile, sides: '16', aspect: 0.7 } }], 1)
        .compile()
        .instances.slice(1);
      expect(pieces.length).toBeGreaterThan(0);
      for (const piece of pieces) expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
    },
  );
});
