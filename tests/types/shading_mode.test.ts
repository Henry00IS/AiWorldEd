import { describe, it, expect } from 'vitest';
import { ShadingMode } from '../../src/types/shading_mode.js';

describe('ShadingMode enum', () => {
  it('should have exactly 4 values', () => {
    const values = Object.values(ShadingMode).filter(
      (v) => typeof v === 'string'
    );
    expect(values).toHaveLength(4);
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

  it('should have enum keys matching expected names', () => {
    expect(ShadingMode.SOLID).toBeDefined();
    expect(ShadingMode.WIREFRAME).toBeDefined();
    expect(ShadingMode.FLAT).toBeDefined();
    expect(ShadingMode.WIREFRAME_OVERLAY).toBeDefined();
  });
});
