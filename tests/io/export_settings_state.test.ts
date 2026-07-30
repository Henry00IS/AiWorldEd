import { describe, expect, it } from 'vitest';
import { EXPORT_CUSTOM_COORDINATE_SPACE_ID, ExportSettingsState } from '../../src/io/export_settings_state.js';
import { BUILT_IN_COORDINATE_SPACE_PRESETS } from '../../src/settings/coordinate_space_presets.js';
import { createDefaultGameProfile } from '../../src/settings/settings_defaults.js';

describe('ExportSettingsState', () => {
  it('creates independent one-export overrides without mutating source profiles', () => {
    const source = createDefaultGameProfile('profile-source', 'Source');
    const original = JSON.stringify(source);
    const state = new ExportSettingsState([source], [...BUILT_IN_COORDINATE_SPACE_PRESETS], source.id);
    state.selectCoordinatePreset('blender');
    state.setUnitSystem('imperial');
    state.setImperialUnit('foot');
    const result = state.buildExportProfile();
    expect(result.coordinateSpace.presetId).toBe('blender');
    expect(result.unitSystem).toBe('imperial');
    expect(result.imperialUnit).toBe('foot');
    expect(JSON.stringify(source)).toBe(original);
  });

  it('blocks a manual custom override until its axes form a basis', () => {
    const source = createDefaultGameProfile('profile-custom', 'Custom');
    const state = new ExportSettingsState([source], [...BUILT_IN_COORDINATE_SPACE_PRESETS], source.id);
    state.beginCustomOverride();
    expect(state.getDraft().coordinateSpace.presetId).toBe(EXPORT_CUSTOM_COORDINATE_SPACE_ID);
    state.setCustomAxis('up', '+x');
    expect(state.isValid()).toBe(false);
    expect(() => state.buildExportProfile()).toThrow();
    state.setCustomAxis('right', '+y');
    state.setCustomAxis('forward', '+z');
    expect(state.isValid()).toBe(true);
    expect(state.buildExportProfile().coordinateSpace.handedness).toBe('right');
  });
});
