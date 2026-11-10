import { describe, expect, it } from 'vitest';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Every original extended preset must compile to valid, bounded convex pieces
 * and preserve all section fields.
 */
describe('extended lathe profile library', () => {
  it('provides more than twenty distinct original profiles', () => {
    expect(CURVE_PRESETS_EXTENDED.length).toBeGreaterThanOrEqual(20);
    expect(new Set(CURVE_PRESETS_EXTENDED.map((preset) => preset.id)).size).toBe(CURVE_PRESETS_EXTENDED.length);
  });
  it.each(CURVE_PRESETS_EXTENDED)('$label remains valid, bounded and serializable', (preset) => {
    const curve = curvePresetBuild(preset);
    const encoded = curveEncode(curve);
    const decoded = curveDecode(encoded);
    if (!decoded) throw new Error('Expected a decodable preset');
    expect(curveEncode(decoded)).toBe(encoded);
    const pieces = stackFixture([{ kind: 'column', parameters: { profile: encoded, sides: '16', aspect: 1.3 } }], 1)
      .compile()
      .instances.slice(1);
    expect(pieces.length, preset.id).toBeGreaterThan(0);
    for (const piece of pieces) {
      expect(SolidBrushValidator.validateGenerated(piece.brush).valid, preset.id).toBe(true);
      const matrix = piece.getLocalMatrix();
      for (const point of piece.brush.vertices) {
        const vertex = point.clone().applyMatrix4(matrix);
        expect(Math.abs(vertex.x), preset.id).toBeLessThanOrEqual(0.5 + 1e-4);
        expect(Math.abs(vertex.z), preset.id).toBeLessThanOrEqual(0.5 + 1e-4);
      }
    }
  });
});
