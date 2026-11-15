import { createDefaultMouseSettings } from '@/settings/store/settings_defaults.js';

/**
 * Sensitivity value at which look and pan keep their historical 1x scale. This
 * matches the default Mouse Look and Mouse Pan slider values.
 *
 * @returns Reference sensitivity used as a 1x multiplier.
 */
export function mouseNavigationReferenceSensitivity(): number {
  return createDefaultMouseSettings().lookSensitivity;
}

/**
 * Converts a 1–100 look or pan sensitivity slider into a scale factor. The
 * default slider value yields 1, so existing navigation speed is unchanged
 * until the user changes the setting.
 *
 * @param sensitivity Slider value from mouse settings.
 * @returns Multiplier applied to the historical look or pan scale.
 */
export function mouseNavigationSensitivityMultiplier(sensitivity: number): number {
  return sensitivity / mouseNavigationReferenceSensitivity();
}
