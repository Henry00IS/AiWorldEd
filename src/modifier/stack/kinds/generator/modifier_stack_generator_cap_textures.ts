import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import * as THREE from 'three';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import {
  MODIFIER_STACK_GENERATOR_CAP_PREFIX,
  modifierStackGeneratorPlacementFields,
} from './modifier_stack_generator_texture.js';
import { modifierStackPrimitivePlanarUv } from './primitive/modifier_stack_primitive_planar.js';

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
    label: 'Cap Textures',
    type: 'boolean',
    default: false,
    group: 'Texture',
    hint: 'Give flat upward and downward faces, such as caps, ledges and the undersides of overhangs, their own textures. Off uses the main texture everywhere.',
  },
  {
    key: MODIFIER_STACK_CAP_TEXTURE_KEYS.top,
    label: 'Top Faces',
    type: 'texture',
    default: '',
    group: 'Texture',
    hint: 'Texture of flat upward faces: the top cap, steps and ledges. Default keeps the main texture.',
    visible: modifierStackCapTexturesOn,
  },
  {
    key: MODIFIER_STACK_CAP_TEXTURE_KEYS.bottom,
    label: 'Bottom Faces',
    type: 'texture',
    default: '',
    group: 'Texture',
    hint: 'Texture of flat downward faces: the bottom cap and the undersides of overhangs. Default keeps the main texture.',
    visible: modifierStackCapTexturesOn,
  },
  ...modifierStackGeneratorPlacementFields(MODIFIER_STACK_GENERATOR_CAP_PREFIX, 'Cap ', modifierStackCapTexturesOn),
];

/** Cap placement fields, left out of saved files while at their defaults. */
const MODIFIER_STACK_CAP_PLACEMENT_FIELDS = modifierStackGeneratorPlacementFields(
  MODIFIER_STACK_GENERATOR_CAP_PREFIX,
  'Cap ',
);

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
  for (const field of MODIFIER_STACK_CAP_PLACEMENT_FIELDS)
    if (parameters[field.key] === field.default) delete parameters[field.key];
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
 * Returns which faces of a piece are flat caps with their own texture
 * placement: every flat top and bottom face while cap textures are on.
 *
 * @param piece Piece in frame coordinates.
 * @param parameters Normalized parameters.
 * @returns Cap flag per face; null while cap textures are off.
 */
export function modifierStackCapFaces(piece: SolidBrush, parameters: Record<string, unknown>): boolean[] | null {
  if (!modifierStackCapTexturesOn(parameters)) return null;
  return piece.planes.map((plane) => Math.abs(plane.normal.y) >= MODIFIER_STACK_CAP_FLAT_NORMAL);
}

/**
 * Gives cap faces a planar mapping of their own at one repeat per metre,
 * centred on the box, so the side layout (wrap repeats, stretch) no longer
 * sizes them. Other faces keep their surfaces.
 *
 * @param surfaces Frame-space surfaces of the piece, or null for defaults.
 * @param caps Cap flag per face, or null.
 * @param piece Piece in frame coordinates.
 * @param box Volume box in frame coordinates.
 * @returns Surfaces with the caps replaced; unchanged while caps are off.
 */
export function modifierStackCapSurfaces(
  surfaces: readonly (FaceSurfaceDescription | undefined)[] | null,
  caps: readonly boolean[] | null,
  piece: SolidBrush,
  box: THREE.Box3,
): readonly (FaceSurfaceDescription | undefined)[] | null {
  if (!caps?.some(Boolean)) return surfaces;
  const centre = box.getCenter(new THREE.Vector3());
  return piece.planes.map((plane, index) => {
    if (!caps[index]) return surfaces?.[index];
    const uv = modifierStackPrimitivePlanarUv(plane.normal, centre);
    uv.u.w += 0.5;
    uv.v.w += 0.5;
    return { textureId: surfaces?.[index]?.textureId ?? DEFAULT_CHECKER_TEXTURE_ID, uv };
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
