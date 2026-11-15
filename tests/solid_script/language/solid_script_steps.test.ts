import { describe, expect, it } from 'vitest';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import { solidScriptShapeLeafCount } from '@/solid_script/language/solid_script_shape.js';

/**
 * Program with one primitive per line and a loop, so steps can be counted per
 * line.
 */
const SOLID_SCRIPT_STEPS_PROGRAM = [
  'cube([1, 1, 1]);',
  'translate([3, 0, 0]) sphere(r = 1);',
  'for (i = [0 : 2]) translate([0, 3 * i, 0]) cylinder(h = 1, r = 0.5);',
  'difference() {',
  '  translate([0, 0, 5]) cube([2, 2, 2]);',
  '  translate([0.5, 0.5, 5]) cube([1, 1, 3]);',
  '}',
].join('\n');

/**
 * Counts the leaves of every top-level shape.
 *
 * @param stepLimit Steps to run, or undefined for the whole program.
 * @returns Leaf count.
 */
function leavesAfter(stepLimit?: number): number {
  const { shapes } = solidScriptProgramEvaluate(
    SOLID_SCRIPT_STEPS_PROGRAM,
    stepLimit === undefined ? {} : { stepLimit },
  );
  return shapes.reduce((sum, shape) => sum + solidScriptShapeLeafCount(shape), 0);
}

describe('solid script steps', () => {
  it('records the source line of every primitive in evaluation order, loops repeating their line', () => {
    const { steps } = solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS_PROGRAM);
    expect(steps).toEqual([1, 2, 3, 3, 3, 5, 6]);
  });

  it('builds only the first steps when limited, while still listing every step', () => {
    const full = solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS_PROGRAM);
    for (let limit = 0; limit <= full.steps.length; limit++) {
      expect(leavesAfter(limit)).toBe(limit);
      expect(solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS_PROGRAM, { stepLimit: limit }).steps).toEqual(full.steps);
    }
    expect(leavesAfter()).toBe(full.steps.length);
  });

  it('shows a partly evaluated difference as its first operand only', () => {
    const { shapes } = solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS_PROGRAM, { stepLimit: 6 });
    const last = shapes.at(-1);
    expect(last?.kind).toBe('boolean');
    if (last?.kind !== 'boolean') return;
    expect(last.operation).toBe('difference');
    expect(last.children).toHaveLength(1);
  });

  it('reports the variables visible at the last built step, loop counters included', () => {
    const program = 'width = 2;\nfor (i = [0 : 2]) translate([width * i, 0, 0]) cube(width);';
    expect(solidScriptProgramEvaluate(program, { stepLimit: 2 }).variables).toEqual([
      { name: 'width', value: '2' },
      { name: 'i', value: '1' },
    ]);
    expect(solidScriptProgramEvaluate(program, { stepLimit: 0 }).variables).toEqual([]);
    expect(solidScriptProgramEvaluate(program).variables).toEqual([
      { name: 'width', value: '2' },
      { name: 'i', value: '2' },
    ]);
  });
});
