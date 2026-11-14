import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackKind, type ModifierStackCategory } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import { modifierStackChoices } from '@/modifier/stack/modifier_stack_fields.js';

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
  firstHitOnly: 'firstHitOnly',
  unfoldSticker: 'unfoldSticker',
} as const;

/** Default distance a decal floats above its surfaces, in meters. */
export const MODIFIER_STACK_DECAL_LIFT_DEFAULT = 0.0004;

/** Default extra lift per stacking step of overlapping decals, in meters. */
export const MODIFIER_STACK_DECAL_LAYER_LIFT_DEFAULT = 0.0002;

/**
 * Brings parameters saved by earlier versions up to date. Those stored a 0 to 1
 * lift slider beside a maximum lift distance, or the distance alone, which the
 * slider's 0.2 default scaled; both become one lift distance.
 *
 * @param input Stored parameters.
 * @returns Parameters in the current form.
 */
function modifierStackDecalMigrate(input: Record<string, unknown>): Record<string, unknown> {
  const distance = input['liftDistance'];
  if (typeof distance !== 'number' || !Number.isFinite(distance)) return input;
  const fraction = typeof input['lift'] === 'number' && Number.isFinite(input['lift']) ? input['lift'] : 0.2;
  const migrated: Record<string, unknown> = { ...input, lift: distance * Math.min(1, Math.max(0, fraction)) };
  delete migrated['liftDistance'];
  return migrated;
}

/** Inspector fields of the Decal modifier, in panel order. */
const MODIFIER_STACK_DECAL_FIELDS: readonly ModifierStackField[] = [
  {
    key: MODIFIER_STACK_DECAL_KEYS.texture,
    label: 'Image',
    type: 'texture',
    default: '',
    group: 'Image',
    hint: 'Texture the decal shows; its alpha cuts the shape. Checker until you pick one.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.uvMinU,
    label: 'UV Min U',
    type: 'number',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    group: 'Image',
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
    group: 'Image',
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
    group: 'Image',
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
    group: 'Image',
    hint: 'Top edge of the part of the texture the decal shows, 0 to 1.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.uvRotation,
    label: 'UV Rotation',
    type: 'choice',
    default: '0',
    choices: modifierStackChoices([
      ['0', '0°'],
      ['90', '90°'],
      ['180', '180°'],
      ['270', '270°'],
    ]),
    group: 'Image',
    hint: 'Turns the image inside the decal counter-clockwise before it is fitted into the UV rectangle.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.uvFlipU,
    label: 'Flip U',
    type: 'boolean',
    default: false,
    group: 'Image',
    hint: 'Mirrors the image left to right.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.uvFlipV,
    label: 'Flip V',
    type: 'boolean',
    default: false,
    group: 'Image',
    hint: 'Mirrors the image top to bottom.',
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
    group: 'Image',
    hint: 'Optional override of the stacking order. Overlapping decals stack automatically in hierarchy order, later on top; a higher layer always stacks above a lower one.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.facingLimit,
    label: 'Facing Limit',
    type: 'number',
    default: 89,
    min: 0,
    max: 180,
    step: 1,
    group: 'Projection',
    hint: 'Steepest angle, in degrees, between a surface and the arrow at which the surface still receives the image.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.firstHitOnly,
    label: 'First Hit Only',
    type: 'boolean',
    default: false,
    group: 'Projection',
    hint: 'Paints only the surfaces the arrow reaches first, so geometry such as a pillar shields what lies behind it.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.lift,
    label: 'Lift',
    type: 'number',
    default: MODIFIER_STACK_DECAL_LIFT_DEFAULT,
    min: 0,
    max: 1,
    step: 0.0001,
    group: 'Projection',
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
    group: 'Projection',
    hint: 'Extra lift for each overlapping decal stacked below this one, so overlapping decals never flicker against each other in the editor or in exported meshes. Decals that overlap nothing get none.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.unfoldSticker,
    label: 'Sticker Unfold',
    type: 'boolean',
    default: false,
    group: 'Projection',
    hint: 'Lays the image flat across the surfaces like a sticker, so it keeps its size on steep faces and around corners instead of stretching.',
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
    return parameters[MODIFIER_STACK_DECAL_KEYS.firstHitOnly] === true ? 'First Hit' : '';
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
