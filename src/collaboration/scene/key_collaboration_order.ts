/** Digits of the base-62 fractional order keys, in ascending order. */
export const ORDER_KEY_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Number of digits in the order key alphabet. */
const ORDER_KEY_BASE = ORDER_KEY_DIGITS.length;

/** Longest order key accepted from the network. */
export const ORDER_KEY_LENGTH_MAXIMUM = 512;

/** Valid order key: base-62 digits, never ending in the zero digit. */
const ORDER_KEY_PATTERN = /^[0-9A-Za-z]*[1-9A-Za-z]$/;

/**
 * Returns whether a value is a well-formed order key.
 *
 * @param value Candidate key.
 * @returns True for non-empty base-62 keys without a trailing zero digit.
 */
export function orderKeyValid(value: unknown): value is string {
  return typeof value === 'string' && value.length <= ORDER_KEY_LENGTH_MAXIMUM && ORDER_KEY_PATTERN.test(value);
}

/**
 * Returns the numeric value of one key digit.
 *
 * @param key Key string.
 * @param index Digit position.
 * @returns Digit value, or zero past the end of the key.
 */
function orderDigitAt(key: string, index: number): number {
  const character = key.charAt(index);
  return character === '' ? 0 : ORDER_KEY_DIGITS.indexOf(character);
}

/**
 * Computes a key strictly between two keys (fractional indexing midpoint).
 *
 * @param low Lower bound ('' for none); must be below high.
 * @param high Upper bound, or null for none.
 * @returns Key strictly between the bounds without a trailing zero digit.
 */
function orderMidpoint(low: string, high: string | null): string {
  if (high !== null) {
    let shared = 0;
    while (shared < high.length && (low.charAt(shared) || '0') === high.charAt(shared)) shared += 1;
    if (shared > 0) return high.slice(0, shared) + orderMidpoint(low.slice(shared), high.slice(shared));
  }
  const digitLow = orderDigitAt(low, 0);
  const digitHigh = high === null ? ORDER_KEY_BASE : orderDigitAt(high, 0);
  if (digitHigh - digitLow > 1) return ORDER_KEY_DIGITS.charAt(Math.round((digitLow + digitHigh) / 2));
  if (high !== null && high.length > 1) return high.slice(0, 1);
  return ORDER_KEY_DIGITS.charAt(digitLow) + orderMidpoint(low.slice(1), null);
}

/**
 * Returns a key directly after another, growing about one digit per 61
 * consecutive appends.
 *
 * @param low Key to follow.
 * @returns Key greater than low.
 */
function orderKeyAfter(low: string): string {
  const last = orderDigitAt(low, low.length - 1);
  if (last < ORDER_KEY_BASE - 1) return low.slice(0, -1) + ORDER_KEY_DIGITS.charAt(last + 1);
  return low + ORDER_KEY_DIGITS.charAt(1);
}

/**
 * Returns a key directly before another.
 *
 * @param high Key to precede.
 * @returns Key smaller than high.
 */
function orderKeyBefore(high: string): string {
  const last = orderDigitAt(high, high.length - 1);
  if (last > 1) return high.slice(0, -1) + ORDER_KEY_DIGITS.charAt(last - 1);
  return high.slice(0, -1) + ORDER_KEY_DIGITS.charAt(0) + ORDER_KEY_DIGITS.charAt(ORDER_KEY_BASE - 1);
}

/**
 * Returns a key strictly between two neighbours. Bounds that are out of order
 * are treated as an open upper bound.
 *
 * @param low Key of the previous sibling, or null at the start.
 * @param high Key of the next sibling, or null at the end.
 * @returns New key that sorts between the neighbours.
 */
export function orderKeyBetween(low: string | null, high: string | null): string {
  if (low !== null && high !== null && low >= high) return orderKeyAfter(low);
  if (high === null) return low === null ? ORDER_KEY_DIGITS.charAt(ORDER_KEY_BASE / 2) : orderKeyAfter(low);
  if (low === null) return orderKeyBefore(high);
  return orderMidpoint(low, high);
}

/**
 * Returns several ascending keys between two neighbours, splitting the range
 * evenly so key length grows only logarithmically.
 *
 * @param low Lower neighbour key, or null.
 * @param high Upper neighbour key, or null.
 * @param count Number of keys to create.
 * @returns Ascending keys strictly between the neighbours.
 */
export function orderKeysBetween(low: string | null, high: string | null, count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return [orderKeyBetween(low, high)];
  const middle = orderKeyBetween(low, high);
  const leftCount = Math.floor((count - 1) / 2);
  const left = orderKeysBetween(low, middle, leftCount);
  const right = orderKeysBetween(middle, high, count - 1 - leftCount);
  return [...left, middle, ...right];
}

/**
 * Returns evenly spaced fixed-width keys for an initial sibling list.
 *
 * @param count Number of siblings.
 * @returns Ascending keys.
 */
export function orderKeysInitial(count: number): string[] {
  let width = 1;
  while (Math.pow(ORDER_KEY_BASE, width) < 2 * (count + 1)) width += 1;
  const span = Math.pow(ORDER_KEY_BASE, width);
  const keys: string[] = [];
  for (let index = 0; index < count; index++) {
    keys.push(orderKeyEncodeFixed(Math.floor(((index + 1) * span) / (count + 1)), width));
  }
  return keys;
}

/**
 * Encodes an integer as a fixed-width base-62 key without trailing zeros.
 *
 * @param value Non-negative integer below base^width (and above zero).
 * @param width Number of digits.
 * @returns Encoded key.
 */
function orderKeyEncodeFixed(value: number, width: number): string {
  let remaining = value;
  let digits = '';
  for (let index = 0; index < width; index++) {
    digits = ORDER_KEY_DIGITS.charAt(remaining % ORDER_KEY_BASE) + digits;
    remaining = Math.floor(remaining / ORDER_KEY_BASE);
  }
  return digits.replace(/0+$/, '');
}

/**
 * Compares two ordered siblings by key, then id, giving a deterministic total
 * order even when two users picked the same key.
 *
 * @param keyA Key of the first sibling.
 * @param idA Id of the first sibling.
 * @param keyB Key of the second sibling.
 * @param idB Id of the second sibling.
 * @returns Negative, zero or positive like Array.prototype.sort comparators.
 */
export function orderCompare(keyA: string, idA: string, keyB: string, idB: string): number {
  if (keyA !== keyB) return keyA < keyB ? -1 : 1;
  if (idA === idB) return 0;
  return idA < idB ? -1 : 1;
}
