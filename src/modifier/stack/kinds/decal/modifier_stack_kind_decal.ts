import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackKind, type ModifierStackCategory } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import { modifierStackChoices } from '@/modifier/stack/modifier_stack_fields.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';

/** Persisted id of the Decal modifier that drives a decal projector. */
export const MODIFIER_STACK_KIND_DECAL = 'decal';

/** Parameter keys of the Decal modifier. */
export const MODIFIER_STACK_DECAL_KEYS = {
  texture: 'texture',
  uvMinU: 'uvMinU',
  uvMinV: 'uvMinV',
  uvMaxU: 'uvMaxU',
  uvMaxV: 'uvMaxV',
  uvRotation: 'uvRotation',
  uvFlipU: 'uvFlipU',
  uvFlipV: 'uvFlipV',
  layer: 'layer',
  facingLimit: 'facingLimit',
  lift: 'lift',
  layerLift: 'layerLift',
  hits: 'hits',
  wrap: 'wrap',
} as const;

/** Which surfaces along the arrow a decal paints. */
export const MODIFIER_STACK_DECAL_HITS = {
  /** Every surface inside the box. */
  all: 'all',
  /** Only the surfaces the arrow reaches first. */
  first: 'first',
  /** Only what the first surfaces hide, on the next surface behind: a shadow. */
  shadow: 'shadow',
} as const;

/** How the image lies on the surfaces. */
export const MODIFIER_STACK_DECAL_WRAPS = {
  /** Straight projection along the arrow. */
  planar: 'planar',
  /** Unfolded across the surfaces like a sticker. */
  sticker: 'sticker',
} as const;

/** Default distance a decal floats above its surfaces, in meters. */
export const MODIFIER_STACK_DECAL_LIFT_DEFAULT = 0.0004;

/** Default extra lift per stacking step of overlapping decals, in meters. */
export const MODIFIER_STACK_DECAL_LAYER_LIFT_DEFAULT = 0.0002;

/**
 * Brings parameters saved by earlier versions up to date. Those stored a 0 to 1
 * lift slider beside a maximum lift distance, or the distance alone, which the
 * slider's 0.2 default scaled; both become one lift distance. The First Hit
 * Only, Invert and Sticker Unfold switches become the Hits and Wrap choices,
 * and an empty or "default" image becomes the library's Checker.
 *
 * @param input Stored parameters.
 * @returns Parameters in the current form.
 */
function modifierStackDecalMigrate(input: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...input };
  const texture = input['texture'];
  if (texture === undefined || texture === '' || texture === 'default')
    migrated['texture'] = DEFAULT_CHECKER_TEXTURE_ID;
  const distance = input['liftDistance'];
  if (typeof distance === 'number' && Number.isFinite(distance)) {
    const fraction = typeof input['lift'] === 'number' && Number.isFinite(input['lift']) ? input['lift'] : 0.2;
    migrated['lift'] = distance * Math.min(1, Math.max(0, fraction));
  }
  if (typeof input['firstHitOnly'] === 'boolean' || typeof input['invert'] === 'boolean') {
    if (input['invert'] === true) migrated['hits'] = MODIFIER_STACK_DECAL_HITS.shadow;
    else if (input['firstHitOnly'] === true) migrated['hits'] = MODIFIER_STACK_DECAL_HITS.first;
    else migrated['hits'] = MODIFIER_STACK_DECAL_HITS.all;
  }
  if (typeof input['unfoldSticker'] === 'boolean')
    migrated['wrap'] = input['unfoldSticker'] ? MODIFIER_STACK_DECAL_WRAPS.sticker : MODIFIER_STACK_DECAL_WRAPS.planar;
  for (const old of ['liftDistance', 'firstHitOnly', 'invert', 'unfoldSticker']) delete migrated[old];
  return migrated;
}

/** Inspector fields of the Decal modifier, in panel order. */
const MODIFIER_STACK_DECAL_FIELDS: readonly ModifierStackField[] = [
  {
    key: MODIFIER_STACK_DECAL_KEYS.texture,
    label: 'Image',
    type: 'texture',
    default: DEFAULT_CHECKER_TEXTURE_ID,
    group: 'Decal',
    hint: 'Texture the decal shows, from the same library as every other texture picker; its alpha cuts the shape.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.hits,
    label: 'Hit Mode',
    type: 'choice',
    default: MODIFIER_STACK_DECAL_HITS.all,
    choices: modifierStackChoices([
      [MODIFIER_STACK_DECAL_HITS.all, 'All Surfaces', 'Paints every surface inside the box that faces the arrow.'],
      [
        MODIFIER_STACK_DECAL_HITS.first,
        'First Hit Only',
        'Paints only the surfaces the arrow reaches first, so a pillar shields the floor behind it.',
      ],
      [
        MODIFIER_STACK_DECAL_HITS.shadow,
        'Shadow',
        'Inverted: paints only what the first surfaces hide, on the next surface behind them, like a baked shadow. Surfaces further back get nothing.',
      ],
    ]),
    group: 'Decal',
    hint: 'Which surfaces along the arrow receive the image.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.wrap,
    label: 'Sticker Mode',
    type: 'choice',
    default: MODIFIER_STACK_DECAL_WRAPS.planar,
    choices: modifierStackChoices([
      [
        MODIFIER_STACK_DECAL_WRAPS.planar,
        'Planar',
        'Projects straight along the arrow; the image stretches on steep faces.',
      ],
      [
        MODIFIER_STACK_DECAL_WRAPS.sticker,
        'Sticker',
        'Lays the image flat across the surfaces like a sticker, so it keeps its size on steep faces and around corners.',
      ],
    ]),
    group: 'Decal',
    hint: 'How the image lies on the surfaces it reaches.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.uvMinU,
    label: 'UV Min U',
    type: 'number',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    group: 'UV',
    hint: 'Left edge of the part of the texture the decal shows, 0 to 1. With the other UV fields it picks one cell of an atlas.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.uvMinV,
    label: 'UV Min V',
    type: 'number',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    group: 'UV',
    hint: 'Bottom edge of the part of the texture the decal shows, 0 to 1.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.uvMaxU,
    label: 'UV Max U',
    type: 'number',
    default: 1,
    min: 0,
    max: 1,
    step: 0.01,
    group: 'UV',
    hint: 'Right edge of the part of the texture the decal shows, 0 to 1.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.uvMaxV,
    label: 'UV Max V',
    type: 'number',
    default: 1,
    min: 0,
    max: 1,
    step: 0.01,
    group: 'UV',
    hint: 'Top edge of the part of the texture the decal shows, 0 to 1.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.uvRotation,
    label: 'UV Rotation',
    type: 'choice',
    default: '0',
    choices: modifierStackChoices([
      ['0', '0°', 'Image upright.'],
      ['90', '90°', 'Image turned a quarter counter-clockwise.'],
      ['180', '180°', 'Image upside down.'],
      ['270', '270°', 'Image turned a quarter clockwise.'],
    ]),
    group: 'UV',
    hint: 'Turns the image inside the decal counter-clockwise before it is fitted into the UV rectangle.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.uvFlipU,
    label: 'Flip U',
    type: 'boolean',
    default: false,
    group: 'UV',
    hint: 'Mirrors the image left to right.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.uvFlipV,
    label: 'Flip V',
    type: 'boolean',
    default: false,
    group: 'UV',
    hint: 'Mirrors the image top to bottom.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.facingLimit,
    label: 'Facing Limit',
    type: 'number',
    default: 89,
    min: 0,
    max: 180,
    step: 1,
    group: 'Surfaces',
    hint: 'Steepest angle, in degrees, between a surface and the arrow at which the surface still receives the image.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.layer,
    label: 'Layer',
    type: 'number',
    default: 0,
    min: -1000,
    max: 1000,
    integer: true,
    step: 1,
    group: 'Stacking',
    hint: 'Optional override of the stacking order. Overlapping decals stack automatically in hierarchy order, later on top; a higher layer always stacks above a lower one.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.lift,
    label: 'Lift',
    type: 'number',
    default: MODIFIER_STACK_DECAL_LIFT_DEFAULT,
    min: 0,
    max: 1,
    step: 0.0001,
    group: 'Stacking',
    hint: 'How far the decal floats above its surfaces, in meters. 0 lies on them and may flicker.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.layerLift,
    label: 'Layer Lift',
    type: 'number',
    default: MODIFIER_STACK_DECAL_LAYER_LIFT_DEFAULT,
    min: 0,
    max: 1,
    step: 0.0001,
    group: 'Stacking',
    hint: 'Extra lift for each overlapping decal stacked below this one, so overlapping decals never flicker against each other in the editor or in exported meshes. Decals that overlap nothing get none.',
  },
];

/**
 * The modifier at the top of every decal projector. It holds the decal's
 * settings; the decal layer draws them, so evaluation passes brushes through.
 */
export class ModifierStackKindDecal extends ModifierStackKind {
  readonly id = MODIFIER_STACK_KIND_DECAL;
  readonly label = 'Decal';
  readonly category: ModifierStackCategory = 'decal';
  readonly description = 'Projects an image along the arrow onto the surfaces inside the box.';
  readonly fields: readonly ModifierStackField[] = MODIFIER_STACK_DECAL_FIELDS;

  /**
   * Returns the summary shown on the collapsed modifier.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    const hits = parameters[MODIFIER_STACK_DECAL_KEYS.hits];
    const parts = [
      hits === MODIFIER_STACK_DECAL_HITS.first
        ? 'First Hit'
        : hits === MODIFIER_STACK_DECAL_HITS.shadow
          ? 'Shadow'
          : '',
      parameters[MODIFIER_STACK_DECAL_KEYS.wrap] === MODIFIER_STACK_DECAL_WRAPS.sticker ? 'Sticker' : '',
    ];
    return parts.filter((part) => part !== '').join(', ');
  }

  /**
   * Normalizes parameters, migrating earlier saves first.
   *
   * @param input Stored or partial parameters.
   * @returns Parameters with every field valid.
   */
  override normalizeParameters(input: Record<string, unknown>): Record<string, unknown> {
    return super.normalizeParameters(modifierStackDecalMigrate(input));
  }

  /**
   * Passes the working set through: decals never change brushes.
   *
   * @param units Previous output.
   * @returns The same units.
   */
  apply(units: readonly ModifierStackUnit[]): ModifierStackUnit[] {
    return [...units];
  }
}
