import { describe, expect, it } from 'vitest';
import { CURVE_PRESETS_ROTATED_STACKS } from '@/curve/model/curve_preset_rotated_stacks.js';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import { stackFixture } from '../../modifier/stack/modifier_stack_fixture.js';

/** Presets whose blocks are turned by per-segment rotation. */
describe('rotated stack presets', () => {
  it('are offered by the column with distinct ids', () => {
    const ids = new Set(CURVE_PRESETS_EXTENDED.map((preset) => preset.id));
    for (const preset of CURVE_PRESETS_ROTATED_STACKS) expect(ids.has(preset.id)).toBe(true);
  });

  it.each(CURVE_PRESETS_ROTATED_STACKS)('$label turns its blocks by rotation on the 0.01 grid', (preset) => {
    const curve = curvePresetBuild(preset);
    const rotations = new Set(curve.segments.map((segment) => segment.rotation ?? 0));
    expect(rotations.size).toBeGreaterThan(1);
    for (const point of curve.points) {
      expect(Math.abs(point.x * 100 - Math.round(point.x * 100))).toBeLessThan(1e-9);
      expect(Math.abs(point.y * 100 - Math.round(point.y * 100))).toBeLessThan(1e-9);
    }
  });

  it.each(CURVE_PRESETS_ROTATED_STACKS)('$label builds one brush run per differently turned block', (preset) => {
    const curve = curvePresetBuild(preset);
    const runs = generatorRevolveRuns(generatorRevolveStationsFromCurve(curve, 4, 1));
    const turned = curve.segments.filter((segment, index) => {
      const rises = (curve.points[index + 1]?.x ?? 0) > (curve.points[index]?.x ?? 0);
      return rises && segment.rotation && segment.rotation !== curve.segments[index - 1]?.rotation;
    });
    expect(runs.length).toBeGreaterThanOrEqual(turned.length);
    const pieces = stackFixture(
      [{ kind: 'column', parameters: { profile: curveEncode(curve), sides: '16', aspect: 0.6 } }],
      1,
    )
      .compile()
      .instances.slice(1);
    expect(pieces.length).toBeGreaterThanOrEqual(turned.length);
  });

  it('turns the last turning tower cube a quarter turn', () => {
    const tower = CURVE_PRESETS_ROTATED_STACKS.find((preset) => preset.id === 'turning_tower');
    if (!tower) throw new Error('Expected the turning tower');
    expect(curvePresetBuild(tower).segments.at(-1)?.rotation).toBe(90);
  });
});
