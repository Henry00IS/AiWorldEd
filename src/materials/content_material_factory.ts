import * as THREE from 'three';
import { getDebugCheckerTexture } from '../texture/debug_texture_factory.js';

/**
 * Default metalness for hard-edge level content materials.
 * Kept at 0: brush/level surfaces are diffuse. Any metalness without an
 * environment map makes MeshStandardMaterial look unnaturally dark.
 */
export const CONTENT_METALNESS = 0;

/**
 * Default roughness for hard-edge level content materials.
 * High roughness keeps lighting soft and readable in a world editor.
 */
export const CONTENT_ROUGHNESS = 0.9;

/**
 * Creates a standard level-content material with the shared debug checker map.
 * Material color tints the map (existing color picker workflow).
 * @param color Hex color tint.
 * @param options Optional side / flatShading overrides.
 * @returns Configured MeshStandardMaterial.
 */
export function createContentMaterial(
  color: number,
  options: {
    flatShading?: boolean;
    side?: THREE.Side;
  } = {}
): THREE.MeshStandardMaterial {
  const flatShading = options.flatShading !== false;
  const side = options.side ?? THREE.FrontSide;
  return new THREE.MeshStandardMaterial({
    color,
    map: getDebugCheckerTexture(),
    metalness: CONTENT_METALNESS,
    roughness: CONTENT_ROUGHNESS,
    flatShading,
    side
  });
}
