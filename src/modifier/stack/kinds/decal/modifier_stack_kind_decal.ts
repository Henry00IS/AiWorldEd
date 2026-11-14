import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackKind, type ModifierStackCategory } from '@/modifier/stack/kinds/modifier_stack_kind.js';

/** Persisted id of the Decal modifier that drives a decal projector. */
export const MODIFIER_STACK_KIND_DECAL = 'decal';

/** Parameter keys of the Decal modifier. */
export const MODIFIER_STACK_DECAL_KEYS = {
  mode: 'mode',
  texture: 'texture',
  opacity: 'opacity',
  layer: 'layer',
  facingLimit: 'facingLimit',
  liftDistance: 'liftDistance',
  firstHitOnly: 'firstHitOnly',
  unfoldSticker: 'unfoldSticker',
} as const;

/**
 * Returns whether the decal draws as a lifted surface mesh.
 *
 * @param parameters Current parameters.
 * @returns True in Surface Mesh mode.
 */
function modifierStackDecalIsSurfaceMesh(parameters: Record<string, unknown>): boolean {
  return parameters[MODIFIER_STACK_DECAL_KEYS.mode] === 'surfaceMesh';
}

/** Inspector fields of the Decal modifier, in panel order. */
const MODIFIER_STACK_DECAL_FIELDS: readonly ModifierStackField[] = [
  {
    key: MODIFIER_STACK_DECAL_KEYS.mode,
    label: 'Mode',
    type: 'choice',
    default: 'projector',
    choices: [
      { value: 'projector', label: 'Projector' },
      { value: 'surfaceMesh', label: 'Surface Mesh' },
    ],
    hint: 'Projector draws the image on the surfaces it reaches. Surface Mesh builds a welded copy of those surfaces lifted off them, so it wraps creases without seams.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.texture,
    label: 'Image',
    type: 'texture',
    default: '',
    group: 'Image',
    hint: 'Texture the decal shows; its alpha cuts the shape. Checker until you pick one.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.opacity,
    label: 'Opacity',
    type: 'number',
    default: 1,
    min: 0,
    max: 1,
    step: 0.05,
    group: 'Image',
    hint: 'How strongly the image covers the surface, from 0 (invisible) to 1.',
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
    hint: 'Where decals overlap, higher layers draw on top; equal layers follow scene order.',
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
    key: MODIFIER_STACK_DECAL_KEYS.liftDistance,
    label: 'Lift Distance',
    type: 'number',
    default: 0.002,
    min: 0.0005,
    max: 1,
    step: 0.001,
    group: 'Projection',
    hint: 'How far the surface mesh floats above its surfaces, in meters. Exports lift Projector decals by this distance too.',
  },
  {
    key: MODIFIER_STACK_DECAL_KEYS.unfoldSticker,
    label: 'Sticker Unfold',
    type: 'boolean',
    default: false,
    group: 'Projection',
    hint: 'Lays the image flat across the surfaces like a sticker, so it keeps its size on steep faces and around corners instead of stretching.',
    visible: modifierStackDecalIsSurfaceMesh,
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
   * Returns the mode summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    const mode = modifierStackDecalIsSurfaceMesh(parameters) ? 'Surface Mesh' : 'Projector';
    return parameters[MODIFIER_STACK_DECAL_KEYS.firstHitOnly] === true ? `${mode} · First Hit` : mode;
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
