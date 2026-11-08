import { describe, expect, it } from 'vitest';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESET_COLUMN_CLASSIC, CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { curveConstrain } from '@/curve/model/curve_constrain.js';
import { curveEquals } from '@/curve/model/curve_model.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { CURVE_PRESETS_RESET } from '@/curve/model/curve_preset_reset.js';
import type { CurvePreset } from '@/curve/model/curve_preset.js';

/**
 * Returns every preset the column profile offers, after the reset presets.
 *
 * @returns Presets.
 */
function columnPresets(): readonly CurvePreset[] {
  const field = modifierStackKindFind('column')?.fields.find((candidate) => candidate.key === 'profile');
  return [...CURVE_PRESETS_RESET, ...(field?.curvePresets ?? [])];
}

describe('curve presets', () => {
  it('builds valid curves with unique ids', () => {
    const ids = new Set(CURVE_PRESETS_ARCHITECTURE.map((preset) => preset.id));
    expect(ids.size).toBe(CURVE_PRESETS_ARCHITECTURE.length);
    for (const preset of CURVE_PRESETS_ARCHITECTURE) {
      const curve = curvePresetBuild(preset);
      expect(curveEquals(curveConstrain(curve), curve)).toBe(true);
      expect(curve.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('includes the classic column with its steps', () => {
    const curve = curvePresetBuild(CURVE_PRESET_COLUMN_CLASSIC);
    const steps = curve.points.filter((point, index) => point.x === curve.points[index + 1]?.x);
    expect(steps).toHaveLength(2);
  });

  it('names every preset plainly and explains it with a short tooltip', () => {
    const presets = columnPresets();
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(presets.length);
    expect(new Set(presets.map((preset) => preset.label)).size).toBe(presets.length);
    for (const preset of presets) {
      expect(preset.label).not.toMatch(/study|studies|approx|inspired|\(/i);
      expect(preset.tooltip.length).toBeGreaterThan(20);
      expect(preset.tooltip.length).toBeLessThan(260);
      expect(preset.tooltip).toMatch(/\.$/);
    }
  });

  it('stores ordered base and top marker places for every preset, switched off', () => {
    for (const preset of columnPresets()) {
      expect(preset.markers.bottom).toBeGreaterThan(0);
      expect(preset.markers.top).toBeLessThan(1);
      expect(preset.markers.top - preset.markers.bottom).toBeGreaterThan(0.05);
      const markers = curvePresetBuild(preset).markers;
      expect(markers?.bottom).toBeUndefined();
      expect(markers?.top).toBeUndefined();
      expect(markers?.parked).toEqual(preset.markers);
    }
  });
});
