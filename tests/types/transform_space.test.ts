import { describe, it, expect } from 'vitest';
import {
  TransformSpace,
  transformSpaceLabel
} from '../../src/types/transform_space.js';

/**
 * Unit tests for transform space enum helpers.
 */
describe('TransformSpace', () => {
  it('labels global and local spaces', () => {
    expect(transformSpaceLabel(TransformSpace.Global)).toBe('Global');
    expect(transformSpaceLabel(TransformSpace.Local)).toBe('Local');
  });
});
