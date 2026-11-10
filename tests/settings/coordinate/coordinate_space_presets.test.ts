import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_COORDINATE_SPACE_PRESETS,
  getBuiltInCoordinateSpace,
} from '@/settings/coordinate/coordinate_space_presets.js';

describe('coordinate_space_presets', () => {
  it('should define Blender Unity Godot and Unreal built-in presets', () => {
    const ids = BUILT_IN_COORDINATE_SPACE_PRESETS.map((space) => space.presetId);
    expect(ids).toEqual(['blender', 'unity', 'godot', 'unreal']);
  });

  it('should match documented Blender axes', () => {
    const blender = getBuiltInCoordinateSpace('blender')!;
    expect(blender.up).toBe('+z');
    expect(blender.right).toBe('-x');
    expect(blender.forward).toBe('-y');
  });

  it('should match documented Unity axes', () => {
    const unity = getBuiltInCoordinateSpace('unity')!;
    expect(unity.up).toBe('+y');
    expect(unity.right).toBe('+x');
    expect(unity.forward).toBe('+z');
  });

  it('should match documented Godot axes', () => {
    const godot = getBuiltInCoordinateSpace('godot')!;
    expect(godot.up).toBe('+y');
    expect(godot.right).toBe('-x');
    expect(godot.forward).toBe('+z');
  });

  it('should match documented Unreal Engine axes', () => {
    const unreal = getBuiltInCoordinateSpace('unreal')!;
    expect(unreal.up).toBe('+z');
    expect(unreal.right).toBe('+y');
    expect(unreal.forward).toBe('+x');
  });

  it('returns an independent copy and null for unknown ids', () => {
    const godot = getBuiltInCoordinateSpace('godot')!;
    godot.up = '+z';
    expect(getBuiltInCoordinateSpace('godot')!.up).toBe('+y');
    expect(getBuiltInCoordinateSpace('custom')).toBeNull();
  });
});
