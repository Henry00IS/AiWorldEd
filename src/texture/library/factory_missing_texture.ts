import { getDebugCheckerTexture } from './factory_debug_texture.js';

/** Tint multiplied onto the checker for textures whose file is missing. */
export const MISSING_TEXTURE_TINT = '#ff00ff';

/** CSS background showing the missing-texture checker in texture lists. */
export const MISSING_TEXTURE_CSS_BACKGROUND = 'repeating-conic-gradient(#e800e8 0 25%, #9a009a 0 50%) 0 0 / 50% 50%';

let sharedMissingImage: CanvasImageSource | null = null;

/**
 * Returns the image shown for a texture whose file is not available: the
 * built-in checker multiplied with pink, so it never looks like the default
 * checker. The texture id stays assigned; the real image replaces this one as
 * soon as the file appears.
 *
 * @returns Shared pink checker image (the plain checker when canvas 2D is
 *   unavailable).
 */
export function getMissingCheckerImage(): CanvasImageSource {
  sharedMissingImage ??= createMissingCheckerImage();
  return sharedMissingImage;
}

/**
 * Paints the checker and multiplies it with the missing tint.
 *
 * @returns Pink checker canvas, or the checker image without canvas 2D.
 */
function createMissingCheckerImage(): CanvasImageSource {
  const checker = getDebugCheckerTexture().image as HTMLCanvasElement;
  const canvas = document.createElement('canvas');
  canvas.width = checker.width;
  canvas.height = checker.height;
  const context = canvas.getContext('2d');
  if (!context) return checker;
  context.drawImage(checker, 0, 0);
  context.globalCompositeOperation = 'multiply';
  context.fillStyle = MISSING_TEXTURE_TINT;
  context.fillRect(0, 0, canvas.width, canvas.height);
  canvas.dataset['missingTexture'] = 'true';
  return canvas;
}

/**
 * Tells whether an image is the missing-texture checker.
 *
 * @param image Texture image.
 * @returns True for the pink checker.
 */
export function isMissingCheckerImage(image: unknown): boolean {
  return image !== null && image === sharedMissingImage;
}
