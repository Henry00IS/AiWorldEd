import type { PhysicsShatterInput, PhysicsShatterSettings } from './physics_shatter_types.js';
import { PHYSICS_SHATTER_FRACTURE_VERSION } from './physics_shatter_fracture_version.js';

/** Grid that input coordinates snap to before hashing, in metres. */
const PHYSICS_SHATTER_HASH_GRID = 1e-4;

/** Two independent 32-bit FNV-1a states. */
export class PhysicsShatterHasher {
  private low = 0x811c9dc5;
  private high = 0x01000193 ^ 0x5bd1e995;

  /**
   * Mixes a string into both states.
   *
   * @param text Text to mix.
   */
  text(text: string): void {
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      this.low = Math.imul(this.low ^ code, 0x01000193) >>> 0;
      this.high = Math.imul(this.high ^ code, 0x01000193 ^ 0x2c1b3c6d) >>> 0;
    }
  }

  /**
   * Mixes a number snapped to the hash grid.
   *
   * @param value Number to mix.
   */
  number(value: number): void {
    this.text(`${Math.round(value / PHYSICS_SHATTER_HASH_GRID)};`);
  }

  /**
   * Returns the combined digest.
   *
   * @returns Sixteen hexadecimal characters.
   */
  digest(): string {
    return this.low.toString(16).padStart(8, '0') + this.high.toString(16).padStart(8, '0');
  }
}

/**
 * Hashes everything a fracture depends on: the fracture algorithm version, the
 * seed, the fracture settings and every input brush's geometry in the modifier
 * frame. A stored bake is only valid while this hash stays the same.
 *
 * @param inputs Fracture inputs in a stable order.
 * @param settings Fracture settings.
 * @param fractureVersion Fracture algorithm version; the current one by
 *   default.
 * @returns Sixteen hexadecimal characters.
 */
export function physicsShatterInputHash(
  inputs: readonly PhysicsShatterInput[],
  settings: PhysicsShatterSettings,
  fractureVersion: number = PHYSICS_SHATTER_FRACTURE_VERSION,
): string {
  const hasher = new PhysicsShatterHasher();
  hasher.text(`v${fractureVersion}|`);
  physicsShatterHashSettings(hasher, settings);
  for (const input of inputs) {
    hasher.text(`|${input.sourceBrushId}|${input.operation ?? 0}|${input.brush.faces.length}|`);
    for (const vertex of input.brush.vertices) for (const value of vertex.toArray()) hasher.number(value);
  }
  return hasher.digest();
}

/**
 * Mixes the fracture settings; blast settings are not part of the fracture.
 *
 * @param hasher Hash state.
 * @param settings Fracture settings.
 */
function physicsShatterHashSettings(hasher: PhysicsShatterHasher, settings: PhysicsShatterSettings): void {
  hasher.text(`${settings.mode}|${settings.seed}|${settings.maxPieces}|`);
  hasher.text(`${settings.cracks}|${settings.thicknessAxis}|${settings.radialSpokes}|`);
  const lengths = [settings.crackSize, settings.impactDetail, settings.impactRadius, settings.brickLength];
  lengths.push(settings.brickHeight, settings.mortarGap, settings.brickJitter, ...settings.impactPoint.toArray());
  for (const value of lengths) hasher.number(value);
}
