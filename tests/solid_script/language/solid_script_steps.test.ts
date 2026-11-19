import { describe, expect, it } from 'vitest';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import { solidScriptShapeLeafCount } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';

/**
 * Script with shapes on known lines and a Repeat, so steps can be counted per
 * line.
 */
const SOLID_SCRIPT_STEPS = solidScriptDocumentCreate([
  { command: 'cube' },
  { command: 'translate', values: { v: '3, 0, 0' } },
  { command: 'sphere' },
  { command: 'end' },
  { command: 'repeat', values: { variable: 'i', from: '0', to: '2' } },
  { command: 'translate', values: { v: '0, [=3 * [i]], 0' } },
  { command: 'cylinder', values: { h: '1', r1: '0.5', r2: '0.5' } },
  { command: 'end' },
  { command: 'end' },
  { command: 'cube', values: { size: '2, 2, 2' } },
  { command: 'cube', values: { size: '1, 1, 3', mode: 'Subtractive' } },
]);

/**
 * Counts the leaves of every top-level shape.
 *
 * @param stepLimit Steps to run, or undefined for the whole script.
 * @returns Leaf count.
 */
function leavesAfter(stepLimit?: number): number {
  const { shapes } = solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS, stepLimit === undefined ? {} : { stepLimit });
  return shapes.reduce((sum, shape) => sum + solidScriptShapeLeafCount(shape), 0);
}

describe('solid script steps', () => {
  it('records the block line of every shape in run order, a Repeat repeating its lines', () => {
    expect(solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS).steps).toEqual([1, 3, 7, 7, 7, 10, 11]);
  });

  it('builds only the first steps when limited, while still listing every step', () => {
    const full = solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS);
    for (let limit = 0; limit <= full.steps.length; limit++) {
      expect(leavesAfter(limit)).toBe(limit);
      expect(solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS, { stepLimit: limit }).steps).toEqual(full.steps);
    }
    expect(leavesAfter()).toBe(full.steps.length);
  });

  it('shows a partly built later cube when the step limit stops before the next one', () => {
    const last = solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS, { stepLimit: 6 }).shapes.at(-1);
    expect(last?.kind).toBe('solid');
  });

  it('reports the variables visible at the last built step, counters included', () => {
    const script = solidScriptDocumentCreate([
      { command: 'variable', values: { name: 'width', value: '2' } },
      { command: 'repeat', values: { variable: 'i', from: '0', to: '2' } },
      { command: 'translate', values: { v: '[=[width] * [i]], 0, 0' } },
      { command: 'cube', values: { size: '[width]' } },
      { command: 'end' },
      { command: 'end' },
    ]);
    expect(solidScriptProgramEvaluate(script, { stepLimit: 2 }).variables).toEqual([
      { name: 'width', value: '2', type: 'Whole Number', items: [] },
      { name: 'i', value: '1', type: 'Whole Number', items: [] },
    ]);
    expect(solidScriptProgramEvaluate(script, { stepLimit: 0 }).variables).toEqual([]);
    expect(solidScriptProgramEvaluate(script).variables).toEqual([
      { name: 'width', value: '2', type: 'Whole Number', items: [] },
      { name: 'i', value: '2', type: 'Whole Number', items: [] },
    ]);
  });
});
