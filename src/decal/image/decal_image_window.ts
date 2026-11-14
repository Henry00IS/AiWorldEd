/**
 * Part of a texture a decal shows, for atlases and sprite sheets: a rectangle
 * in texture coordinates, with the image turned in quarter turns and mirrored
 * before it is fitted into the rectangle.
 */
export interface DecalImageWindow {
  /** Lowest texture u the decal shows. */
  minU: number;
  /** Lowest texture v the decal shows. */
  minV: number;
  /** Highest texture u the decal shows. */
  maxU: number;
  /** Highest texture v the decal shows. */
  maxV: number;
  /** Counter-clockwise quarter turns, 0 to 3. */
  quarterTurns: number;
  /** True mirrors the image left to right. */
  flipU: boolean;
  /** True mirrors the image top to bottom. */
  flipV: boolean;
}

/** Window showing the whole texture unturned. */
export const DECAL_IMAGE_WINDOW_WHOLE: DecalImageWindow = {
  minU: 0,
  minV: 0,
  maxU: 1,
  maxV: 1,
  quarterTurns: 0,
  flipU: false,
  flipV: false,
};

/**
 * Returns whether a window shows the whole texture unturned.
 *
 * @param window Image window.
 * @returns True when mapping it changes nothing.
 */
export function decalImageWindowIsWhole(window: DecalImageWindow): boolean {
  return (
    window.minU === 0 &&
    window.minV === 0 &&
    window.maxU === 1 &&
    window.maxV === 1 &&
    window.quarterTurns === 0 &&
    !window.flipU &&
    !window.flipV
  );
}

/**
 * Maps decal image coordinates, 0 to 1 across the decal box, into texture
 * coordinates of a window, in place. Coordinates outside 0 to 1, which unfolded
 * stickers reach, map outside the window and stay hidden.
 *
 * @param uvs Image coordinates, two floats per corner.
 * @param window Image window.
 */
export function decalImageWindowApply(uvs: Float32Array, window: DecalImageWindow): void {
  if (decalImageWindowIsWhole(window)) return;
  const width = window.maxU - window.minU;
  const height = window.maxV - window.minV;
  for (let index = 0; index < uvs.length; index += 2) {
    let u = uvs[index]! - 0.5;
    let v = uvs[index + 1]! - 0.5;
    if (window.flipU) u = -u;
    if (window.flipV) v = -v;
    for (let turn = 0; turn < window.quarterTurns; turn++) [u, v] = [-v, u];
    uvs[index] = window.minU + (u + 0.5) * width;
    uvs[index + 1] = window.minV + (v + 0.5) * height;
  }
}
