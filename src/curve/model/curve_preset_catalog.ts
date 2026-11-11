import type { CurvePreset } from './curve_preset.js';

/** One picker category: its Title Case name and its presets in display order. */
export interface CurvePresetCategory {
  /** Category name shown as the picker group. */
  group: string;
  /** Preset ids in the order they are offered. */
  ids: readonly string[];
}

/**
 * The column profile picker's categories, grouped by what the user is looking
 * for: architecture first, then furniture and turned work, then props. Within a
 * category presets go by family, then from simple to elaborate. Only ids are
 * listed, so names and curves stay with each preset and saved curves never
 * depend on this order.
 */
export const CURVE_PRESET_CATEGORIES: readonly CurvePresetCategory[] = [
  {
    group: 'Columns',
    ids: [
      'tuscan',
      'doric',
      'classic',
      'square_pedestal_column',
      'octagonal_pillar',
      'twisted_octagon_column',
      'solomonic_column',
    ],
  },
  { group: 'Column Shafts', ids: ['plain', 'tapered', 'tuscan_plain_shaft', 'doric_shaft', 'ionic_shaft'] },
  {
    group: 'Bases & Capitals',
    ids: ['tuscan_base', 'attic_base', 'ionic_base', 'doric_capital', 'corinthian_capital'],
  },
  {
    group: 'Piers & Buttresses',
    ids: ['bridge_pier', 'flared_pier', 'cruciform_pier', 'half_arch_springer', 'stepped_buttress'],
  },
  {
    group: 'Walls, Beams & Trim',
    ids: [
      'wall_pilaster',
      'chimney_breast',
      'gable_wall',
      'stepped_retaining_wall',
      'merlon',
      'chamfered_plinth',
      'keystone',
      'chamfered_beam',
      'haunched_beam',
    ],
  },
  { group: 'Brackets & Corbels', ids: ['shelf_bracket', 'console_bracket', 'stepped_corbel'] },
  { group: 'Towers & Monuments', ids: ['obelisk', 'diagonal_pinnacle', 'turning_tower', 'turning_floor_tower'] },
  {
    group: 'Furniture Legs & Feet',
    ids: [
      'table_leg',
      'softened_table_leg',
      'chair_leg',
      'shaker_taper_leg',
      'shaker_swell_leg',
      'jacobean_cup_cover',
      'ribbon_twist_leg',
      'chamfered_cabinet_foot',
    ],
  },
  {
    group: 'Posts & Newels',
    ids: [
      'bed_post',
      'softened_bedpost',
      'hexagonal_bedpost',
      'jacobean_twist_post',
      'victorian_newel',
      'octagonal_newel',
    ],
  },
  {
    group: 'Spindles & Balusters',
    ids: [
      'baluster',
      'ball_ring_baluster',
      'spindle',
      'pencil_spindle',
      'bamboo_spindle',
      'bobbin_spindle',
      'triangular_twist_spindle',
      'spool_stretcher',
      'clock_pillar',
    ],
  },
  { group: 'Finials & Ornaments', ids: ['acorn_finial', 'steeple_finial', 'faceted_finial', 'clock_finial', 'pawn'] },
  {
    group: 'Lighting',
    ids: [
      'candlestick',
      'trumpet_candlestick',
      'cove_bead_candlestick',
      'twisted_candle_stem',
      'table_lamp',
      'ogee_lamp_base',
      'vase_lamp_body',
      'pentagonal_lamp',
      'ceiling_lamp_fixture',
      'ceiling_lamp_with_bulb',
      'ceiling_fan_downrod',
    ],
  },
  {
    group: 'Bottles & Containers',
    ids: [
      'beer_bottle',
      'wine_bottle',
      'whiskey_bottle',
      'soda_bottle',
      'soda_can',
      'flower_pot',
      'wooden_cask',
      'oil_drum',
    ],
  },
  {
    group: 'Medical',
    ids: ['syringe', 'prescription_pill_bottle', 'supplement_bottle', 'apothecary_jar', 'capsule_pill'],
  },
  {
    group: 'Tools & Hardware',
    ids: ['flathead_screwdriver', 'phillips_screwdriver', 'flashlight', 'nail', 'tent_peg', 'flanged_water_pipe'],
  },
  { group: 'Blades & Paddles', ids: ['knife', 'chef_knife', 'sword', 'canoe_paddle'] },
  { group: 'Antennas', ids: ['antenna', 'telescopic_antenna', 'antenna_mount', 'antenna_arm'] },
  { group: 'Misc Props', ids: ['block_stack', 'stone_cairn', 'bar_of_soap', 'lollipop'] },
];

/**
 * Orders presets by category and gives each its category as picker group.
 * Presets no category lists keep their own group and follow at the end, so a
 * new preset is never lost.
 *
 * @param presets Presets in any order.
 * @returns Presets in picker order, grouped.
 */
export function curvePresetCatalog(presets: readonly CurvePreset[]): CurvePreset[] {
  const byId = new Map(presets.map((preset) => [preset.id, preset]));
  const listed = CURVE_PRESET_CATEGORIES.flatMap(({ group, ids }) =>
    ids.flatMap((id) => {
      const preset = byId.get(id);
      return preset ? [{ ...preset, group }] : [];
    }),
  );
  const known = new Set(listed.map((preset) => preset.id));
  return [...listed, ...presets.filter((preset) => !known.has(preset.id))];
}
