import * as THREE from 'three';

/** Edge length of the generated default image, in pixels. */
const DECAL_DEFAULT_IMAGE_SIZE = 64;

let decalDefaultImageShared: THREE.DataTexture | null = null;

/**
 * Returns the shared image shown by decals without a texture: an orange ring
 * with an arrow toward the image's top, transparent everywhere else, so the
 * decal's extent and orientation read at a glance.
 *
 * @returns Shared texture.
 */
export function decalDefaultImage(): THREE.DataTexture {
  if (decalDefaultImageShared) return decalDefaultImageShared;
  const pixels = new Uint8Array(DECAL_DEFAULT_IMAGE_SIZE * DECAL_DEFAULT_IMAGE_SIZE * 4);
  for (let row = 0; row < DECAL_DEFAULT_IMAGE_SIZE; row++) {
    for (let column = 0; column < DECAL_DEFAULT_IMAGE_SIZE; column++) {
      decalDefaultImagePixelWrite(pixels, column, row);
    }
  }
  const texture = new THREE.DataTexture(pixels, DECAL_DEFAULT_IMAGE_SIZE, DECAL_DEFAULT_IMAGE_SIZE);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  decalDefaultImageShared = texture;
  return texture;
}

/**
 * Writes one pixel of the default image.
 *
 * @param pixels RGBA pixel array, rows from the image's bottom.
 * @param column Pixel column.
 * @param row Pixel row from the bottom.
 */
function decalDefaultImagePixelWrite(pixels: Uint8Array, column: number, row: number): void {
  const x = (column + 0.5) / DECAL_DEFAULT_IMAGE_SIZE - 0.5;
  const y = (row + 0.5) / DECAL_DEFAULT_IMAGE_SIZE - 0.5;
  const radius = Math.hypot(x, y);
  const onRing = radius > 0.38 && radius < 0.47;
  const onArrow = Math.abs(x) < 0.04 * (1 + (0.3 - y) * 2) && y > -0.25 && y < 0.3 && Math.abs(x) < 0.3 - y;
  const offset = (row * DECAL_DEFAULT_IMAGE_SIZE + column) * 4;
  pixels[offset] = 230;
  pixels[offset + 1] = 126;
  pixels[offset + 2] = 34;
  pixels[offset + 3] = onRing || onArrow ? 255 : radius < 0.38 ? 60 : 0;
}

/**
 * Returns the image for a decal texture id.
 *
 * @param textureId Texture id, or an empty string for the default image.
 * @param resolveLibraryTexture Resolver of library texture ids.
 * @returns Texture to draw.
 */
export function decalImageResolve(
  textureId: string,
  resolveLibraryTexture: (textureId: string) => THREE.Texture,
): THREE.Texture {
  if (textureId === '') return decalDefaultImage();
  return resolveLibraryTexture(textureId);
}
