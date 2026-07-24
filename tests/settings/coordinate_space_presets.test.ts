import { describe, it, expect } from 'vitest';
import {
  areValidCoordinateAxes,
  BUILT_IN_COORDINATE_SPACE_PRESETS,
  deriveHandedness,
  formatCoordinateSpaceSummary,
  getBuiltInCoordinateSpace,
  parseCoordinateSpaceDefinition
} from '../../src/settings/coordinate_space_presets.js';

describe('coordinate_space_presets', () => {
  it('should define Blender Unity Godot and Unreal built-in presets', () => {
    const ids = BUILT_IN_COORDINATE_SPACE_PRESETS.map((space) => space.presetId);
    expect(ids).toEqual(['blender', 'unity', 'godot', 'unreal']);
  });

  it('should match documented Blender axes and handedness', () => {
    const blender = getBuiltInCoordinateSpace('blender')!;
    expect(blender.up).toBe('+z');
    expect(blender.right).toBe('+x');
    expect(blender.forward).toBe('+y');
    expect(blender.handedness).toBe('right');
    expect(deriveHandedness(blender.up, blender.right, blender.forward)).toBe(
      'right'
    );
  });

  it('should match documented Unity axes and handedness', () => {
    const unity = getBuiltInCoordinateSpace('unity')!;
    expect(unity.up).toBe('+y');
    expect(unity.right).toBe('+x');
    expect(unity.forward).toBe('+z');
    expect(unity.handedness).toBe('left');
    expect(deriveHandedness(unity.up, unity.right, unity.forward)).toBe('left');
  });

  it('should match documented Godot axes and handedness', () => {
    const godot = getBuiltInCoordinateSpace('godot')!;
    expect(godot.up).toBe('+y');
    expect(godot.right).toBe('+x');
    expect(godot.forward).toBe('-z');
    expect(godot.handedness).toBe('right');
  });

  it('should match documented Unreal Engine axes and handedness', () => {
    const unreal = getBuiltInCoordinateSpace('unreal')!;
    expect(unreal.up).toBe('+z');
    expect(unreal.right).toBe('+y');
    expect(unreal.forward).toBe('+x');
    expect(unreal.handedness).toBe('left');
  });

  it('should reject collinear axis combinations', () => {
    expect(areValidCoordinateAxes('+y', '+x', '+x')).toBe(false);
    expect(deriveHandedness('+y', '+x', '+x')).toBeNull();
  });

  it('should format a readable summary string', () => {
    const godot = getBuiltInCoordinateSpace('godot')!;
    expect(formatCoordinateSpaceSummary(godot)).toContain('Right-handed');
    expect(formatCoordinateSpaceSummary(godot)).toContain('Up +Y');
    expect(formatCoordinateSpaceSummary(godot)).toContain('Forward -Z');
  });

  it('should parse a valid custom coordinate space definition', () => {
    const space = parseCoordinateSpaceDefinition({
      presetId: 'custom-1',
      name: 'My Space',
      handedness: 'right',
      up: '+z',
      right: '+x',
      forward: '-y',
      isCustom: true
    });
    expect(space.name).toBe('My Space');
    expect(space.isCustom).toBe(true);
  });

  it('should derive handedness from axes when loaded metadata is stale', () => {
    const space = parseCoordinateSpaceDefinition({
      presetId: 'legacy-custom',
      name: 'Legacy Custom',
      handedness: 'left',
      up: '+y',
      right: '+x',
      forward: '-z',
      isCustom: true
    });
    expect(space.handedness).toBe('right');
  });
});
