import type { CurvePreset, CurvePresetSection, CurvePresetStep } from './curve_preset.js';

/**
 * One block of a stacked preset: a straight piece over a height range with its
 * own section and rotation.
 */
export type CurvePresetStackBlock = CurvePresetSection & {
  /** Radius at the bottom of the block. */
  radius: number;
  /** Radius at the top of the block; the bottom radius when absent. */
  top?: number;
};

/**
 * Rounds a computed preset coordinate to the 0.01 editor grid.
 *
 * @param value Coordinate.
 * @returns Coordinate on the grid.
 */
export function curvePresetGrid(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Builds the profile of blocks stacked on a pole: each block is a straight
 * piece, and a gap between two blocks shows the pole.
 *
 * @param blocks Blocks bottom to top; the first starts at 0, the last ends at
 *   1.
 * @param pole Radius of the pole seen in gaps.
 * @returns Start height, steps and section ranges of the preset.
 */
export function curvePresetStack(
  blocks: readonly CurvePresetStackBlock[],
  pole: number,
): Pick<CurvePreset, 'start' | 'steps' | 'sections'> {
  const steps: CurvePresetStep[] = [];
  const last = { x: 0, y: blocks[0]?.radius ?? 0 };
  const lineTo = (x: number, y: number): void => {
    if (x === last.x && y === last.y) return;
    steps.push(['L', x, y]);
    Object.assign(last, { x, y });
  };
  blocks.forEach((block) => {
    if (block.from > last.x) [last.x, block.from].forEach((x) => lineTo(x, pole));
    lineTo(block.from, block.radius);
    lineTo(block.to, block.top ?? block.radius);
  });
  return { start: blocks[0]?.radius ?? 0, steps, sections: blocks.map(({ radius, top, ...section }) => section) };
}
