import { describe, it, expect } from 'vitest';
import { SelectionMode } from '../../src/types/selection_mode.js';

describe('SelectionMode enum', () => {
  it('should have exactly 2 values', () => {
    const values = Object.values(SelectionMode).filter(
      (v) => typeof v === 'string'
    );
    expect(values).toHaveLength(2);
  });

  it('should contain OBJECT with correct string value', () => {
    expect(SelectionMode.OBJECT).toBe('Object');
  });

  it('should contain FACE with correct string value', () => {
    expect(SelectionMode.FACE).toBe('Face');
  });

  it('should have enum keys matching expected names', () => {
    expect(SelectionMode.OBJECT).toBeDefined();
    expect(SelectionMode.FACE).toBeDefined();
  });
});
