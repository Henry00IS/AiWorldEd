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
  modifierStackGeneratorScaleField('textureScaleU', 'U scale'),
  modifierStackGeneratorScaleField('textureScaleV', 'V scale'),
  modifierStackGeneratorOffsetField('textureOffsetU', 'U offset'),
  modifierStackGeneratorOffsetField('textureOffsetV', 'V offset'),
  {
    key: 'textureRotation',
    label: 'Rotation',
    type: 'number',
    default: 0,
    min: -360,
    max: 360,
    step: 15,
    group: 'Texture',
    hint: 'Turns the texture around the middle of the tile, in degrees.',
  },
];

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
 * Reads the texture slot's placement from generator parameters.
 *
 * @param parameters Normalized parameters.
 * @returns Placement in the bevel's meters-per-tile convention.
 */
export function modifierStackGeneratorPlacement(parameters: Record<string, unknown>): ModifierBevelUvPlacement {
  const number = (key: string, fallback: number): number => {
    const value = parameters[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };
  return {
    uvScaleU: number('textureScaleU', 1),
    uvScaleV: number('textureScaleV', 1),
    uvOffsetU: number('textureOffsetU', 0),
    uvOffsetV: number('textureOffsetV', 0),
    uvRotation: number('textureRotation', 0),
    uvOwner: MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
    uvPivot: MODIFIER_VOLUME_BEVEL_UV_PIVOT_TILE,
    uvSpace: MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
  };
}

/**
 * Gives every face of a generated piece the slot's texture and placement. Faces
 * keep their layout (wrapped, planar, or default) underneath.
 *
 * @param brush Generated piece.
 * @param parameters Normalized generator parameters.
 */
export function modifierStackGeneratorTextureApply(
  brush: SolidBrushInstance,
  parameters: Record<string, unknown>,
): void {
  const textureId = typeof parameters['texture'] === 'string' ? parameters['texture'] : '';
  if (textureId) brush.setAllFacesTextureId(textureId);
  const placement = modifierStackGeneratorPlacement(parameters);
  const indices = new Set(brush.brush.faces.map((face) => face.surfaceIndex));
  for (const index of indices) {
    const surface = brush.getFaceSurface(index);
    const uv = modifierBevelApplyUvPlacement(surface.uv, placement, MODIFIER_STACK_GENERATOR_TEXTURE_PIVOT);
    if (uv !== surface.uv) brush.setFaceSurface(index, { ...surface, uv });
  }
}
