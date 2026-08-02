import { describe, expect, it } from 'vitest';
import { createDefaultMouseSettings, createDefaultViewSettings } from '@/settings/store/settings_defaults.js';
import {
  areMouseSettingsEqual,
  clampNumber,
  mergeMouseSettings,
  mergeViewSettings,
  sanitizeAnisotropyPreference,
  sanitizeBoolean,
  sanitizeTextureFilterMode,
  sanitizeTheme,
} from '@/settings/store/settings_value_sanitizers.js';

describe('settings_value_sanitizers', () => {
  it('clamps finite numbers into the inclusive range', () => {
    expect(clampNumber(5, 0, 10)).toBe(5);
    expect(clampNumber(-3, 0, 10)).toBe(0);
    expect(clampNumber(99, 0, 10)).toBe(10);
    expect(clampNumber(Number.NaN, 0, 10)).toBe(0);
  });

  it('accepts only known theme preferences', () => {
    expect(sanitizeTheme('dark', 'system')).toBe('dark');
    expect(sanitizeTheme('neon', 'system')).toBe('system');
  });

  it('merges mouse settings without mutating defaults', () => {
    const defaults = createDefaultMouseSettings();
    const originalLook = defaults.lookSensitivity;
    const merged = mergeMouseSettings(defaults, { lookSensitivity: originalLook + 1 });
    expect(merged.lookSensitivity).toBe(originalLook + 1);
    expect(defaults.lookSensitivity).toBe(originalLook);
    expect(areMouseSettingsEqual(defaults, defaults)).toBe(true);
    expect(areMouseSettingsEqual(defaults, merged)).toBe(false);
  });

  it('merges view settings JSON and falls back on invalid text', () => {
    const defaults = createDefaultViewSettings();
    const merged = mergeViewSettings(
      defaults,
      JSON.stringify({
        brightness: 150,
        cameraWidgetSizePx: 180,
        theme: 'light',
        textureFilterMode: 'point',
        anisotropyPreference: '4x',
      }),
    );
    expect(merged.brightness).toBe(150);
    expect(merged.cameraWidgetSizePx).toBe(180);
    expect(merged.theme).toBe('light');
    expect(merged.textureFilterMode).toBe('point');
    expect(merged.anisotropyPreference).toBe('4x');
    expect(mergeViewSettings(defaults, '{not-json')).toEqual(defaults);
  });

  it('clamps stored orientation widget sizes into the supported range', () => {
    const defaults = createDefaultViewSettings();
    expect(mergeViewSettings(defaults, JSON.stringify({ cameraWidgetSizePx: 12 })).cameraWidgetSizePx).toBe(48);
    expect(mergeViewSettings(defaults, JSON.stringify({ cameraWidgetSizePx: 400 })).cameraWidgetSizePx).toBe(192);
    expect(mergeViewSettings(defaults, JSON.stringify({ cameraWidgetSizePx: 'large' })).cameraWidgetSizePx).toBe(
      defaults.cameraWidgetSizePx,
    );
  });

  it('keeps default texture filter settings when stored values are invalid', () => {
    const defaults = createDefaultViewSettings();
    expect(defaults.textureFilterMode).toBe('trilinear');
    expect(defaults.anisotropyPreference).toBe('max');
    const merged = mergeViewSettings(
      defaults,
      JSON.stringify({ textureFilterMode: 'cubic', anisotropyPreference: '32x' }),
    );
    expect(merged.textureFilterMode).toBe('trilinear');
    expect(merged.anisotropyPreference).toBe('max');
  });

  it('sanitizes texture filter and anisotropy preferences', () => {
    expect(sanitizeTextureFilterMode('bilinear', 'trilinear')).toBe('bilinear');
    expect(sanitizeTextureFilterMode('nope', 'trilinear')).toBe('trilinear');
    expect(sanitizeAnisotropyPreference('16x', 'max')).toBe('16x');
    expect(sanitizeAnisotropyPreference('full', 'max')).toBe('max');
  });

  it('sanitizes booleans with a fallback', () => {
    expect(sanitizeBoolean(true, false)).toBe(true);
    expect(sanitizeBoolean('yes', false)).toBe(false);
  });
});
