import type { PhysicsShatterMaterial } from './physics_shatter_materials.js';
import type { PhysicsShatterSettings } from './physics_shatter_types.js';
import {
  physicsShatterPatternSpec,
  type PhysicsShatterPatternId,
  type PhysicsShatterPatternRow,
} from './physics_shatter_patterns.js';

export type { PhysicsShatterPatternRow } from './physics_shatter_patterns.js';

/** How a material breaks. */
export interface PhysicsShatterMaterialPreset {
  /** Inspector label. */
  label: string;
  /** Tooltip of the preset, at most 120 characters. */
  title: string;
  /**
   * Pattern the preset uses, or null for 'custom', which takes the Pattern row.
   * A preset is exactly its pattern: Custom with the same pattern and rows
   * makes the same pieces.
   */
  pattern: PhysicsShatterPatternId | null;
}

/** Every preset by id. */
const PHYSICS_SHATTER_MATERIAL_PRESETS: Readonly<Record<PhysicsShatterMaterial, PhysicsShatterMaterialPreset>> = {
  glass: {
    label: 'Glass',
    title: 'Window glass: long radial shards and rings around the impact, cracked straight through the pane.',
    pattern: 'radial',
  },
  temperedGlass: {
    label: 'Tempered Glass',
    title: 'Safety glass: crumbles into many small, even, cube-like bits over the whole pane instead of sharp shards.',
    pattern: 'dice',
  },
  stone: {
    label: 'Stone',
    title: 'Natural stone: chunky angular blocks, a little longer along the bedding (Grain Axis).',
    pattern: 'blocks',
  },
  concrete: {
    label: 'Concrete',
    title: 'Concrete: rough irregular chunks, crushed into fine rubble near the impact and coarser farther out.',
    pattern: 'clustered',
  },
  wood: {
    label: 'Wood',
    title: 'Wood: long splinters along the grain, about four times as long as they are wide.',
    pattern: 'splinters',
  },
  ceramic: {
    label: 'Ceramic (tile/porcelain)',
    title: 'Tiles and porcelain: a few long straight cracks from the impact that leave large plates.',
    pattern: 'tile',
  },
  plaster: {
    label: 'Plaster (gypsum/drywall)',
    title: 'Plaster and drywall: irregular slabs through the board, smaller near the impact.',
    pattern: 'plates',
  },
  brick: {
    label: 'Brick',
    title: 'Masonry: breaks along the mortar joints into whole bricks in a running bond.',
    pattern: 'bricks',
  },
  custom: {
    label: 'Custom',
    title: 'Pick any pattern yourself, including those of the other materials, with all of its rows.',
    pattern: null,
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
 * Returns the pattern the stored parameters break with: the material's, or the
 * Pattern row for Custom.
 *
 * @param parameters Normalized parameters.
 * @returns Pattern id.
 */
function physicsShatterPatternOf(parameters: Record<string, unknown>): string {
  const preset = PHYSICS_SHATTER_MATERIAL_PRESETS[parameters['material'] as PhysicsShatterMaterial] as
    PhysicsShatterMaterialPreset | undefined;
  return preset?.pattern ?? String(parameters['mode']);
}

/**
 * Returns whether a pattern row shows for the stored parameters: none while
 * Shatter is off, else the rows of the pattern in use, the Pattern row only for
 * Custom, and Thickness Axis only when the cracks run in 2D.
 *
 * @param row Row key.
 * @param parameters Normalized parameters.
 * @returns True when the row is relevant.
 */
export function physicsShatterRowShown(row: PhysicsShatterPatternRow, parameters: Record<string, unknown>): boolean {
  if (!physicsShatterShattering(parameters)) return false;
  const custom = !PHYSICS_SHATTER_MATERIAL_PRESETS[parameters['material'] as PhysicsShatterMaterial]?.pattern;
  if (row === 'mode') return custom;
  const spec = physicsShatterPatternSpec(physicsShatterPatternOf(parameters));
  if (!spec.rows.includes(row)) return false;
  if (row === 'thicknessAxis' && spec.cracks === 'row') return parameters['cracks'] === '2d';
  return true;
}

/**
 * Returns whether the stored parameters break the inputs: Shatter is on unless
 * it is stored as false.
 *
 * @param parameters Normalized parameters.
 * @returns True while Shatter is on.
 */
export function physicsShatterShattering(parameters: Record<string, unknown>): boolean {
  return parameters['shatter'] !== false;
}

/**
 * Applies the material and its pattern to settings read from the raw rows: a
 * preset sets the pattern, and the pattern fixes the crack direction, impact
 * detail and grain stretch it does not take from rows. Applying it again
 * changes nothing.
 *
 * @param settings Settings as the rows store them.
 * @returns Settings the fracture uses.
 */
export function physicsShatterMaterialApply(settings: PhysicsShatterSettings): PhysicsShatterSettings {
  const mode = PHYSICS_SHATTER_MATERIAL_PRESETS[settings.material].pattern ?? settings.mode;
  const spec = physicsShatterPatternSpec(mode);
  return {
    ...settings,
    mode,
    cracks: spec.cracks === 'row' ? settings.cracks : spec.cracks,
    impactDetail: spec.impactDetail ?? settings.impactDetail,
    grainStretch: spec.grainStretch ?? settings.grainStretch,
  };
}
