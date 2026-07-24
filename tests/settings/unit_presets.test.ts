import { describe, it, expect } from 'vitest';
import {
  getUnitLabel,
  getUnitOptionsForSystem,
  IMPERIAL_UNIT_OPTIONS,
  METRIC_UNIT_OPTIONS
} from '../../src/settings/unit_presets.js';

describe('unit_presets', () => {
  it('should list metric length units', () => {
    expect(getUnitOptionsForSystem('metric')).toEqual([
      'millimeter',
      'centimeter',
      'meter',
      'kilometer'
    ]);
    expect(METRIC_UNIT_OPTIONS).toHaveLength(4);
  });

  it('should list imperial length units', () => {
    expect(getUnitOptionsForSystem('imperial')).toEqual([
      'inch',
      'foot',
      'yard',
      'mile'
    ]);
    expect(IMPERIAL_UNIT_OPTIONS).toHaveLength(4);
  });

  it('should provide human-readable unit labels', () => {
    expect(getUnitLabel('metric', 'millimeter')).toBe('Millimeter');
    expect(getUnitLabel('imperial', 'foot')).toBe('Foot');
  });
});
