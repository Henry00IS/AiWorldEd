import type * as THREE from 'three';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';

/** Minimum hex digits for auto hierarchy id suffixes. */
const MIN_HEX_DIGITS = 3;

/**
 * Maximum hex digits for auto id suffixes (FFFFF). Longer hand-typed tails are
 * not treated as allocator stream indices.
 */
const MAX_HEX_DIGITS = 5;

/** Largest sequential index that still formats within {@link MAX_HEX_DIGITS}. */
const MAX_SEQUENTIAL_INDEX = (1 << (MAX_HEX_DIGITS * 4)) - 1;

/** Hard cap on allocate retries so a corrupt stream can never spin forever. */
const MAX_ALLOCATE_ATTEMPTS = 64;

/** Odd mix constant (Murmur-style) for bijective multiply on 2^bits. */
const SCRAMBLE_MULT = 0x45d9f3b;

/** Xor mix constant for bijective scramble on 2^bits. */
const SCRAMBLE_XOR = 0x5bd1e995;

/**
 * Allocates unique hierarchy display names with scrambled hex suffixes. Tracks
 * occupied names, advances a sequential stream bijectively for indices up to
 * FFFFF, and ignores hand-typed hex tails outside the 3–5 digit policy so the
 * stream cannot explode.
 */
export class HierarchyNameAllocator {
  private nextIndex: number;
  private readonly usedNames: Set<string>;

  /** Creates an empty allocator starting at sequential index 1. */
  constructor() {
    this.nextIndex = 1;
    this.usedNames = new Set();
  }

  /**
   * Allocates the next unique name for a type base (for example "Brush"). Auto
   * hex-suffix logic only runs while the sequential index is within the 3–5
   * digit range; past that the suffix scheme is a no-op and the bare base (or a
   * plain underscore id) is used instead.
   *
   * @param base Name stem without a hex suffix.
   * @returns Full unique name such as Brush.A3F.
   */
  allocate(base: string): string {
    const stem = sanitizeNameBase(base);
    if (this.nextIndex > MAX_SEQUENTIAL_INDEX) {
      return this.reserveWithoutHexSuffix(stem);
    }
    for (let attempt = 0; attempt < MAX_ALLOCATE_ATTEMPTS; attempt++) {
      if (this.nextIndex > MAX_SEQUENTIAL_INDEX) {
        return this.reserveWithoutHexSuffix(stem);
      }
      const suffix = formatHierarchyHexIndex(this.nextIndex);
      this.nextIndex += 1;
      const name = `${stem}.${suffix}`;
      if (this.usedNames.has(name)) {
        continue;
      }
      this.usedNames.add(name);
      return name;
    }
    return this.reserveWithoutHexSuffix(stem);
  }

  /**
   * Allocates a unique name using the type base extracted from an existing
   * name.
   *
   * @param sourceName Source object display name.
   * @returns New unique name with a fresh global hex suffix.
   */
  allocateFromSourceName(sourceName: string): string {
    return this.allocate(extractHierarchyNameBase(sourceName));
  }

  /**
   * Records an existing scene name and advances the stream past its sequential
   * index when the suffix is a valid auto-id (3–5 hex digits).
   *
   * @param name Existing hierarchy name.
   */
  noteExistingName(name: string): void {
    if (!name) {
      return;
    }
    this.usedNames.add(name);
    const sequential = sequentialIndexFromHierarchyName(name);
    if (sequential === null) {
      return;
    }
    if (sequential >= this.nextIndex) {
      this.nextIndex = Math.min(sequential + 1, MAX_SEQUENTIAL_INDEX + 1);
    }
  }

  /**
   * Clears allocator state and records every hierarchy-named object's name
   * under the given root.
   *
   * @param world Hierarchy root to traverse.
   */
  rebuildFromWorld(world: THREE.Object3D): void {
    this.reset();
    world.traverse((object) => {
      if (!isHierarchyNamedObject(object)) {
        return;
      }
      this.noteExistingName(object.name);
    });
  }

  /** Clears used names and resets the stream to sequential index 1. */
  reset(): void {
    this.usedNames.clear();
    this.nextIndex = 1;
  }

  /**
   * Reserves a name without auto hex-suffix logic (stream exhausted or retry
   * budget spent). Prefers the bare stem, then plain underscore ids.
   *
   * @param stem Sanitized type base.
   * @returns Reserved unique name.
   */
  private reserveWithoutHexSuffix(stem: string): string {
    if (!this.usedNames.has(stem)) {
      this.usedNames.add(stem);
      return stem;
    }
    for (let ordinal = 2; ordinal <= MAX_ALLOCATE_ATTEMPTS + 1; ordinal++) {
      const name = `${stem}_${ordinal}`;
      if (this.usedNames.has(name)) {
        continue;
      }
      this.usedNames.add(name);
      return name;
    }
    const fallback = `${stem}_${this.usedNames.size + 1}`;
    this.usedNames.add(fallback);
    return fallback;
  }
}

/** Shared process-wide HierarchyNameAllocator instance. */
export const hierarchyNameAllocator = new HierarchyNameAllocator();

/**
 * Formats a sequential index as scrambled uppercase hex, padded to 3–5 digits.
 *
 * @param index Positive sequential index.
 * @returns Hex suffix string without a leading dot.
 */
export function formatHierarchyHexIndex(index: number): string {
  const sequential = clampSequentialIndex(index);
  const digits = hexDigitsForIndex(sequential);
  const bits = digits * 4;
  const scrambled = scrambleHierarchyIndex(sequential, bits);
  return scrambled.toString(16).toUpperCase().padStart(digits, '0');
}

/**
 * Parses a trailing ".<hex>" suffix to its display integer (not sequential).
 * Only 3–5 digit auto-id suffixes are accepted so hand-typed junk cannot
 * explode digit math.
 *
 * @param name Full object name.
 * @returns Display hex value, or null when absent or out of policy.
 */
export function parseHierarchyHexSuffix(name: string): number | null {
  const suffix = extractAutoHierarchyHexSuffix(name);
  if (suffix === null) {
    return null;
  }
  return parseInt(suffix, 16);
}

/**
 * Recovers the sequential allocation index from a hierarchy name's hex suffix.
 *
 * @param name Full object name.
 * @returns Sequential index, or null when no valid auto-id suffix is present.
 */
export function sequentialIndexFromHierarchyName(name: string): number | null {
  const suffix = extractAutoHierarchyHexSuffix(name);
  if (suffix === null) {
    return null;
  }
  return sequentialIndexFromHierarchyHexSuffix(suffix);
}

/**
 * Recovers sequential index from a stored auto-id hex suffix (3–5 digits).
 *
 * @param suffixHex Hex digits only (no leading dot).
 * @returns Sequential index clamped to the supported range.
 */
export function sequentialIndexFromHierarchyHexSuffix(suffixHex: string): number {
  const digits = suffixHex.length;
  if (digits < MIN_HEX_DIGITS || digits > MAX_HEX_DIGITS) {
    return 0;
  }
  const bits = digits * 4;
  const display = parseInt(suffixHex, 16);
  if (!Number.isFinite(display)) {
    return 0;
  }
  const sequential = unscrambleHierarchyIndex(display, bits);
  return clampSequentialIndex(sequential);
}

/**
 * How many hex digits to use for sequential index n (clamped 3–5).
 *
 * @param n Sequential index (≥ 1).
 * @returns Digit count.
 */
export function hexDigitsForIndex(n: number): number {
  const sequential = clampSequentialIndex(n);
  if (sequential <= 0) {
    return MIN_HEX_DIGITS;
  }
  const needed = Math.floor(Math.log2(sequential) / 4) + 1;
  return Math.min(MAX_HEX_DIGITS, Math.max(MIN_HEX_DIGITS, needed));
}

/**
 * Scrambles a sequential index into a same-width pseudo-random value.
 *
 * @param index Sequential index.
 * @param bits Bit width of the ring (multiple of 4, ≤ 20 for 5 hex digits).
 * @returns Scrambled value in 0..(2^bits-1).
 */
export function scrambleHierarchyIndex(index: number, bits: number): number {
  const safeBits = clampBitWidth(bits);
  const mask = bitsMask(safeBits);
  const mult = (SCRAMBLE_MULT & mask) | 1;
  const xork = SCRAMBLE_XOR & mask;
  return ((Math.imul(index, mult) ^ xork) >>> 0) & mask;
}

/**
 * Recovers the sequential index from a scrambled same-width display value.
 *
 * @param display Scrambled display value.
 * @param bits Bit width used when scrambling.
 * @returns Original sequential index on that ring.
 */
export function unscrambleHierarchyIndex(display: number, bits: number): number {
  const safeBits = clampBitWidth(bits);
  const mask = bitsMask(safeBits);
  const mult = (SCRAMBLE_MULT & mask) | 1;
  const xork = SCRAMBLE_XOR & mask;
  const inv = modInverseOdd(mult, safeBits);
  return (Math.imul((display ^ xork) >>> 0, inv) >>> 0) & mask;
}

/**
 * Strips a trailing hex suffix from a name and returns the type base stem.
 *
 * @param name Full or bare object name.
 * @returns Base stem (defaults to Object when empty).
 */
export function extractHierarchyNameBase(name: string): string {
  const match = /^(.*)\.([0-9A-Fa-f]+)$/.exec(name);
  if (match && match[1]!.length > 0) {
    return match[1]!;
  }
  return sanitizeNameBase(name);
}

/**
 * Returns whether an object should occupy a hierarchy display name slot.
 *
 * @param object Scene object under the world root.
 * @returns False for unnamed helpers and solid result meshes.
 */
export function isHierarchyNamedObject(object: THREE.Object3D): boolean {
  if (!object.name) {
    return false;
  }
  if (isResultMesh(object)) {
    return false;
  }
  return true;
}

/**
 * Extracts a trailing auto-id hex suffix only when length is within policy (3–5
 * digits). Longer junk is ignored for stream math.
 *
 * @param name Full object name.
 * @returns Suffix hex digits, or null when not an auto-id.
 */
function extractAutoHierarchyHexSuffix(name: string): string | null {
  const match = /\.([0-9A-Fa-f]+)$/.exec(name);
  if (!match) {
    return null;
  }
  const suffix = match[1]!;
  if (suffix.length < MIN_HEX_DIGITS || suffix.length > MAX_HEX_DIGITS) {
    return null;
  }
  return suffix;
}

/**
 * Clamps a sequential index into the supported positive allocator range.
 *
 * @param index Candidate index.
 * @returns Value in 1..MAX_SEQUENTIAL_INDEX.
 */
function clampSequentialIndex(index: number): number {
  if (!Number.isFinite(index)) {
    return 1;
  }
  const floored = Math.floor(index);
  if (floored < 1) {
    return 1;
  }
  if (floored > MAX_SEQUENTIAL_INDEX) {
    return MAX_SEQUENTIAL_INDEX;
  }
  return floored;
}

/**
 * Clamps scramble bit width to the supported auto-id range.
 *
 * @param bits Requested bit width.
 * @returns Width in [12, 20].
 */
function clampBitWidth(bits: number): number {
  if (!Number.isFinite(bits)) {
    return MIN_HEX_DIGITS * 4;
  }
  const floored = Math.floor(bits);
  if (floored < MIN_HEX_DIGITS * 4) {
    return MIN_HEX_DIGITS * 4;
  }
  if (floored > MAX_HEX_DIGITS * 4) {
    return MAX_HEX_DIGITS * 4;
  }
  return floored;
}

/**
 * Bit mask for a ring of the given width.
 *
 * @param bits Bit width 1..32.
 * @returns Mask with that many low bits set.
 */
function bitsMask(bits: number): number {
  if (bits >= 32) {
    return 0xffffffff;
  }
  return (1 << bits) - 1;
}

/**
 * Modular inverse of an odd integer modulo 2^bits (Newton iteration).
 *
 * @param oddValue Odd multiplier on the ring.
 * @param bits Bit width of the ring.
 * @returns Multiplicative inverse modulo 2^bits.
 */
function modInverseOdd(oddValue: number, bits: number): number {
  const mask = bitsMask(bits);
  let inverse = 1;
  for (let iteration = 0; iteration < 6; iteration++) {
    const product = Math.imul(oddValue, inverse) >>> 0;
    inverse = (Math.imul(inverse, (2 - product) | 0) >>> 0) & mask;
  }
  return inverse;
}

/**
 * Normalizes a user-facing name base.
 *
 * @param base Raw base string.
 * @returns Non-empty stem.
 */
function sanitizeNameBase(base: string): string {
  const trimmed = base.trim();
  return trimmed.length > 0 ? trimmed : 'Object';
}
