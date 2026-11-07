import { describe, expect, it } from 'vitest';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESET_COLUMN_CLASSIC, CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { curveConstrain } from '@/curve/model/curve_constrain.js';
import { curveEquals } from '@/curve/model/curve_model.js';

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
});
