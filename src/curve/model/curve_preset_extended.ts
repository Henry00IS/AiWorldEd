import { CURVE_PRESETS_FURNITURE_EXTENDED } from './curve_preset_furniture_extended.js';
import { CURVE_PRESETS_COLUMNS_EXTENDED } from './curve_preset_columns_extended.js';
import { CURVE_PRESETS_OBJECTS_EXTENDED } from './curve_preset_objects_extended.js';
import { CURVE_PRESETS_ROTATED_STACKS } from './curve_preset_rotated_stacks.js';
import { CURVE_PRESETS_PROPS_CONTAINERS } from './curve_preset_props_containers.js';
import { CURVE_PRESETS_PROPS_TOOLS } from './curve_preset_props_tools.js';
import { CURVE_PRESETS_STRUCTURES } from './curve_preset_structures.js';
import { CURVE_PRESETS_SIDED } from './curve_preset_sided.js';

/**
 * Grouped original profiles, with source terminology and modeling limits
 * documented in docs/column_profiles.md.
 */
export const CURVE_PRESETS_EXTENDED = [
  ...CURVE_PRESETS_FURNITURE_EXTENDED,
  ...CURVE_PRESETS_COLUMNS_EXTENDED,
  ...CURVE_PRESETS_OBJECTS_EXTENDED,
  ...CURVE_PRESETS_ROTATED_STACKS,
  ...CURVE_PRESETS_STRUCTURES,
  ...CURVE_PRESETS_SIDED,
  ...CURVE_PRESETS_PROPS_CONTAINERS,
  ...CURVE_PRESETS_PROPS_TOOLS,
];
