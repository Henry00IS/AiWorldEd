import { describe, expect, it } from 'vitest';
import { curveCanonical, curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { curveEquals } from '@/curve/model/curve_model.js';

describe('curve codec', () => {
  it('round-trips every preset', () => {
    for (const preset of CURVE_PRESETS_ARCHITECTURE) {
      const curve = curvePresetBuild(preset);
      const decoded = curveDecode(curveEncode(curve));
      if (!decoded) throw new Error(`Expected ${preset.id} to decode`);
      expect(curveEquals(decoded, curve)).toBe(true);
    }
  });

  it('canonicalizes valid text and rejects anything else', () => {
    const text = curveEncode(
      curvePresetBuild(CURVE_PRESETS_ARCHITECTURE[0] ?? { id: '', label: '', start: 1, steps: [] }),
    );
    expect(curveCanonical(text)).toBe(text);
    expect(curveCanonical(` ${text} `)).toBe(text);
    expect(curveCanonical('')).toBe('');
    expect(curveCanonical('{"points":5}')).toBe('');
    expect(curveCanonical(42)).toBe('');
  });
});
