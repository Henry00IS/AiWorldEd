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

  it('stores ordered marker places for every preset, on with fixed heights only for presets with a height', () => {
    for (const preset of columnPresets()) {
      expect(preset.markers.bottom).toBeGreaterThan(0);
      expect(preset.markers.top).toBeLessThan(1);
      expect(preset.markers.top - preset.markers.bottom).toBeGreaterThan(0.05);
      const markers = curvePresetBuild(preset).markers;
      if (preset.height === undefined) expect(markers).toEqual({ parked: preset.markers });
      else {
        expect(markers).toMatchObject(preset.markers);
        expect(markers?.heights?.bottom).toBeCloseTo(preset.markers.bottom * preset.height, 3);
        expect(markers?.heights?.top).toBeCloseTo((1 - preset.markers.top) * preset.height, 3);
      }
    }
  });

  it('starts columns and posts with Base and Top on, and props that scale as a whole with both off', () => {
    const on = (id: string) => columnPresets().find((preset) => preset.id === id)?.height !== undefined;
    expect(['classic', 'table_leg', 'victorian_newel', 'flared_pier', 'haunched_beam'].every(on)).toBe(true);
    expect(['wooden_cask', 'oil_drum', 'wine_bottle', 'knife', 'gable_wall', 'acorn_finial'].some(on)).toBe(false);
  });
});
