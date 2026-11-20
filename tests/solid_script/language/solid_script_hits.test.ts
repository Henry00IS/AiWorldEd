import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import {
  solidScriptHitsAny,
  solidScriptHitsBoxFromCenterSize,
  solidScriptHitsHolds,
  solidScriptHitsHowOf,
  solidScriptHitsInside,
  solidScriptHitsOverlapping,
  solidScriptHitsTouching,
  solidScriptHitsUnion,
  type SolidScriptHitsBox,
} from '@/solid_script/language/solid_script_hits.js';

/** A unit box from -0.5 to 0.5 on every axis. */
const UNIT: SolidScriptHitsBox = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };

/**
 * Builds a box from a min corner and a size.
 *
 * @param min Least x, y, z.
 * @param size Width, height and depth.
 * @returns Box.
 */
function box(min: readonly number[], size: readonly number[]): SolidScriptHitsBox {
  return { min, max: min.map((start, axis) => start + (size[axis] ?? 0)) };
}

/**
 * Reads a variable from a script run.
 *
 * @param name Variable name.
 * @param lines Script.
 * @returns Value, or undefined.
 */
function variable(name: string, lines: Parameters<typeof solidScriptDocumentCreate>[0]): unknown {
  const run = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  expect(run.error, run.error == null ? '' : run.error.text).toBeFalsy();
  return run.variables.find((entry) => entry.name === name)?.value;
}

describe('SolidScript Hits and HitsBox', () => {
  it('reads How, with Touching when it is left off', () => {
    expect(solidScriptHitsHowOf(undefined)).toBe('Touching');
    expect(solidScriptHitsHowOf('')).toBe('Touching');
    expect(solidScriptHitsHowOf('touching')).toBe('Touching');
    expect(solidScriptHitsHowOf('Overlapping')).toBe('Overlapping');
    expect(solidScriptHitsHowOf('Fully Inside')).toBe('Fully Inside');
    expect(solidScriptHitsHowOf('Beside')).toBeUndefined();
  });

  it('builds a Center and Size box, including a uniform size', () => {
    expect(solidScriptHitsBoxFromCenterSize([0, 0, 0], [2, 4, 6])).toEqual({ min: [-1, -2, -3], max: [1, 2, 3] });
    expect(solidScriptHitsBoxFromCenterSize([1, 0, 0], [2])).toEqual({ min: [0, -1, -1], max: [2, 1, 1] });
  });

  it('tells Touching, Overlapping and Fully Inside apart at the limits', () => {
    const beside = box([0.5, -0.5, -0.5], [1, 1, 1]);
    expect(solidScriptHitsTouching(UNIT, beside)).toBe(true);
    expect(solidScriptHitsOverlapping(UNIT, beside)).toBe(false);
    expect(solidScriptHitsInside(UNIT, beside)).toBe(false);
    const corner = box([0.5, 0.5, 0.5], [1, 1, 1]);
    expect(solidScriptHitsTouching(UNIT, corner)).toBe(true);
    expect(solidScriptHitsOverlapping(UNIT, corner)).toBe(false);
    const apart = box([0.6, -0.5, -0.5], [1, 1, 1]);
    expect(solidScriptHitsTouching(UNIT, apart)).toBe(false);
    expect(solidScriptHitsOverlapping(UNIT, apart)).toBe(false);
    const overlap = box([0, -0.5, -0.5], [1, 1, 1]);
    expect(solidScriptHitsTouching(UNIT, overlap)).toBe(true);
    expect(solidScriptHitsOverlapping(UNIT, overlap)).toBe(true);
    expect(solidScriptHitsInside(UNIT, overlap)).toBe(false);
    const inside = box([-0.25, -0.25, -0.25], [0.5, 0.5, 0.5]);
    expect(solidScriptHitsHolds(inside, UNIT, 'Touching')).toBe(true);
    expect(solidScriptHitsHolds(inside, UNIT, 'Overlapping')).toBe(true);
    expect(solidScriptHitsHolds(inside, UNIT, 'Fully Inside')).toBe(true);
    expect(solidScriptHitsHolds(UNIT, UNIT, 'Fully Inside')).toBe(true);
    expect(solidScriptHitsHolds(UNIT, UNIT, 'Overlapping')).toBe(true);
    const point: SolidScriptHitsBox = { min: [0, 0, 0], max: [0, 0, 0] };
    expect(solidScriptHitsHolds(point, UNIT, 'Touching')).toBe(true);
    expect(solidScriptHitsHolds(point, UNIT, 'Overlapping')).toBe(false);
    expect(solidScriptHitsHolds(point, UNIT, 'Fully Inside')).toBe(true);
    const onFace: SolidScriptHitsBox = { min: [0.5, 0, 0], max: [0.5, 0, 0] };
    expect(solidScriptHitsHolds(onFace, UNIT, 'Touching')).toBe(true);
    expect(solidScriptHitsHolds(onFace, UNIT, 'Overlapping')).toBe(false);
    expect(solidScriptHitsHolds(onFace, UNIT, 'Fully Inside')).toBe(true);
  });

  it('rejects a list with the union first, then tests each target', () => {
    const left = box([-2, 0, 0], [1, 1, 1]);
    const right = box([2, 0, 0], [1, 1, 1]);
    const union = solidScriptHitsUnion([left, right]);
    expect(union).toEqual({ min: [-2, 0, 0], max: [3, 1, 1] });
    const mid = box([-0.25, 0, 0], [0.5, 1, 1]);
    expect(solidScriptHitsTouching(mid, union!)).toBe(true);
    expect(solidScriptHitsAny(mid, [left, right], 'Touching')).toBe(false);
    expect(solidScriptHitsAny(left, [left, right], 'Fully Inside')).toBe(true);
    expect(solidScriptHitsAny(mid, [left, right], 'Fully Inside')).toBe(false);
    const far = box([20, 0, 0], [1, 1, 1]);
    expect(solidScriptHitsAny(far, [left, right], 'Touching')).toBe(false);
  });

  it('tests tens of thousands of boxes in well under a tenth of a second', () => {
    const targets = Array.from({ length: 200 }, (_, index) => box([index * 3, 0, 0], [1, 1, 1]));
    const start = performance.now();
    let found = 0;
    for (let index = 0; index < 250; index += 1)
      if (solidScriptHitsAny(box([index * 3 + 0.1, 0, 0], [1, 1, 1]), targets, 'Touching')) found += 1;
    const elapsed = performance.now() - start;
    expect(found).toBe(200);
    expect(elapsed, `${elapsed} ms`).toBeLessThan(100);
  });

  it('tests two brushes that share a face, and one sitting inside a box', () => {
    const lines: SolidScriptLine[] = [
      { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center', into: 'Left' } },
      { command: 'transform', values: { move: '2, 0, 0' } },
      { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center', into: 'Right' } },
      { command: 'end', values: {} },
      { command: 'variable', values: { name: 'Touch', value: '[=Hits([Left], [Right])]' } },
      { command: 'variable', values: { name: 'Overlap', value: '[=Hits([Left], [Right], "Overlapping")]' } },
      { command: 'variable', values: { name: 'Inside', value: '[=Hits([Left], [Right], "Fully Inside")]' } },
      { command: 'variable', values: { name: 'InBox', value: '[=HitsBox([Left], Vector(0, 0, 0), 4)]' } },
    ];
    expect(variable('Touch', lines)).toBe('Yes');
    expect(variable('Overlap', lines)).toBe('No');
    expect(variable('Inside', lines)).toBe('No');
    expect(variable('InBox', lines)).toBe('Yes');
  });
});
