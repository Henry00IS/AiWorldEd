import { CURVE_PRESETS_FURNITURE_EXTENDED } from './curve_preset_furniture_extended.js';
import { CURVE_PRESETS_COLUMNS_EXTENDED } from './curve_preset_columns_extended.js';
import { CURVE_PRESETS_OBJECTS_EXTENDED } from './curve_preset_objects_extended.js';

/**
 * Grouped original profiles, with source terminology and modeling limits
 * documented in docs/column_profiles.md.
 */
export const CURVE_PRESETS_EXTENDED = [
  ...CURVE_PRESETS_FURNITURE_EXTENDED,
  ...CURVE_PRESETS_COLUMNS_EXTENDED,
  ...CURVE_PRESETS_OBJECTS_EXTENDED,
];
