/**
 * Stable id for the built-in debug checker texture.
 * Used in face maps, the texture browser, and future map exporters.
 */
export const DEFAULT_CHECKER_TEXTURE_ID = '__default_checker__';

/**
 * Display label for the built-in checker in the texture browser.
 */
export const DEFAULT_CHECKER_DISPLAY_NAME = 'Checker';

/**
 * Returns whether the id refers to the built-in checker.
 * @param textureId Texture id to test.
 * @returns True when the id is the default checker.
 */
export function isDefaultCheckerTextureId(textureId: string): boolean {
  return textureId === DEFAULT_CHECKER_TEXTURE_ID;
}
