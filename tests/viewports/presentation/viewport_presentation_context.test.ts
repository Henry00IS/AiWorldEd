import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getBuiltInCoordinateSpace } from '@/settings/coordinate/coordinate_space_presets.js';
import { ViewportPresentationContext } from '@/viewports/presentation/viewport_presentation_context.js';
import type { GameProfile } from '@/settings/store/settings_types.js';

/** Builds a profile using one of the repository's built-in coordinate spaces. */
function buildProfile(presetId: string, metricUnit: GameProfile['metricUnit'] = 'meter'): GameProfile {
  const coordinateSpace = getBuiltInCoordinateSpace(presetId);
  if (!coordinateSpace) throw new Error(`Unknown coordinate space: ${presetId}`);
  return {
    id: presetId,
    name: presetId,
    unitSystem: 'metric',
    metricUnit,
    imperialUnit: 'foot',
    coordinateSpace,
  };
}

describe('ViewportPresentationContext', () => {
  it('uses the editor basis when no game profile is active', () => {
    const context = new ViewportPresentationContext();

    expect(context.getEditorRight()).toEqual(new THREE.Vector3(1, 0, 0));
    expect(context.getEditorUp()).toEqual(new THREE.Vector3(0, 1, 0));
    expect(context.getEditorForward()).toEqual(new THREE.Vector3(0, 0, -1));
  });

  it('exposes semantic labels and unit scales for common engine profiles', () => {
    const expectations = [
      ['godot', '+X', '+Y', '-Z', 1, 'm'],
      ['unreal', '+Y', '+Z', '+X', 100, 'cm'],
      ['blender', '+X', '+Z', '+Y', 1000, 'mm'],
      ['unity', '+X', '+Y', '+Z', 1, 'm'],
    ] as const;

    expectations.forEach(([presetId, right, up, forward, scale, unitLabel]) => {
      const context = new ViewportPresentationContext(
        buildProfile(presetId, unitLabel === 'cm' ? 'centimeter' : unitLabel === 'mm' ? 'millimeter' : 'meter'),
      );
      expect(context.getAxisLabel('right')).toBe(right);
      expect(context.getAxisLabel('up')).toBe(up);
      expect(context.getAxisLabel('forward')).toBe(forward);
      expect(context.toProfileUnits(1)).toBe(scale);
      expect(context.getUnitLabel()).toBe(unitLabel);
    });
  });

  it('keeps physical camera distances while converting profile axes into editor space', () => {
    const context = new ViewportPresentationContext(buildProfile('unreal', 'centimeter'));
    const top = context.getOrthographicCameraPosition('top', 50);
    const perspective = context.getPerspectiveCameraPosition();

    expect(top.distanceTo(new THREE.Vector3(0, 50, 0))).toBeCloseTo(0);
    expect(perspective.length()).toBeCloseTo(2 * Math.sqrt(3));
    expect(context.fromProfileUnits(context.toProfileUnits(2.5))).toBeCloseTo(2.5);
  });

  it('updates all derived basis values when a profile changes', () => {
    const context = new ViewportPresentationContext(buildProfile('godot'));
    const initialOrientation = context.getGridOrientation();
    context.setProfile(buildProfile('blender', 'millimeter'));

    expect(context.getAxisLabel('up')).toBe('+Z');
    expect(context.getUnitLabel()).toBe('mm');
    expect(context.getGridOrientation().equals(initialOrientation)).toBe(true);
  });
});
