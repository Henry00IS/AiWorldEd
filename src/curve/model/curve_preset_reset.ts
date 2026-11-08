import { CURVE_MARKER_DEFAULT } from './curve_markers.js';
import type { CurvePreset } from './curve_preset.js';

/** Picker group of the reset presets. */
export const CURVE_PRESET_RESET_GROUP = 'New curve';

/**
 * Builds the preset of a flat curve at one value, used to start a new curve.
 *
 * @param value Height of the flat curve.
 * @returns Preset.
 */
function curvePresetResetCreate(value: number): CurvePreset {
  const text = value.toFixed(1);
  return {
    id: `reset_${text}`,
    label: `Reset to ${text}`,
    tooltip: `Starts a new curve: one flat line at ${text}.`,
    group: CURVE_PRESET_RESET_GROUP,
    start: value,
    steps: [['L', 1, value]],
    markers: { ...CURVE_MARKER_DEFAULT },
  };
}

/** Flat curves at 1.0, 0.5 and 0.0, offered first by every curve editor. */
export const CURVE_PRESETS_RESET: readonly CurvePreset[] = [1, 0.5, 0].map(curvePresetResetCreate);
