/** Steps per unit a place is rounded to before it gives an Id. */
const SOLID_SCRIPT_MEMBER_ID_STEPS = 10000;

/** Ids run from 0 up to, not including, this. */
const SOLID_SCRIPT_MEMBER_ID_RANGE = 1000000;

/**
 * Works out the Id of an item from where it is: the same numbers always give
 * the same whole number, so deleting or reordering other items keeps it.
 *
 * @param numbers Place of the item, and the way it faces when it has one.
 * @returns Whole number from 0 up to a million.
 */
export function solidScriptMemberIdOf(numbers: readonly number[]): number {
  let state = 0x811c9dc5;
  for (const number of numbers) {
    const step = Math.round(number * SOLID_SCRIPT_MEMBER_ID_STEPS) | 0;
    state = Math.imul(state ^ step, 0x01000193);
    state = Math.imul(state ^ (state >>> 15), 0x2c1b3c6d);
  }
  return ((state ^ (state >>> 13)) >>> 0) % SOLID_SCRIPT_MEMBER_ID_RANGE;
}
