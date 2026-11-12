import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackKind, type ModifierStackCategory } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import { modifierStackChoices } from '@/modifier/stack/modifier_stack_fields.js';
import { PAINT_BLEND_MODES } from '@/paint/raster/paint_blend_mode.js';

/** Persisted id of the Decal modifier. */
export const MODIFIER_STACK_KIND_DECAL = 'decal';

/** Fields of the Decal modifier. */
const MODIFIER_STACK_DECAL_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'texture',
    label: 'Texture',
    type: 'texture',
    default: '',
    hint: 'Image projected straight down the volume. Its alpha is the mask; Default paints a plain color.',
  },
  {
    key: 'color',
    label: 'Color',
    type: 'color',
    default: '#ffffff',
    hint: 'Tint multiplied into the image, or the plain color when there is no image.',
  },
  {
    key: 'blend',
    label: 'Blend Mode',
    type: 'choice',
    default: 'normal',
    choices: modifierStackChoices(PAINT_BLEND_MODES.map((mode) => [mode.value, mode.label] as const)),
    hint: 'Normal covers, Multiply darkens like grime or shadow, Add and Screen brighten like glow.',
  },
  {
    key: 'opacity',
    label: 'Opacity',
    type: 'number',
    default: 1,
    min: 0,
    max: 1,
    step: 0.05,
    hint: 'Strength of the whole decal.',
  },
  {
    key: 'order',
    label: 'Layer Order',
    type: 'number',
    default: 1,
    min: -100,
    max: 100,
    integer: true,
    step: 1,
    hint: 'Lower layers are applied first. Hand painting is layer 0, so negative decals sit under the paint.',
  },
  {
    key: 'edgeFade',
    label: 'Edge Fade',
    type: 'number',
    default: 0.1,
    min: 0,
    max: 0.5,
    step: 0.05,
    hint: 'How softly the decal fades out toward the sides of the box, as a share of its size.',
  },
  {
    key: 'angleFade',
    label: 'Angle Fade',
    type: 'boolean',
    default: true,
    hint: 'Surfaces turned away from the projection fade out instead of smearing.',
  },
];

/**
 * Projects an image or a color onto every brush surface inside the volume,
 * straight down its -Y axis. It is a paint layer: shapes and the CSG never
 * change, and the brushes in the box pass through untouched.
 */
export class ModifierStackKindDecal extends ModifierStackKind {
  readonly id = MODIFIER_STACK_KIND_DECAL;
  readonly label = 'Decal';
  readonly category: ModifierStackCategory = 'shape';
  readonly description = 'Projects an image or color down onto the surfaces inside the volume. Shapes stay unchanged.';
  readonly fields: readonly ModifierStackField[] = MODIFIER_STACK_DECAL_FIELDS;
  override readonly changesGeometry = false;

  /**
   * Returns the blend mode and opacity summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    const blend = PAINT_BLEND_MODES.find((mode) => mode.value === parameters['blend'])?.label ?? 'Normal';
    return `${blend} ${Math.round(Number(parameters['opacity']) * 100)}%`;
  }

  /**
   * Passes the working set through unchanged.
   *
   * @param units Previous output.
   * @returns The same units.
   */
  apply(units: readonly ModifierStackUnit[]): ModifierStackUnit[] {
    return [...units];
  }
}
