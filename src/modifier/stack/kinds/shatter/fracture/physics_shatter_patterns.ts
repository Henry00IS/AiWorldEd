import type { PhysicsShatterRadialShape } from './physics_shatter_radial.js';

/**
 * Fracture patterns, the values of the Pattern row, in inspector order. Every
 * material preset uses one of them, and Custom offers them all.
 */
export const PHYSICS_SHATTER_PATTERNS = [
  'glass',
  'radial',
  'dice',
  'blocks',
  'clustered',
  'splinters',
  'tile',
  'plates',
  'bricks',
] as const;

/** One fracture pattern id. 'glass' is the uniform Random Cells pattern. */
export type PhysicsShatterPatternId = (typeof PHYSICS_SHATTER_PATTERNS)[number];

/** Inspector rows a pattern can use. */
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

/** How a pattern places its cracks. */
export interface PhysicsShatterPatternSpec {
  /** Inspector label. */
  label: string;
  /** Tooltip, at most 120 characters. */
  title: string;
  /**
   * 'cells' random Voronoi, 'grid' jittered grid, 'radial' shards, 'bricks' a
   * bond.
   */
  sites: 'cells' | 'grid' | 'radial' | 'bricks';
  /** Crack direction: fixed, or 'row' to follow the Cracks row. */
  cracks: '2d' | '3d' | 'row';
  /** Impact Detail used, or null to follow the row. */
  impactDetail: number | null;
  /** Grain stretch used, or null to follow the row. */
  grainStretch: number | null;
  /** Lloyd relaxation rounds: 0 keeps cells irregular, 1 evens them out. */
  relaxRounds: number;
  /** Radial shape; null takes the glass shape with the Spokes row. */
  radial: PhysicsShatterRadialShape | null;
  /**
   * Rows the pattern reads, in field order; 'thicknessAxis' only shows for 2D
   * cracks.
   */
  rows: readonly PhysicsShatterPatternRow[];
}

/** Ceramic tile: a few long straight cracks and large plates. */
const PHYSICS_SHATTER_RADIAL_TILE: PhysicsShatterRadialShape = {
  spokes: 6,
  growth: 2.2,
  maxWidth: 2,
  maxLength: 6,
  firstRing: 0.6,
};

/** Every pattern by id. */
const PHYSICS_SHATTER_PATTERN_SPECS: Readonly<Record<PhysicsShatterPatternId, PhysicsShatterPatternSpec>> = {
  glass: {
    label: 'Random Cells',
    title: 'Uniform Voronoi cells, 2D or 3D, optionally gathered at the impact and stretched along a grain.',
    sites: 'cells',
    cracks: 'row',
    impactDetail: null,
    grainStretch: null,
    relaxRounds: 1,
    radial: null,
    rows: ['crackSize', 'cracks', 'impactDetail', 'thicknessAxis', 'grainAxis', 'grainStretch'],
  },
  radial: {
    label: 'Radial Shards',
    title: 'Glass: long shards and rings around the impact, cracked straight through the pane.',
    sites: 'radial',
    cracks: '2d',
    impactDetail: null,
    grainStretch: 1,
    relaxRounds: 0,
    radial: null,
    rows: ['crackSize', 'radialSpokes', 'thicknessAxis'],
  },
  dice: {
    label: 'Cubic Dice',
    title: 'Tempered glass: small, even, cube-like bits on a jittered grid over the whole pane.',
    sites: 'grid',
    cracks: '2d',
    impactDetail: 0,
    grainStretch: 1,
    relaxRounds: 0,
    radial: null,
    rows: ['crackSize', 'thicknessAxis'],
  },
  blocks: {
    label: 'Stone Blocks',
    title: 'Stone: even, chunky 3D blocks, 1.5 times longer along the bedding (Grain Axis).',
    sites: 'cells',
    cracks: '3d',
    impactDetail: null,
    grainStretch: 1.5,
    relaxRounds: 1,
    radial: null,
    rows: ['crackSize', 'impactDetail', 'grainAxis'],
  },
  clustered: {
    label: 'Clustered Chunks',
    title: 'Concrete: irregular 3D chunks, crushed into fine rubble near the impact and coarser farther out.',
    sites: 'cells',
    cracks: '3d',
    impactDetail: 0.9,
    grainStretch: 1,
    relaxRounds: 0,
    radial: null,
    rows: ['crackSize'],
  },
  splinters: {
    label: 'Grain Splinters',
    title: 'Wood: 3D splinters four times longer along the grain than across it.',
    sites: 'cells',
    cracks: '3d',
    impactDetail: 0,
    grainStretch: 4,
    relaxRounds: 1,
    radial: null,
    rows: ['crackSize', 'grainAxis'],
  },
  tile: {
    label: 'Tile Plates',
    title: 'Ceramic: a few long straight cracks from the impact, through the tile, leaving large plates.',
    sites: 'radial',
    cracks: '2d',
    impactDetail: null,
    grainStretch: 1,
    relaxRounds: 0,
    radial: PHYSICS_SHATTER_RADIAL_TILE,
    rows: ['crackSize', 'thicknessAxis'],
  },
  plates: {
    label: 'Plaster Plates',
    title: 'Plaster: irregular slabs through the board, smaller near the impact.',
    sites: 'cells',
    cracks: '2d',
    impactDetail: null,
    grainStretch: 1,
    relaxRounds: 0,
    radial: null,
    rows: ['crackSize', 'impactDetail', 'thicknessAxis'],
  },
  bricks: {
    label: 'Bricks',
    title: 'Masonry: whole bricks in a running bond, split along the mortar joints.',
    sites: 'bricks',
    cracks: '3d',
    impactDetail: null,
    grainStretch: 1,
    relaxRounds: 0,
    radial: null,
    rows: ['brickLength', 'brickHeight', 'mortarGap', 'brickJitter'],
  },
};

/**
 * Returns the spec of a pattern; an unknown id reads as Random Cells.
 *
 * @param pattern Pattern id.
 * @returns Spec.
 */
export function physicsShatterPatternSpec(pattern: string): PhysicsShatterPatternSpec {
  return PHYSICS_SHATTER_PATTERN_SPECS[pattern as PhysicsShatterPatternId] ?? PHYSICS_SHATTER_PATTERN_SPECS.glass;
}
