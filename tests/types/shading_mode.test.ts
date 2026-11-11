import { describe, it, expect } from 'vitest';
import { ShadingMode } from '@/types/shading_mode.js';

describe('ShadingMode enum', () => {
  it('should have exactly 6 values', () => {
    const values = Object.values(ShadingMode).filter((v) => typeof v === 'string');
    expect(values).toHaveLength(6);
  });

  it('should contain SOLID with correct string value', () => {
    expect(ShadingMode.SOLID).toBe('Solid');
  });

  it('should contain WIREFRAME with correct string value', () => {
    expect(ShadingMode.WIREFRAME).toBe('Wireframe');
  });

  it('should contain FLAT with correct string value', () => {
    expect(ShadingMode.FLAT).toBe('Flat');
  });

  it('should contain WIREFRAME_OVERLAY with correct string value', () => {
    expect(ShadingMode.WIREFRAME_OVERLAY).toBe('Wireframe Overlay');
  });

  it('should contain CLAY and OVERLAP with correct string values', () => {
    expect(ShadingMode.CLAY).toBe('Clay');
    expect(ShadingMode.OVERLAP).toBe('Overlap');
  });
});
