import { describe, expect, it, vi } from 'vitest';
import { CoordinatePresentationController } from '../../src/coordinates/coordinate_presentation_controller.js';
import { getBuiltInCoordinateSpace } from '../../src/settings/coordinate_space_presets.js';
import { createDefaultGameProfile } from '../../src/settings/settings_defaults.js';

describe('CoordinatePresentationController', () => {
  it('updates every target without mutating the supplied profile', () => {
    const first = { setCoordinateSpace: vi.fn() };
    const second = { setCoordinateSpace: vi.fn() };
    const profile = createDefaultGameProfile('presentation-profile', 'Presentation');
    profile.coordinateSpace = getBuiltInCoordinateSpace('blender')!;
    const source = JSON.stringify(profile);
    const controller = new CoordinatePresentationController([first, second]);
    controller.applyProfile(profile);
    expect(first.setCoordinateSpace).toHaveBeenCalledWith(expect.objectContaining({ presetId: 'blender' }));
    expect(second.setCoordinateSpace).toHaveBeenCalledOnce();
    expect(JSON.stringify(profile)).toBe(source);
  });

  it('uses identity editor presentation when no profile is active', () => {
    const target = { setCoordinateSpace: vi.fn() };
    const controller = new CoordinatePresentationController([target]);
    controller.applyProfile(null);
    expect(target.setCoordinateSpace).toHaveBeenCalledWith(expect.objectContaining({ presetId: 'godot' }));
  });
});
