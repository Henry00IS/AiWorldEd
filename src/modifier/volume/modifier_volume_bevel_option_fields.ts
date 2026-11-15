import type { ModifierBevelOptions } from './modifier_volume_bevel_options.js';
import type { ModifierBevelChoice } from './modifier_volume_bevel_fields.js';

/** One context-sensitive bevel option: what the inspector shows and MCP lists. */
export interface ModifierBevelOptionField {
  /** Stored option. */
  key: keyof ModifierBevelOptions;
  /** Visible row caption. */
  label: string;
  /** Accessible name. */
  aria: string;
  /** Applicability condition. */
  when: 'always' | 'round' | 'trim' | 'caps' | 'normals';
  /** Choice values, or absent for a numeric field. */
  choices?: readonly ModifierBevelChoice[];
  /** Numeric arrow step. */
  step?: number;
  /** Explanation including units and limitations. */
  title: string;
}

/** Edge selection control shown before the max angle. */
export const MODIFIER_BEVEL_OPTION_LIMIT_FIELDS: readonly ModifierBevelOptionField[] = [
  {
    key: 'limitMethod',
    label: 'Limit Method',
    aria: 'Bevel limit method',
    when: 'always',
    choices: [
      { value: 'angle', label: 'Angle' },
      { value: 'none', label: 'None' },
    ],
    title:
      'Angle bevels only edges whose faces meet more sharply than Max angle. None bevels every edge inside the volume that is not flat.',
  },
];

/** Convex geometry controls in the cut section. */
export const MODIFIER_BEVEL_OPTION_GEOMETRY_FIELDS: readonly ModifierBevelOptionField[] = [
  {
    key: 'widthMode',
    label: 'Width Mode',
    aria: 'Bevel width mode',
    when: 'always',
    choices: [
      { value: 'offset', label: 'Offset' },
      { value: 'width', label: 'Width' },
      { value: 'depth', label: 'Depth' },
      { value: 'percent', label: 'Percent' },
      { value: 'absolute', label: 'Absolute' },
    ],
    title:
      'Offset: distance along each wall, square to the edge. Width: contact-to-contact chord. Depth: perpendicular depth of the flat chamfer chord. Percent: percentage of the shortest adjacent face span. Absolute: distance along the side edges that leave the bevelled edge; slanted sides use their mean so the cut stays flat and convex. Lengths are world meters.',
  },
  {
    key: 'clampOverlap',
    label: 'Clamp Overlap',
    aria: 'Bevel clamp overlap',
    when: 'always',
    choices: [
      { value: 'off', label: 'Off' },
      { value: 'on', label: 'On' },
    ],
    title:
      'Conservatively limits each offset to 49% of the shortest adjacent face span. Works across volumes; may stop before the maximum possible width. Empty-solid clipping is always guarded.',
  },
  {
    key: 'profile',
    label: 'Profile',
    aria: 'Bevel profile',
    when: 'round',
    step: 0.025,
    title:
      'Convex-only shape: 0.25 is a straight chamfer; 0.5 is round. Intermediate values blend the chord and circular arc. Concave/cove profiles are not supported.',
  },
  {
    key: 'normals',
    label: 'Strip Normals',
    aria: 'Bevel strip normals',
    when: 'normals',
    choices: [
      { value: 'flat', label: 'Flat' },
      { value: 'smooth', label: 'Smooth' },
    ],
    title:
      'Smooth blends strip normals across segment and UV seams, matches authored walls at contacts, and keeps cap creases. Geometry stays convex; authored walls remain flat.',
  },
];

/** Trim-specific chart controls. */
export const MODIFIER_BEVEL_OPTION_TRIM_FIELDS: readonly ModifierBevelOptionField[] = [
  {
    key: 'trimSeam',
    label: 'Trim Seam',
    aria: 'Bevel trim seam',
    when: 'trim',
    step: 0.05,
    title:
      'Location of the repeating texture seam across the profile, from 0 to 1 texture turn. Does not split geometry.',
  },
  {
    key: 'trimOrigin',
    label: 'Trim Origin',
    aria: 'Bevel trim origin',
    when: 'trim',
    choices: [
      { value: 'anchor', label: 'Anchor' },
      { value: 'center', label: 'Center' },
      { value: 'end', label: 'Opposite End' },
    ],
    title: 'Sets length U=0 at the existing deterministic edge anchor, its midpoint, or the opposite endpoint.',
  },
  {
    key: 'trimDirection',
    label: 'Trim Direction',
    aria: 'Bevel trim direction',
    when: 'trim',
    choices: [
      { value: 'forward', label: 'Forward' },
      { value: 'reverse', label: 'Reverse' },
    ],
    title: 'Reverses the texture along the authored edge without reversing the profile or changing geometry.',
  },
];

/** Options for actual multi-edge corners only. */
export const MODIFIER_BEVEL_OPTION_CAP_FIELDS: readonly ModifierBevelOptionField[] = [
  {
    key: 'corner',
    label: 'Corner',
    aria: 'Bevel corner policy',
    when: 'caps',
    choices: [
      { value: 'simple', label: 'Simple / mitre' },
      { value: 'patch', label: 'Planar Patch' },
    ],
    title:
      'Simple preserves the intersection of convex edge strips. Planar patch adds a flat convex cut where at least three selected edges meet; it is not a concave or curved grid patch.',
  },
  {
    key: 'capProjection',
    label: 'Cap Projection',
    aria: 'Bevel cap projection',
    when: 'caps',
    choices: [
      { value: 'inherit', label: 'Follow Layout' },
      { value: 'axis', label: 'Axis' },
    ],
    title:
      'Follow layout preserves the existing cap chart. Axis independently projects corner caps using the selected Local/World space. Strip UVs stay unchanged.',
  },
  {
    key: 'capTextureId',
    label: 'Cap Texture',
    aria: 'Bevel cap texture',
    when: 'caps',
    choices: [],
    title:
      'Overrides only corner cap textures. Inherit bevel uses the ordinary bevel texture or its inherited authored wall.',
  },
];

/** Every contextual bevel option in inspector order. */
export const MODIFIER_BEVEL_OPTION_FIELDS: readonly ModifierBevelOptionField[] = [
  ...MODIFIER_BEVEL_OPTION_LIMIT_FIELDS,
  ...MODIFIER_BEVEL_OPTION_GEOMETRY_FIELDS,
  ...MODIFIER_BEVEL_OPTION_TRIM_FIELDS,
  ...MODIFIER_BEVEL_OPTION_CAP_FIELDS,
];
