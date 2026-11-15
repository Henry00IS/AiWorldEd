import type { PhysicsShatterMaterial } from './physics_shatter_materials.js';
import type { PhysicsShatterMode, PhysicsShatterSettings } from './physics_shatter_types.js';
import type { PhysicsShatterRadialShape } from './physics_shatter_radial.js';

/** Inspector rows a preset can show; the rest stay hidden for that material. */
export type PhysicsShatterPatternRow =
  | 'mode'
  | 'crackSize'
  | 'cracks'
  | 'impactDetail'
  | 'radialSpokes'
  | 'thicknessAxis'
  | 'grainAxis'
  | 'grainStretch'
  | 'brickLength'
  | 'brickHeight'
  | 'mortarGap'
  | 'brickJitter';

/** How a material breaks. */
export interface PhysicsShatterMaterialPreset {
  /** Inspector label. */
  label: string;
  /** Tooltip of the preset, at most 120 characters. */
  title: string;
  /**
   * Pattern the preset sets, or null for 'custom', which keeps the raw rows.
   * `impactDetail` is null where the Impact Detail row is used. Every value is
   * fixed or taken from a row, so applying a preset twice changes nothing.
   */
  pattern: {
    mode: PhysicsShatterMode;
    cracks: '2d' | '3d';
    impactDetail: number | null;
  } | null;
  /** 'random' scatters cell sites; 'grid' lays them on a jittered grid. */
  sites: 'random' | 'grid';
  /** Lloyd relaxation rounds: 0 keeps cells irregular, 1 evens them out. */
  relaxRounds: number;
  /** Radial shape; null takes the glass shape with the Spokes row. */
  radial: PhysicsShatterRadialShape | null;
  /** Cell length along the grain over its width; null takes the row. */
  grainStretch: number | null;
  /** Pattern rows shown for the material, in field order. */
  rows: readonly PhysicsShatterPatternRow[];
}

/** Brick rows. */
const PHYSICS_SHATTER_BRICK_ROWS: readonly PhysicsShatterPatternRow[] = [
  'brickLength',
  'brickHeight',
  'mortarGap',
  'brickJitter',
];

/** Ceramic tile: a few long straight cracks and large plates. */
const PHYSICS_SHATTER_RADIAL_CERAMIC: PhysicsShatterRadialShape = {
  spokes: 6,
  growth: 2.2,
  maxWidth: 2,
  maxLength: 6,
  firstRing: 0.6,
};

/** Every preset by id. */
const PHYSICS_SHATTER_MATERIAL_PRESETS: Readonly<Record<PhysicsShatterMaterial, PhysicsShatterMaterialPreset>> = {
  glass: {
    label: 'Glass',
    title: 'Window glass: long radial shards and rings around the impact, cracked straight through the pane.',
    pattern: { mode: 'radial', cracks: '2d', impactDetail: null },
    sites: 'random',
    relaxRounds: 0,
    radial: null,
    grainStretch: 1,
    rows: ['crackSize', 'radialSpokes', 'thicknessAxis'],
  },
  temperedGlass: {
    label: 'Tempered Glass',
    title: 'Safety glass: crumbles into many small, even, cube-like bits over the whole pane instead of sharp shards.',
    pattern: { mode: 'glass', cracks: '2d', impactDetail: 0 },
    sites: 'grid',
    relaxRounds: 0,
    radial: null,
    grainStretch: 1,
    rows: ['crackSize', 'thicknessAxis'],
  },
  stone: {
    label: 'Stone',
    title: 'Natural stone: chunky angular blocks, a little longer along the bedding (Grain Axis).',
    pattern: { mode: 'glass', cracks: '3d', impactDetail: null },
    sites: 'random',
    relaxRounds: 1,
    radial: null,
    grainStretch: 1.5,
    rows: ['crackSize', 'impactDetail', 'grainAxis'],
  },
  concrete: {
    label: 'Concrete',
    title: 'Concrete: rough irregular chunks, crushed into fine rubble near the impact and coarser farther out.',
    pattern: { mode: 'glass', cracks: '3d', impactDetail: 0.9 },
    sites: 'random',
    relaxRounds: 0,
    radial: null,
    grainStretch: 1,
    rows: ['crackSize'],
  },
  wood: {
    label: 'Wood',
    title: 'Wood: long splinters along the grain, about four times as long as they are wide.',
    pattern: { mode: 'glass', cracks: '3d', impactDetail: 0 },
    sites: 'random',
    relaxRounds: 1,
    radial: null,
    grainStretch: 4,
    rows: ['crackSize', 'grainAxis'],
  },
  ceramic: {
    label: 'Ceramic (tile/porcelain)',
    title: 'Tiles and porcelain: a few long straight cracks from the impact that leave large plates.',
    pattern: { mode: 'radial', cracks: '2d', impactDetail: null },
    sites: 'random',
    relaxRounds: 0,
    radial: PHYSICS_SHATTER_RADIAL_CERAMIC,
    grainStretch: 1,
    rows: ['crackSize', 'thicknessAxis'],
  },
  plaster: {
    label: 'Plaster (gypsum/drywall)',
    title: 'Plaster and drywall: irregular slabs through the board, smaller near the impact.',
    pattern: { mode: 'glass', cracks: '2d', impactDetail: null },
    sites: 'random',
    relaxRounds: 0,
    radial: null,
    grainStretch: 1,
    rows: ['crackSize', 'impactDetail', 'thicknessAxis'],
  },
  brick: {
    label: 'Brick',
    title: 'Masonry: breaks along the mortar joints into whole bricks in a running bond.',
    pattern: { mode: 'bricks', cracks: '3d', impactDetail: null },
    sites: 'random',
    relaxRounds: 0,
    radial: null,
    grainStretch: 1,
    rows: PHYSICS_SHATTER_BRICK_ROWS,
  },
  custom: {
    label: 'Custom',
    title: 'Set the crack pattern yourself with the raw pattern rows.',
    pattern: null,
    sites: 'random',
    relaxRounds: 1,
    radial: null,
    grainStretch: null,
    rows: [],
  },
};

/**
 * Returns the preset of a material.
 *
 * @param material Material id.
 * @returns Preset.
 */
export function physicsShatterMaterialPreset(material: PhysicsShatterMaterial): PhysicsShatterMaterialPreset {
  return PHYSICS_SHATTER_MATERIAL_PRESETS[material];
}

/**
 * Returns the pattern rows a custom material shows for a pattern and crack
 * choice.
 *
 * @param mode Pattern.
 * @param cracks Cracks choice.
 * @returns Rows in field order.
 */
function physicsShatterCustomRows(mode: unknown, cracks: unknown): PhysicsShatterPatternRow[] {
  if (mode === 'bricks') return ['mode', ...PHYSICS_SHATTER_BRICK_ROWS];
  if (mode === 'radial') return ['mode', 'crackSize', 'radialSpokes', 'thicknessAxis'];
  const flat: PhysicsShatterPatternRow[] = cracks === '2d' ? ['thicknessAxis'] : [];
  return ['mode', 'crackSize', 'cracks', 'impactDetail', ...flat, 'grainAxis', 'grainStretch'];
}

/**
 * Returns whether a pattern row shows for the stored parameters.
 *
 * @param row Row key.
 * @param parameters Normalized parameters.
 * @returns True when the row is relevant to the material.
 */
export function physicsShatterRowShown(row: PhysicsShatterPatternRow, parameters: Record<string, unknown>): boolean {
  const material = parameters['material'];
  const preset = PHYSICS_SHATTER_MATERIAL_PRESETS[material as PhysicsShatterMaterial] as
    PhysicsShatterMaterialPreset | undefined;
  if (preset && preset.pattern) return preset.rows.includes(row);
  return physicsShatterCustomRows(parameters['mode'], parameters['cracks']).includes(row);
}

/**
 * Applies a material to settings read from the raw rows: outside 'custom' the
 * preset sets the pattern, crack direction, impact detail and grain stretch.
 * Applying it again changes nothing.
 *
 * @param settings Settings as the rows store them.
 * @returns Settings the fracture uses.
 */
export function physicsShatterMaterialApply(settings: PhysicsShatterSettings): PhysicsShatterSettings {
  const preset = PHYSICS_SHATTER_MATERIAL_PRESETS[settings.material];
  if (!preset.pattern) return settings;
  return {
    ...settings,
    mode: preset.pattern.mode,
    cracks: preset.pattern.cracks,
    impactDetail: preset.pattern.impactDetail ?? settings.impactDetail,
    grainStretch: preset.grainStretch ?? settings.grainStretch,
  };
}
