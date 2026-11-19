/**
 * Axis an Anchor sets: X, Y and Z of a solid, or the X and the depth (the
 * drawing's Y, which runs to the back once extruded) of a flat outline.
 */
export type SolidScriptAnchorAxis = 'x' | 'y' | 'z' | 'depth';

/** Axes of the Anchor of a solid. */
export const SOLID_SCRIPT_ANCHOR_SOLID: readonly SolidScriptAnchorAxis[] = ['x', 'y', 'z'];

/** Axes of the Anchor of a flat outline. */
export const SOLID_SCRIPT_ANCHOR_FLAT: readonly SolidScriptAnchorAxis[] = ['x', 'depth'];

/** Axis of the Anchor of Linear Extrude: only its height. */
export const SOLID_SCRIPT_ANCHOR_HEIGHT: readonly SolidScriptAnchorAxis[] = ['y'];

/**
 * Words of each axis from its lowest side to its highest, with the editor's
 * axes: X runs right, Y up, Z to the front; a drawing's Y runs to the back.
 */
export const SOLID_SCRIPT_ANCHOR_WORDS: Readonly<Record<SolidScriptAnchorAxis, readonly string[]>> = {
  x: ['Left', 'Center', 'Right'],
  y: ['Bottom', 'Center', 'Top'],
  z: ['Back', 'Center', 'Front'],
  depth: ['Front', 'Center', 'Back'],
};

/** Caption of each axis in the configurator. */
export const SOLID_SCRIPT_ANCHOR_CAPTIONS: Readonly<Record<SolidScriptAnchorAxis, string>> = {
  x: 'X',
  y: 'Y',
  z: 'Z',
  depth: 'Y',
};

/**
 * The Anchor every shape starts with: Center, Bottom, Center for a solid, so it
 * stands on the origin; Center, Center for a flat outline, which has no Bottom
 * word; Bottom for Linear Extrude.
 *
 * @param axes Axes.
 * @returns Text, such as "Center, Bottom, Center".
 */
export function solidScriptAnchorDefault(axes: readonly SolidScriptAnchorAxis[]): string {
  return axes.map((axis) => (axis === 'y' ? 'Bottom' : 'Center')).join(', ');
}

/**
 * Reads an Anchor: one word per axis, separated by commas, in any case.
 *
 * @param text Text, such as "Center, Bottom, Back".
 * @param axes Axes.
 * @returns How far along each axis of the shape's box the origin sits, 0 at its
 *   lowest side, 0.5 in the middle and 1 at its highest; or the problem.
 */
export function solidScriptAnchorRead(text: string, axes: readonly SolidScriptAnchorAxis[]): number[] | string {
  const words = text.split(',').map((word) => word.trim().toLowerCase());
  const example = axes.map((axis) => SOLID_SCRIPT_ANCHOR_WORDS[axis][1]).join(', ');
  if (words.length !== axes.length)
    return `needs ${axes.length === 1 ? 'one word' : `${axes.length} words separated by commas`}, such as ${example}`;
  const fractions: number[] = [];
  for (const [index, axis] of axes.entries()) {
    const choices = SOLID_SCRIPT_ANCHOR_WORDS[axis];
    const found = choices.findIndex((choice) => choice.toLowerCase() === words[index]);
    if (found < 0) return `takes ${choices.join(', ')} for ${SOLID_SCRIPT_ANCHOR_CAPTIONS[axis]}`;
    fractions.push(found / 2);
  }
  return fractions;
}

/**
 * Lowest corner of a shape's box for its Anchor, so the anchored spot lands on
 * the origin.
 *
 * @param size Box size per axis.
 * @param fractions Anchor read by solidScriptAnchorRead.
 * @returns Lowest corner per axis.
 */
export function solidScriptAnchorMin(size: readonly number[], fractions: readonly number[]): number[] {
  return size.map((length, axis) => -length * (fractions[axis] ?? 0.5) + 0);
}
