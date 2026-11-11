import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { MODIFIER_STACK_CAP_TEXTURE_KEYS } from './modifier_stack_generator_cap_textures.js';

/** Parameter keys of the optional per-role stair textures. */
export const MODIFIER_STACK_STAIRS_TEXTURE_KEYS = {
  ...MODIFIER_STACK_CAP_TEXTURE_KEYS,
  side: 'textureSide',
} as const;

/** Role of one face of a stair piece. */
export type ModifierStackStairsFaceRole = 'top' | 'side' | 'bottom' | 'main';

/** Smallest normal component that counts as pointing along an axis. */
const MODIFIER_STACK_STAIRS_ROLE_EPSILON = 1e-6;

/**
 * Returns whether separate stair textures are switched on.
 *
 * @param parameters Normalized parameters.
 * @returns True when the toggle is on.
 */
function modifierStackStairsTexturesOn(parameters: Record<string, unknown>): boolean {
  return parameters[MODIFIER_STACK_STAIRS_TEXTURE_KEYS.toggle] === true;
}

/**
 * Optional stair textures: a toggle, then the top, side and bottom textures it
 * reveals. Risers and the front and back faces keep the main texture.
 */
export const MODIFIER_STACK_STAIRS_TEXTURE_FIELDS: readonly ModifierStackField[] = [
  {
    key: MODIFIER_STACK_STAIRS_TEXTURE_KEYS.toggle,
    label: 'Face Textures',
    type: 'boolean',
    default: false,
    group: 'Texture',
    hint: 'Give the treads, the side walls and the underside their own textures. Risers and nose fronts keep the main texture. Off uses the main texture everywhere.',
  },
  {
    key: MODIFIER_STACK_STAIRS_TEXTURE_KEYS.top,
    label: 'Top',
    type: 'texture',
    default: '',
    group: 'Texture',
    hint: 'Texture of the treads and the landing. Default keeps the main texture.',
    visible: modifierStackStairsTexturesOn,
  },
  {
    key: MODIFIER_STACK_STAIRS_TEXTURE_KEYS.side,
    label: 'Sides',
    type: 'texture',
    default: '',
    group: 'Texture',
    hint: 'Texture of the left and right side walls of the flight. Default keeps the main texture.',
    visible: modifierStackStairsTexturesOn,
  },
  {
    key: MODIFIER_STACK_STAIRS_TEXTURE_KEYS.bottom,
    label: 'Bottom',
    type: 'texture',
    default: '',
    group: 'Texture',
    hint: 'Texture of the underside: the floor faces and the sloped slab. Default keeps the main texture.',
    visible: modifierStackStairsTexturesOn,
  },
];

/**
 * Leaves the optional stair textures out while they hold their defaults, so
 * files that never used them stay unchanged.
 *
 * @param parameters Normalized parameters, modified in place.
 * @returns The same parameters.
 */
export function modifierStackStairsTexturesOmitDefaults(parameters: Record<string, unknown>): Record<string, unknown> {
  const keys = MODIFIER_STACK_STAIRS_TEXTURE_KEYS;
  if (parameters[keys.toggle] === false) delete parameters[keys.toggle];
  for (const key of [keys.top, keys.side, keys.bottom]) if (parameters[key] === '') delete parameters[key];
  return parameters;
}

/**
 * Returns the role of a stair face from its frame-space normal. Stair pieces
 * are boxes or prisms extruded across the flight, so every face points exactly
 * across the flight (side walls), straight up (treads), along the flight
 * (risers, front and back) or downward. Downward faces that lean back down the
 * flight are nose bevels and count with the risers; the rest (floor faces and
 * the sloped slab) are the underside.
 *
 * @param normal Face normal in the generator frame, +Y up.
 * @param direction Climb direction of the flight: +x, -x, +z or -z.
 * @returns Face role.
 */
export function modifierStackStairsFaceRole(
  normal: { x: number; y: number; z: number },
  direction: string,
): ModifierStackStairsFaceRole {
  const along = direction.endsWith('x') ? 'x' : 'z';
  const across = along === 'x' ? 'z' : 'x';
  if (Math.abs(normal[across]) > MODIFIER_STACK_STAIRS_ROLE_EPSILON) return 'side';
  if (normal.y > MODIFIER_STACK_STAIRS_ROLE_EPSILON) return 'top';
  if (normal.y >= -MODIFIER_STACK_STAIRS_ROLE_EPSILON) return 'main';
  const climb = direction.startsWith('-') ? -normal[along] : normal[along];
  return climb < -MODIFIER_STACK_STAIRS_ROLE_EPSILON ? 'main' : 'bottom';
}

/**
 * Picks the texture of every face of a stair piece by its role.
 *
 * @param piece Piece in frame coordinates.
 * @param parameters Normalized parameters.
 * @returns Texture per face, undefined keeping the main texture; null when off.
 */
export function modifierStackStairsTexturesPick(
  piece: SolidBrush,
  parameters: Record<string, unknown>,
): readonly (string | undefined)[] | null {
  if (!modifierStackStairsTexturesOn(parameters)) return null;
  const read = (key: string): string | undefined => {
    const value = parameters[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const keys = MODIFIER_STACK_STAIRS_TEXTURE_KEYS;
  const textures = { top: read(keys.top), side: read(keys.side), bottom: read(keys.bottom), main: undefined };
  const direction = String(parameters['direction']);
  return piece.faces.map((_, index) => {
    const normal = piece.planes[index]?.normal;
    return normal ? textures[modifierStackStairsFaceRole(normal, direction)] : undefined;
  });
}
