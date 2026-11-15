import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierBevelApplyUvPlacement,
  type ModifierBevelUvPlacement,
} from '@/modifier/volume/modifier_volume_bevel_uv_placement.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';

/** Key prefix of the cap texture placement fields. */
export const MODIFIER_STACK_GENERATOR_CAP_PREFIX = 'capTexture';

/** UV point generated textures rotate around: the middle of the tile. */
const MODIFIER_STACK_GENERATOR_TEXTURE_PIVOT = { u: 0.5, v: 0.5 };

/**
 * Texture fields shared by every generator: any library texture, then the
 * slot's scale, offset, and rotation applied to every generated face.
 */
export const MODIFIER_STACK_GENERATOR_TEXTURE_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'texture',
    label: 'Texture',
    type: 'texture',
    default: '',
    group: 'Texture',
    hint: 'Texture of every generated face. Default uses the checker.',
  },
  ...modifierStackGeneratorPlacementFields('texture', ''),
];

/**
 * Builds the scale, offset and rotation fields of one texture placement.
 *
 * @param prefix Key prefix, such as texture for textureScaleU.
 * @param caption Label prefix, empty or ending in a space.
 * @param visible Optional visibility shared by every field.
 * @returns Fields in inspector order.
 */
export function modifierStackGeneratorPlacementFields(
  prefix: string,
  caption: string,
  visible?: ModifierStackField['visible'],
): ModifierStackField[] {
  const fields: ModifierStackField[] = [
    modifierStackGeneratorScaleField(`${prefix}ScaleU`, `${caption}U Scale`),
    modifierStackGeneratorScaleField(`${prefix}ScaleV`, `${caption}V Scale`),
    modifierStackGeneratorOffsetField(`${prefix}OffsetU`, `${caption}U Offset`),
    modifierStackGeneratorOffsetField(`${prefix}OffsetV`, `${caption}V Offset`),
    {
      key: `${prefix}Rotation`,
      label: `${caption}Rotation`,
      type: 'number',
      default: 0,
      min: -360,
      max: 360,
      step: 15,
      group: 'Texture',
      hint: 'Turns the texture around the middle of the tile, in degrees.',
    },
  ];
  return visible ? fields.map((field) => ({ ...field, visible })) : fields;
}

/**
 * Builds a meters-per-tile scale field.
 *
 * @param key Parameter key.
 * @param label Caption.
 * @returns Field.
 */
function modifierStackGeneratorScaleField(key: string, label: string): ModifierStackField {
  const hint = 'Size of one texture tile relative to the generated layout. 2 shows the texture twice as large.';
  return { key, label, type: 'number', default: 1, min: 0.01, max: 1000, step: 0.25, group: 'Texture', hint };
}

/**
 * Builds a texture shift field.
 *
 * @param key Parameter key.
 * @param label Caption.
 * @returns Field.
 */
function modifierStackGeneratorOffsetField(key: string, label: string): ModifierStackField {
  const hint = 'Slides the texture along this axis, in meters.';
  return { key, label, type: 'number', default: 0, step: 0.25, group: 'Texture', hint };
}

/**
 * Reads one texture placement from generator parameters.
 *
 * @param parameters Normalized parameters.
 * @param prefix Key prefix of the placement fields.
 * @returns Placement in the bevel's meters-per-tile convention.
 */
export function modifierStackGeneratorPlacement(
  parameters: Record<string, unknown>,
  prefix = 'texture',
): ModifierBevelUvPlacement {
  const number = (key: string, fallback: number): number => {
    const value = parameters[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };
  return {
    uvScaleU: number(`${prefix}ScaleU`, 1),
    uvScaleV: number(`${prefix}ScaleV`, 1),
    uvOffsetU: number(`${prefix}OffsetU`, 0),
    uvOffsetV: number(`${prefix}OffsetV`, 0),
    uvRotation: number(`${prefix}Rotation`, 0),
    uvOwner: MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
    uvPivot: MODIFIER_VOLUME_BEVEL_UV_PIVOT_TILE,
    uvSpace: MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
  };
}

/**
 * Gives every face of a generated piece the slot's texture and placement. Faces
 * keep their layout (wrapped, planar, or default) underneath. Cap faces take
 * the cap placement instead while caps have their own.
 *
 * @param brush Generated piece.
 * @param parameters Normalized generator parameters.
 * @param caps Whether each face is a cap with its own placement, or null.
 */
export function modifierStackGeneratorTextureApply(
  brush: SolidBrushInstance,
  parameters: Record<string, unknown>,
  caps: readonly boolean[] | null = null,
): void {
  const textureId = typeof parameters['texture'] === 'string' ? parameters['texture'] : '';
  if (textureId) brush.setAllFacesTextureId(textureId);
  const main = modifierStackGeneratorPlacement(parameters);
  const cap = caps ? modifierStackGeneratorPlacement(parameters, MODIFIER_STACK_GENERATOR_CAP_PREFIX) : main;
  const placements = new Map<number, ModifierBevelUvPlacement>();
  brush.brush.faces.forEach((face, index) => placements.set(face.surfaceIndex, caps?.[index] ? cap : main));
  for (const [index, placement] of placements) {
    const surface = brush.getFaceSurface(index);
    const uv = modifierBevelApplyUvPlacement(surface.uv, placement, MODIFIER_STACK_GENERATOR_TEXTURE_PIVOT);
    if (uv !== surface.uv) brush.setFaceSurface(index, { ...surface, uv });
  }
}
