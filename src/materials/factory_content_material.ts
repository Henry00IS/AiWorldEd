import * as THREE from 'three';
import { getDebugCheckerTexture } from '@/texture/library/factory_debug_texture.js';
import { ContentViewLitMaterial, createContentViewLitMaterial } from './factory_content_view_lit_material.js';

/**
 * Default metalness for export conversion of content materials to standard
 * materials.
 */
export const CONTENT_METALNESS = 0;

/**
 * Default roughness for export conversion of content materials to standard
 * materials: fully rough, like the matte FBX and OBJ materials.
 */
export const CONTENT_ROUGHNESS = 1;

/**
 * Default specular intensity for export conversion of content materials: none,
 * like the zero specular of the FBX and OBJ materials.
 */
export const CONTENT_SPECULAR_INTENSITY = 0;

/**
 * Creates a level-content material: min(0.02 + N·V, 1) × checker × color.
 *
 * @param color Hex color tint.
 * @param options Optional side override.
 * @returns Content view-lit material.
 */
export function createContentMaterial(
  color: number,
  options: {
    flatShading?: boolean;
    side?: THREE.Side;
  } = {},
): ContentViewLitMaterial {
  return createContentViewLitMaterial(color, getDebugCheckerTexture(), options);
}
