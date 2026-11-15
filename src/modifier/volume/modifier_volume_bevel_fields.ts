import {
  MODIFIER_VOLUME_BEVEL_UV_ALIGNED,
  MODIFIER_VOLUME_BEVEL_UV_LARGEST,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
  MODIFIER_VOLUME_BEVEL_UV_MAJORITY,
  MODIFIER_VOLUME_BEVEL_UV_NEAREST,
  MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_X,
  MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Y,
  MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Z,
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_X,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Z,
  MODIFIER_VOLUME_BEVEL_UV_REVERSE,
  MODIFIER_VOLUME_BEVEL_UV_SMALLEST,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
  MODIFIER_VOLUME_BEVEL_UV_WINDING,
  MODIFIER_VOLUME_BEVEL_DEFAULT_ANGLE_DEGREES,
  MODIFIER_VOLUME_BEVEL_DEFAULT_DISTANCE,
  MODIFIER_VOLUME_BEVEL_DEFAULT_SEGMENTS,
  MODIFIER_VOLUME_BEVEL_MAX_SEGMENTS,
} from './modifier_volume_bevel_keys.js';

/** One labeled value of a bevel choice setting, with hover text. */
export interface ModifierBevelChoice {
  /** Stored value. */
  value: string;
  /** Visible label. */
  label: string;
  /** Hover text. */
  title?: string;
}

/**
 * Declarative description of one bevel setting: what the inspector shows and
 * MCP lists.
 */
export interface ModifierBevelField {
  /** Settings key of {@link ModifierBevelVolumeSettings}. */
  key: string;
  /** Visible row caption. */
  label: string;
  /** Value kind. */
  type: 'number' | 'choice' | 'texture';
  /** Hover text explaining the setting, with units. */
  title: string;
  /** Allowed values of a choice setting. */
  choices?: readonly ModifierBevelChoice[];
  /** Value used by new bevels. */
  default?: number | string;
  /** Inclusive numeric minimum. */
  min?: number;
  /** Inclusive numeric maximum. */
  max?: number;
  /** True for whole numbers. */
  integer?: boolean;
}

/** UV flow choices, in menu order. */
export const MODIFIER_BEVEL_UV_FLOW_CHOICES: readonly ModifierBevelChoice[] = [
  {
    value: MODIFIER_VOLUME_BEVEL_UV_WINDING,
    label: 'Winding',
    title:
      'Strips follow face order. A corner takes the wall that borders it most, and every piece of that corner stays on that wall.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_REVERSE,
    label: 'Reverse Winding',
    title:
      'Same corner rule as Winding. When two walls border a corner equally, the later face wins instead of the earlier one.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_LARGEST,
    label: 'Largest',
    title: 'The larger wall wins. The whole corner beside it takes that wall, not a mix of neighbors.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_SMALLEST,
    label: 'Smallest',
    title: 'The smaller wall wins. The whole corner beside it takes that wall.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_MAJORITY,
    label: 'Majority',
    title: 'Each new face follows the wall it shares the longest edge with. A corner still stays on one wall.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_NEAREST,
    label: 'Nearest',
    title:
      'Each new face follows the wall plane closest to its center. A corner uses that rule once for the whole corner.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_ALIGNED,
    label: 'Aligned',
    title:
      'Each new face follows the wall pointing most nearly the same way. A corner uses the wall closest to the corner direction.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
    label: '+Y',
    title: 'The wall facing world up wins. Its texture continues down the curves and across the whole corner.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Y,
    label: '-Y',
    title: 'The wall facing world down wins. Its texture continues onto the curves and the whole corner.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_POSITIVE_X,
    label: '+X',
    title: 'The wall facing world +X wins. Its texture continues onto the curves and the whole corner.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_X,
    label: '-X',
    title: 'The wall facing world -X wins. Its texture continues onto the curves and the whole corner.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Z,
    label: '+Z',
    title: 'The wall facing world +Z wins. Its texture continues onto the curves and the whole corner.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Z,
    label: '-Z',
    title: 'The wall facing world -Z wins. Its texture continues onto the curves and the whole corner.',
  },
];

/** UV layout choices, in menu order. */
export const MODIFIER_BEVEL_UV_LAYOUT_CHOICES: readonly ModifierBevelChoice[] = [
  {
    value: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
    label: 'Continue',
    title: 'Folds the parent texture across the bevel so the pattern keeps going around the cut.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
    label: 'Tile',
    title:
      'Repeats the texture in world units along the authored edge and across its whole profile. Use Continue to preserve the parent pattern at the cut.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
    label: 'Trim',
    title:
      'Fits one texture across the whole profile and repeats it along the authored edge in world units. Use Continue to preserve the parent pattern at the cut.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
    label: 'Stretch',
    title: 'Stretches one copy of the texture over the whole curve.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT,
    label: 'Project',
    title: 'Uses the parent face projection flat, without wrapping around the cut.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC,
    label: 'Cubic',
    title: 'Lays a world-unit grid across the whole curve so every segment shares one pattern.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
    label: 'Overhead',
    title:
      'Projects from above using X and Z in the selected Space. Local follows the brush; World stays fixed to the map.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT,
    label: 'Front',
    title:
      'Projects from the front using X and Y in the selected Space. Local follows the brush; World stays fixed to the map.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE,
    label: 'Side',
    title:
      'Projects from the side using Z and Y in the selected Space. Local follows the brush; World stays fixed to the map.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS,
    label: 'Axis',
    title: 'Projects from whichever of Overhead, Front, or Side is closest to each face normal.',
  },
];

/** Curve owner choices, in menu order. */
export const MODIFIER_BEVEL_UV_OWNER_CHOICES: readonly ModifierBevelChoice[] = [
  {
    value: MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
    label: 'Split',
    title: 'Each end of the curve keeps its wall. U follows the parent that owns that half.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
    label: 'Single',
    title: 'One parent owns the whole curve. U runs along the edge and V runs across it. Reverse picks the other wall.',
  },
];

/** UV rotation pivot choices, in menu order. */
export const MODIFIER_BEVEL_UV_PIVOT_CHOICES: readonly ModifierBevelChoice[] = [
  { value: MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR, label: 'Anchor', title: 'Rotates around the start of the curve.' },
  { value: MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER, label: 'Center', title: 'Rotates around the middle of the curve.' },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_PIVOT_TILE,
    label: 'Tile',
    title: 'Rotates around the middle of the texture tile.',
  },
];

/** UV space choices, in menu order. */
export const MODIFIER_BEVEL_UV_SPACE_CHOICES: readonly ModifierBevelChoice[] = [
  {
    value: MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
    label: 'Local',
    title: 'Follows the brush. Turning it keeps the texture put, and scale still changes world length.',
  },
  {
    value: MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
    label: 'World',
    title: 'Follows the map. Turning a brush turns these directions.',
  },
];

/**
 * Main bevel settings in inspector order; contextual options live in the option
 * fields.
 */
export const MODIFIER_BEVEL_SETTINGS_FIELDS: readonly ModifierBevelField[] = [
  {
    key: 'segments',
    label: 'Segments',
    type: 'number',
    title: 'Profile face count: 1 is a flat chamfer, more segments round the edge.',
    default: MODIFIER_VOLUME_BEVEL_DEFAULT_SEGMENTS,
    min: 1,
    max: MODIFIER_VOLUME_BEVEL_MAX_SEGMENTS,
    integer: true,
  },
  {
    key: 'distance',
    label: 'Distance',
    type: 'number',
    title: 'Bevel width in metres as Width Mode measures it, or a percentage in Percent mode.',
    default: MODIFIER_VOLUME_BEVEL_DEFAULT_DISTANCE,
    min: 0,
  },
  {
    key: 'angleDegrees',
    label: 'Max Angle',
    type: 'number',
    title: 'With Limit Method Angle, only edges whose faces meet more sharply than this many degrees are bevelled.',
    default: MODIFIER_VOLUME_BEVEL_DEFAULT_ANGLE_DEGREES,
    min: 0,
    max: 180,
  },
  {
    key: 'uvLayout',
    label: 'Layout',
    type: 'choice',
    title: 'How generated faces place the texture.',
    choices: MODIFIER_BEVEL_UV_LAYOUT_CHOICES,
  },
  {
    key: 'textureId',
    label: 'Texture',
    type: 'texture',
    title: 'Texture on the generated faces; empty inherits the parent face.',
    default: '',
  },
  {
    key: 'uvOwner',
    label: 'Owner',
    type: 'choice',
    title: 'Which wall owns a multi-segment curve.',
    choices: MODIFIER_BEVEL_UV_OWNER_CHOICES,
  },
  {
    key: 'uvFlow',
    label: 'UV',
    type: 'choice',
    title: 'Which authored wall the generated UVs follow.',
    choices: MODIFIER_BEVEL_UV_FLOW_CHOICES,
  },
  {
    key: 'uvSpace',
    label: 'Space',
    type: 'choice',
    title: 'Whether projections follow the brush or the map.',
    choices: MODIFIER_BEVEL_UV_SPACE_CHOICES,
  },
  {
    key: 'uvScaleU',
    label: 'U Scale',
    type: 'number',
    title: 'Metres of generated bevel covered by one texture tile along U.',
  },
  {
    key: 'uvScaleV',
    label: 'V Scale',
    type: 'number',
    title: 'Metres of generated bevel covered by one texture tile along V.',
  },
  { key: 'uvOffsetU', label: 'U Offset', type: 'number', title: 'Shift of the generated UVs along U, in metres.' },
  { key: 'uvOffsetV', label: 'V Offset', type: 'number', title: 'Shift of the generated UVs along V, in metres.' },
  { key: 'uvRotation', label: 'Rotation', type: 'number', title: 'Rotation of the generated UVs, in degrees.' },
  {
    key: 'uvPivot',
    label: 'Pivot',
    type: 'choice',
    title: 'Point the generated texture rotates around.',
    choices: MODIFIER_BEVEL_UV_PIVOT_CHOICES,
  },
];

/**
 * Finds a main bevel setting.
 *
 * @param key Settings key.
 * @returns Field.
 */
export function modifierBevelField(key: string): ModifierBevelField {
  const field = MODIFIER_BEVEL_SETTINGS_FIELDS.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`Unknown bevel setting ${key}`);
  return field;
}
