import * as THREE from 'three';

/**
 * Shared 4x4 checker debug texture for level surfaces.
 * At scale 1, one tile is 1 m and each cell is 0.25 m (default snap).
 */
const CHECKER_CELLS = 4;
const TEXTURE_PIXELS = 64;

let sharedDebugTexture: THREE.CanvasTexture | null = null;

/**
 * Returns the singleton debug checker texture, creating it on first use.
 * Do not dispose this texture per mesh; dispose only on app teardown.
 * @returns Shared canvas texture with repeat wrapping.
 */
export function getDebugCheckerTexture(): THREE.CanvasTexture {
  if (sharedDebugTexture) return sharedDebugTexture;
  sharedDebugTexture = createCheckerTexture();
  return sharedDebugTexture;
}

/**
 * Builds a new 4x4 white/gray checker canvas texture.
 * @returns Configured CanvasTexture.
 */
function createCheckerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_PIXELS;
  canvas.height = TEXTURE_PIXELS;
  const context = canvas.getContext('2d');
  if (!context) {
    return createFallbackDataTexture();
  }
  paintChecker(context, TEXTURE_PIXELS, CHECKER_CELLS);
  const texture = new THREE.CanvasTexture(canvas);
  configureTexture(texture);
  return texture;
}

/**
 * Paints alternating light cells into a 2D canvas context.
 * @param context Canvas 2D context.
 * @param pixelSize Texture edge length in pixels.
 * @param cellCount Number of cells along each edge.
 */
function paintChecker(
  context: CanvasRenderingContext2D,
  pixelSize: number,
  cellCount: number
): void {
  const cellPixels = pixelSize / cellCount;
  for (let y = 0; y < cellCount; y++) {
    for (let x = 0; x < cellCount; x++) {
      const isLight = (x + y) % 2 === 0;
      context.fillStyle = isLight ? '#e8e8e8' : '#9a9a9a';
      context.fillRect(x * cellPixels, y * cellPixels, cellPixels, cellPixels);
    }
  }
}

/**
 * Fallback texture when canvas 2D is unavailable (tests without full DOM canvas).
 * @returns DataTexture with a simple 2x2 checker pattern.
 */
function createFallbackDataTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#e8e8e8';
    context.fillRect(0, 0, 1, 1);
    context.fillRect(1, 1, 1, 1);
    context.fillStyle = '#9a9a9a';
    context.fillRect(1, 0, 1, 1);
    context.fillRect(0, 1, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  configureTexture(texture);
  return texture;
}

/**
 * Applies standard wrap and filter settings for the debug map.
 * @param texture Texture to configure.
 */
function configureTexture(texture: THREE.CanvasTexture): void {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
}

/**
 * Disposes the shared debug texture if it exists.
 * Call only when the application is shutting down.
 */
export function disposeDebugCheckerTexture(): void {
  if (!sharedDebugTexture) return;
  sharedDebugTexture.dispose();
  sharedDebugTexture = null;
}

/**
 * Returns the designed cell count along one edge of the checker.
 * @returns Cell count (4).
 */
export function getDebugCheckerCellCount(): number {
  return CHECKER_CELLS;
}
