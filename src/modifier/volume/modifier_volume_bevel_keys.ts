/** UserData flag marking a bevel volume object. */
export const MODIFIER_VOLUME_BEVEL_USERDATA_KEY = 'isModifierVolume';

/** UserData number storing the chamfer distance in world units. */
export const MODIFIER_VOLUME_BEVEL_DISTANCE_KEY = 'modifierBevelDistance';

/** UserData integer storing how many faces approximate the round profile. */
export const MODIFIER_VOLUME_BEVEL_SEGMENTS_KEY = 'modifierBevelSegments';

/** UserData number storing the sharpness limit in degrees. */
export const MODIFIER_VOLUME_BEVEL_ANGLE_KEY = 'modifierBevelAngleDegrees';

/** UserData string storing which authored face generated UVs prefer. */
export const MODIFIER_VOLUME_BEVEL_UV_FLOW_KEY = 'modifierBevelUvFlow';

/** Strips follow face order. Corners follow the longest shared edge. */
export const MODIFIER_VOLUME_BEVEL_UV_WINDING = 'winding';

/**
 * Strips follow reversed face order. Corners use the longest border, then the
 * later face.
 */
export const MODIFIER_VOLUME_BEVEL_UV_REVERSE = 'winding-reversed';

/** Prefer the authored face with the greater world area. */
export const MODIFIER_VOLUME_BEVEL_UV_LARGEST = 'largest';

/** Prefer the authored face with the smaller world area. */
export const MODIFIER_VOLUME_BEVEL_UV_SMALLEST = 'smallest';

/** Prefer the wall that shares the longest border, including the whole corner. */
export const MODIFIER_VOLUME_BEVEL_UV_MAJORITY = 'majority';

/** Prefer the wall plane closest to each generated face. */
export const MODIFIER_VOLUME_BEVEL_UV_NEAREST = 'nearest';

/** Prefer the wall whose direction is closest to the generated face. */
export const MODIFIER_VOLUME_BEVEL_UV_ALIGNED = 'aligned';

/** Prefer the authored face whose world normal points along +Y. */
export const MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y = 'positive-y';

/** Prefer the authored face whose world normal points along -Y. */
export const MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Y = 'negative-y';

/** Prefer the authored face whose world normal points along +X. */
export const MODIFIER_VOLUME_BEVEL_UV_POSITIVE_X = 'positive-x';

/** Prefer the authored face whose world normal points along -X. */
export const MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_X = 'negative-x';

/** Prefer the authored face whose world normal points along +Z. */
export const MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Z = 'positive-z';

/** Prefer the authored face whose world normal points along -Z. */
export const MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Z = 'negative-z';

/** Ways a generated face chooses an authored parent. */
export type ModifierBevelUvFlow =
  | typeof MODIFIER_VOLUME_BEVEL_UV_WINDING
  | typeof MODIFIER_VOLUME_BEVEL_UV_REVERSE
  | typeof MODIFIER_VOLUME_BEVEL_UV_LARGEST
  | typeof MODIFIER_VOLUME_BEVEL_UV_SMALLEST
  | typeof MODIFIER_VOLUME_BEVEL_UV_MAJORITY
  | typeof MODIFIER_VOLUME_BEVEL_UV_NEAREST
  | typeof MODIFIER_VOLUME_BEVEL_UV_ALIGNED
  | typeof MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y
  | typeof MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Y
  | typeof MODIFIER_VOLUME_BEVEL_UV_POSITIVE_X
  | typeof MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_X
  | typeof MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Z
  | typeof MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Z;

const MODIFIER_BEVEL_UV_FLOWS: readonly ModifierBevelUvFlow[] = [
  MODIFIER_VOLUME_BEVEL_UV_WINDING,
  MODIFIER_VOLUME_BEVEL_UV_REVERSE,
  MODIFIER_VOLUME_BEVEL_UV_LARGEST,
  MODIFIER_VOLUME_BEVEL_UV_SMALLEST,
  MODIFIER_VOLUME_BEVEL_UV_MAJORITY,
  MODIFIER_VOLUME_BEVEL_UV_NEAREST,
  MODIFIER_VOLUME_BEVEL_UV_ALIGNED,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
  MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Y,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_X,
  MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_X,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Z,
  MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Z,
];

/**
 * Accepts a known UV flow.
 *
 * @param value Stored or requested flow.
 * @returns Winding when the value is not a known flow.
 */
export function modifierBevelClampUvFlow(value: unknown): ModifierBevelUvFlow {
  for (const mode of MODIFIER_BEVEL_UV_FLOWS) {
    if (value === mode) return mode;
  }
  return MODIFIER_VOLUME_BEVEL_UV_WINDING;
}

/** UserData string storing how generated faces place the texture. */
export const MODIFIER_VOLUME_BEVEL_UV_LAYOUT_KEY = 'modifierBevelUvLayout';

/** UserData string storing a texture used on generated faces. Empty inherits. */
export const MODIFIER_VOLUME_BEVEL_TEXTURE_KEY = 'modifierBevelTextureId';

/** Fold the parent texture across each generated face. */
export const MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE = 'continue';

/** Repeat the texture in world units along the curve and across it. */
export const MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE = 'tile';

/** Fit one texture across the whole curve and repeat it along the length. */
export const MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM = 'trim';

/** Stretch one copy of the texture over the whole curve. */
export const MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH = 'stretch';

/** Keep the parent face projection, without folding around the bevel. */
export const MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT = 'project';

/** Place a world-unit grid across the whole curve. */
export const MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC = 'cubic';

/** Project the texture from above using world X and Z. */
export const MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD = 'overhead';

/** Project the texture from the front using world X and Y. */
export const MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT = 'front';

/** Project the texture from the side using world Z and Y. */
export const MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE = 'side';

/** Project from whichever of overhead, front, or side is closest to the face. */
export const MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS = 'axis';

/** Ways a generated bevel face places its texture. */
export type ModifierBevelUvLayout =
  | typeof MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE
  | typeof MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE
  | typeof MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM
  | typeof MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH
  | typeof MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT
  | typeof MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC
  | typeof MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD
  | typeof MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT
  | typeof MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE
  | typeof MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS;

const MODIFIER_BEVEL_UV_LAYOUTS: readonly ModifierBevelUvLayout[] = [
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS,
];

/**
 * Accepts a known UV layout.
 *
 * @param value Stored or requested layout.
 * @returns Continue when the value is not a known layout.
 */
export function modifierBevelClampUvLayout(value: unknown): ModifierBevelUvLayout {
  for (const mode of MODIFIER_BEVEL_UV_LAYOUTS) {
    if (value === mode) return mode;
  }
  return MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE;
}

/** Each end of a curve keeps the wall it touches. */
export const MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT = 'split';

/** One authored face owns every segment of a curve. */
export const MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE = 'single';

/** Who owns the faces along one beveled edge. */
export type ModifierBevelUvOwner =
  typeof MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT | typeof MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE;

const MODIFIER_BEVEL_UV_OWNERS: readonly ModifierBevelUvOwner[] = [
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
];

/**
 * Accepts a known curve owner.
 *
 * @param value Stored or requested owner.
 * @returns Split when the value is not a known owner.
 */
export function modifierBevelClampUvOwner(value: unknown): ModifierBevelUvOwner {
  for (const mode of MODIFIER_BEVEL_UV_OWNERS) {
    if (value === mode) return mode;
  }
  return MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT;
}

/** Directions and projections follow the map. */
export const MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD = 'world';

/** Directions and projections follow the brush. */
export const MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL = 'local';

/** Whether generated UVs use map axes or brush axes. */
export type ModifierBevelUvSpace =
  typeof MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD | typeof MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL;

const MODIFIER_BEVEL_UV_SPACES: readonly ModifierBevelUvSpace[] = [
  MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
];

/**
 * Accepts a known UV space.
 *
 * @param value Stored or requested space.
 * @returns Local when the value is not a known space.
 */
export function modifierBevelClampUvSpace(value: unknown): ModifierBevelUvSpace {
  for (const mode of MODIFIER_BEVEL_UV_SPACES) {
    if (value === mode) return mode;
  }
  return MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL;
}

/** Spin the texture around the start of the curve. */
export const MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR = 'anchor';

/** Spin the texture around the middle of the curve. */
export const MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER = 'center';

/** Spin the texture around the middle of one tile. */
export const MODIFIER_VOLUME_BEVEL_UV_PIVOT_TILE = 'tile';

/** Point a generated texture rotates around. */
export type ModifierBevelUvPivot =
  | typeof MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR
  | typeof MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER
  | typeof MODIFIER_VOLUME_BEVEL_UV_PIVOT_TILE;

const MODIFIER_BEVEL_UV_PIVOTS: readonly ModifierBevelUvPivot[] = [
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_TILE,
];

/**
 * Accepts a known rotation pivot.
 *
 * @param value Stored or requested pivot.
 * @returns Anchor when the value is not a known pivot.
 */
export function modifierBevelClampUvPivot(value: unknown): ModifierBevelUvPivot {
  for (const mode of MODIFIER_BEVEL_UV_PIVOTS) {
    if (value === mode) return mode;
  }
  return MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR;
}

/** UserData flag marking the volume's outline, hidden from the outliner. */
export const MODIFIER_VOLUME_BEVEL_EDGE_KEY = 'isModifierVolumeEdge';

/** Default world-space chamfer distance for a new bevel volume. */
export const MODIFIER_VOLUME_BEVEL_DEFAULT_DISTANCE = 0.05;

/** One face: a flat chamfer. Higher counts follow a circular profile. */
export const MODIFIER_VOLUME_BEVEL_DEFAULT_SEGMENTS = 1;

/** Sharpest corner that still stays square, in degrees. Matches a 30° limit. */
export const MODIFIER_VOLUME_BEVEL_DEFAULT_ANGLE_DEGREES = 30;

/** Upper bound so one volume cannot emit an unbounded clip count. */
export const MODIFIER_VOLUME_BEVEL_MAX_SEGMENTS = 32;
