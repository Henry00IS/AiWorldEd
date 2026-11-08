import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';

/**
 * Smallest vertical normal component of a flat top or bottom face; the same
 * limit that gives a face the planar cap mapping.
 */
export const MODIFIER_STACK_CAP_FLAT_NORMAL = 0.999;

/** Parameter keys of the optional top and bottom face textures. */
export const MODIFIER_STACK_CAP_TEXTURE_KEYS = {
  toggle: 'capTextures',
  top: 'textureTop',
  bottom: 'textureBottom',
} as const;

/**
 * Returns whether separate top and bottom textures are switched on.
 *
 * @param parameters Normalized parameters.
 * @returns True when the toggle is on.
 */
function modifierStackCapTexturesOn(parameters: Record<string, unknown>): boolean {
  return parameters[MODIFIER_STACK_CAP_TEXTURE_KEYS.toggle] === true;
}

/**
 * Optional texture fields for flat faces: a toggle, then the top and bottom
 * textures it reveals.
 */
export const MODIFIER_STACK_CAP_TEXTURE_FIELDS: readonly ModifierStackField[] = [
  {
    key: MODIFIER_STACK_CAP_TEXTURE_KEYS.toggle,
    label: 'Cap textures',
    type: 'boolean',
    default: false,
    group: 'Texture',
    hint: 'Give flat upward and downward faces, such as caps, ledges and the undersides of overhangs, their own textures. Off uses the main texture everywhere.',
  },
  {
    key: MODIFIER_STACK_CAP_TEXTURE_KEYS.top,
    label: 'Top faces',
    type: 'texture',
    default: '',
    group: 'Texture',
    hint: 'Texture of flat upward faces: the top cap, steps and ledges. Default keeps the main texture.',
    visible: modifierStackCapTexturesOn,
  },
  {
    key: MODIFIER_STACK_CAP_TEXTURE_KEYS.bottom,
    label: 'Bottom faces',
    type: 'texture',
    default: '',
    group: 'Texture',
    hint: 'Texture of flat downward faces: the bottom cap and the undersides of overhangs. Default keeps the main texture.',
    visible: modifierStackCapTexturesOn,
  },
];

/**
 * Leaves the optional top and bottom settings out while they hold their
 * defaults, so files that never used them stay unchanged.
 *
 * @param parameters Normalized parameters, modified in place.
 * @returns The same parameters.
 */
export function modifierStackCapTexturesOmitDefaults(parameters: Record<string, unknown>): Record<string, unknown> {
  if (parameters[MODIFIER_STACK_CAP_TEXTURE_KEYS.toggle] === false)
    delete parameters[MODIFIER_STACK_CAP_TEXTURE_KEYS.toggle];
  for (const key of [MODIFIER_STACK_CAP_TEXTURE_KEYS.top, MODIFIER_STACK_CAP_TEXTURE_KEYS.bottom])
    if (parameters[key] === '') delete parameters[key];
  return parameters;
}

/**
 * Picks the texture of every flat top and bottom face of a piece, measured in
 * the generator frame where +Y is up.
 *
 * @param piece Piece in frame coordinates.
 * @param parameters Normalized parameters.
 * @returns Texture per face, undefined keeping the main texture; null when off.
 */
export function modifierStackCapTexturesPick(
  piece: SolidBrush,
  parameters: Record<string, unknown>,
): readonly (string | undefined)[] | null {
  if (!modifierStackCapTexturesOn(parameters)) return null;
  const read = (key: string): string | undefined => {
    const value = parameters[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const top = read(MODIFIER_STACK_CAP_TEXTURE_KEYS.top);
  const bottom = read(MODIFIER_STACK_CAP_TEXTURE_KEYS.bottom);
  return piece.faces.map((_, index) => {
    const up = piece.planes[index]?.normal.y ?? 0;
    if (up >= MODIFIER_STACK_CAP_FLAT_NORMAL) return top;
    return up <= -MODIFIER_STACK_CAP_FLAT_NORMAL ? bottom : undefined;
  });
}

/**
 * Gives the picked faces their texture, keeping each face's UV mapping.
 *
 * @param brush Generated piece.
 * @param textures Texture per face, or null.
 */
export function modifierStackCapTexturesApply(
  brush: SolidBrushInstance,
  textures: readonly (string | undefined)[] | null,
): void {
  textures?.forEach((textureId, index) => {
    const face = brush.brush.faces[index];
    if (textureId && face) brush.setFaceTextureId(face.surfaceIndex, textureId);
  });
}
