import * as THREE from 'three';

/** Resolution of the baked studio matcap sphere. */
export const STUDIO_MATCAP_SIZE = 256;

/**
 * Peak matcap luminance for camera-facing surfaces. 1 = unlit texture color
 * (map × matcap leaves albedo unchanged when looking straight at a wall).
 */
export const STUDIO_MATCAP_PEAK = 1;

/** Floor luminance on the dark side of the studio key. */
export const STUDIO_MATCAP_EDGE_FLOOR = 0.12;

/**
 * How tightly face-on surfaces blend to unlit peak. Higher = only
 * near-perpendicular walls stay fully unlit; angled faces keep studio depth.
 */
export const STUDIO_MATCAP_UNLIT_BLEND_POWER = 5;

/**
 * Three.js MeshMatcapMaterial shrinks the normal disk slightly (see meshmatcap
 * fragment shader: * 0.495 + 0.5).
 */
const MATCAP_UV_SCALE = 0.495;

/** Cached studio matcap DataTexture, or null before first bake. */
let sharedStudioMatcap: THREE.DataTexture | null = null;

/**
 * Returns the shared studio matcap texture, baking it on first use.
 *
 * @returns Matcap DataTexture in sRGB color space.
 */
export function getStudioMatcapTexture(): THREE.DataTexture {
  if (!sharedStudioMatcap) {
    sharedStudioMatcap = bakeStudioMatcapTexture(STUDIO_MATCAP_SIZE);
  }
  return sharedStudioMatcap;
}

/** Disposes the shared matcap texture when present and clears the cache. */
export function disposeStudioMatcapTexture(): void {
  if (!sharedStudioMatcap) return;
  sharedStudioMatcap.dispose();
  sharedStudioMatcap = null;
}

/**
 * Bakes a studio lighting sphere into a matcap texture for MeshMatcapMaterial.
 *
 * @param size Texture width and height in pixels.
 * @returns Configured DataTexture.
 */
export function bakeStudioMatcapTexture(size: number): THREE.DataTexture {
  const pixels = new Uint8Array(size * size * 4);
  fillStudioMatcapPixels(pixels, size);
  return createMatcapDataTexture(pixels, size);
}

/**
 * Evaluates studio lighting for a unit normal.
 *
 * @param normalX View-space normal X.
 * @param normalY View-space normal Y.
 * @param normalZ View-space normal Z (toward camera when face-on).
 * @returns Linear RGB in 0..peak.
 */
export function sampleStudioMatcapLighting(
  normalX: number,
  normalY: number,
  normalZ: number,
): { r: number; g: number; b: number } {
  return evaluateStudioSphereLighting(normalX, normalY, normalZ);
}

/**
 * Maps a matcap UV (Three.js sampling space) to a unit view normal for baking.
 * Matches meshmatcap.glsl: uv = vec2(dot(x,n), dot(y,n)) * 0.495 + 0.5 with
 * viewDir = (0,0,1) so x=(1,0,0), y=(0,1,0) and uv encodes n.xy.
 *
 * @param u Texture U 0..1.
 * @param v Texture V 0..1.
 * @returns Unit normal or null outside the matcap disk.
 */
export function matcapUvToViewNormal(u: number, v: number): THREE.Vector3 | null {
  const normalX = (u - 0.5) / MATCAP_UV_SCALE;
  const normalY = (v - 0.5) / MATCAP_UV_SCALE;
  const radiusSquared = normalX * normalX + normalY * normalY;
  if (radiusSquared > 1) {
    return null;
  }
  const normalZ = Math.sqrt(Math.max(0, 1 - radiusSquared));
  return new THREE.Vector3(normalX, normalY, normalZ);
}

/**
 * Writes studio-lit sphere samples into an RGBA pixel buffer.
 *
 * @param pixels Raw RGBA bytes.
 * @param size Texture edge length.
 */
function fillStudioMatcapPixels(pixels: Uint8Array, size: number): void {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      writeStudioMatcapPixel(pixels, size, x, y);
    }
  }
}

/**
 * Writes one matcap texel for Three.js MeshMatcapMaterial UV mapping.
 *
 * @param pixels Raw RGBA bytes.
 * @param size Texture edge length.
 * @param x Pixel column.
 * @param y Pixel row (0 = bottom of DataTexture / V = 0).
 */
function writeStudioMatcapPixel(pixels: Uint8Array, size: number, x: number, y: number): void {
  const index = (y * size + x) * 4;
  const u = size <= 1 ? 0.5 : x / (size - 1);
  const v = size <= 1 ? 0.5 : y / (size - 1);
  const normal = matcapUvToViewNormal(u, v);
  if (!normal) {
    writeOutsideSpherePixel(pixels, index);
    return;
  }
  const rgb = evaluateStudioSphereLighting(normal.x, normal.y, normal.z);
  pixels[index] = linearChannelToByte(rgb.r);
  pixels[index + 1] = linearChannelToByte(rgb.g);
  pixels[index + 2] = linearChannelToByte(rgb.b);
  pixels[index + 3] = 255;
}

/**
 * Fills texels outside the matcap sphere with a dark neutral.
 *
 * @param pixels Raw RGBA bytes.
 * @param index RGBA start index.
 */
function writeOutsideSpherePixel(pixels: Uint8Array, index: number): void {
  pixels[index] = 22;
  pixels[index + 1] = 22;
  pixels[index + 2] = 26;
  pixels[index + 3] = 255;
}

/**
 * Evaluates studio matcap lighting for a unit sphere normal in the same space
 * Three.js uses for matcap UVs (face-on = +Z).
 *
 * @param normalX View-space normal X.
 * @param normalY View-space normal Y.
 * @param normalZ View-space normal Z toward the camera at sphere center.
 * @returns Linear RGB in 0..peak.
 */
function evaluateStudioSphereLighting(
  normalX: number,
  normalY: number,
  normalZ: number,
): { r: number; g: number; b: number } {
  const facingAmount = Math.max(0, normalZ);
  const studioLuminance = evaluateStudioSculptLuminance(normalX, normalY, normalZ, facingAmount);
  const unlitBlend = Math.pow(facingAmount, STUDIO_MATCAP_UNLIT_BLEND_POWER);
  const luminance = clamp01(studioLuminance * (1 - unlitBlend) + STUDIO_MATCAP_PEAK * unlitBlend);
  return {
    r: luminance,
    g: luminance,
    b: luminance,
  };
}

/**
 * Builds sculpted studio lighting for angled surfaces (key + fill + soft
 * shadow). Directions are in view/matcap space so they track the camera with
 * the matcap.
 *
 * @param normalX View-space normal X.
 * @param normalY View-space normal Y.
 * @param normalZ View-space normal Z.
 * @param facingAmount Camera-facing amount 0..1.
 * @returns Linear luminance before face-on unlit blend.
 */
function evaluateStudioSculptLuminance(
  normalX: number,
  normalY: number,
  normalZ: number,
  facingAmount: number,
): number {
  const keyLighting = clampedLambert(normalX, normalY, normalZ, 0.45, 0.55, 0.7) * 0.55;
  const fillLighting = clampedLambert(normalX, normalY, normalZ, -0.55, 0.25, 0.45) * 0.22;
  const topFill = clampedLambert(normalX, normalY, normalZ, 0.1, 0.85, 0.35) * 0.12;
  const wrap = Math.pow(facingAmount, 1.25) * 0.2;
  const silhouette = Math.pow(1 - facingAmount, 1.4) * 0.08;
  const luminance = STUDIO_MATCAP_EDGE_FLOOR + keyLighting + fillLighting + topFill + wrap - silhouette;
  return clamp01(Math.min(0.9, luminance));
}

/**
 * Clamped Lambert term for a light direction.
 *
 * @param normalX Normal X.
 * @param normalY Normal Y.
 * @param normalZ Normal Z.
 * @param lightX Light direction X.
 * @param lightY Light direction Y.
 * @param lightZ Light direction Z.
 * @returns Clamped N·L in 0..1.
 */
function clampedLambert(
  normalX: number,
  normalY: number,
  normalZ: number,
  lightX: number,
  lightY: number,
  lightZ: number,
): number {
  const lightLength = Math.hypot(lightX, lightY, lightZ) || 1;
  const normalizedLightX = lightX / lightLength;
  const normalizedLightY = lightY / lightLength;
  const normalizedLightZ = lightZ / lightLength;
  return Math.max(0, normalX * normalizedLightX + normalY * normalizedLightY + normalZ * normalizedLightZ);
}

/**
 * Clamps a value to 0..1.
 *
 * @param value Input.
 * @returns Clamped value.
 */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Converts a linear 0..1 channel to an 8-bit gamma-encoded byte.
 *
 * @param channel Linear channel.
 * @returns Byte 0..255.
 */
function linearChannelToByte(channel: number): number {
  const gammaEncoded = Math.pow(clamp01(channel), 1 / 2.2);
  return Math.round(gammaEncoded * 255);
}

/**
 * Wraps baked RGBA bytes as a Three.js matcap DataTexture.
 *
 * @param pixels Raw RGBA bytes.
 * @param size Texture edge length.
 * @returns DataTexture configured for MeshMatcapMaterial.
 */
function createMatcapDataTexture(pixels: Uint8Array, size: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.flipY = false;
  texture.needsUpdate = true;
  texture.name = 'studio_matcap';
  return texture;
}
