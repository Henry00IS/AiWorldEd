import { describe, expect, it } from 'vitest';
import {
  CURVE_FILE_FORMAT,
  CURVE_FILE_MAX_BYTES,
  CURVE_FILE_VERSION,
  curveFileNameIs,
  curveFileNameOf,
  curveFileRead,
  curveFileWrite,
} from '@/curve/model/curve_file.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { curveEquals } from '@/curve/model/curve_model.js';

describe('curve files', () => {
  it('round-trips a curve and its name', () => {
    const preset = CURVE_PRESETS_ARCHITECTURE[3];
    if (!preset) throw new Error('Expected a preset');
    const curve = curvePresetBuild(preset);
    const result = curveFileRead(curveFileWrite(curve, 'My column'));
    if ('error' in result) throw new Error(result.error);
    expect(result.name).toBe('My column');
    expect(curveEquals(result.curve, curve)).toBe(true);
  });

  it('reports broken, foreign, newer and oversized files', () => {
    expect(curveFileRead('{')).toHaveProperty('error');
    expect(curveFileRead('{"format":"other"}')).toHaveProperty('error');
    const newer = JSON.stringify({ format: CURVE_FILE_FORMAT, version: CURVE_FILE_VERSION + 1, curve: {} });
    expect(curveFileRead(newer)).toHaveProperty('error');
    const empty = JSON.stringify({ format: CURVE_FILE_FORMAT, version: CURVE_FILE_VERSION, curve: null });
    expect(curveFileRead(empty)).toHaveProperty('error');
    expect(curveFileRead(' '.repeat(CURVE_FILE_MAX_BYTES + 1))).toHaveProperty('error');
  });

  it('names files safely with the curve extension', () => {
    const name = curveFileNameOf(' Doric / column?! ');
    expect(curveFileNameIs(name)).toBe(true);
    expect(name).not.toMatch(/[/?! ]/);
    expect(curveFileNameIs('stone.png')).toBe(false);
    expect(curveFileNameIs(curveFileNameOf(''))).toBe(true);
  });
});
