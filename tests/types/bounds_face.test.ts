import { describe, it, expect } from 'vitest';
import { BoundsFace, BOUNDS_FACE_USERDATA_KEY } from '../../src/types/bounds_face.js';
import { TransformMode } from '../../src/types/transform_mode.js';

describe('BoundsFace enum', () => {
  it('should define six face values', () => {
    const values = Object.values(BoundsFace);
    expect(values).toHaveLength(6);
  });

  it('should expose a stable userdata key', () => {
    expect(BOUNDS_FACE_USERDATA_KEY).toBe('boundsFace');
  });
});

describe('TransformMode bounds', () => {
  it('should include bounds mode', () => {
    expect(TransformMode.BOUNDS).toBe('bounds');
  });
});
