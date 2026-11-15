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
  { command: 'difference' },
  { command: 'cube', values: { size: '2, 2, 2' } },
  { command: 'cube', values: { size: '1, 1, 3' } },
  { command: 'end' },
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
    expect(solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS).steps).toEqual([1, 3, 7, 7, 7, 11, 12]);
  });

  it('builds only the first steps when limited, while still listing every step', () => {
    const full = solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS);
    for (let limit = 0; limit <= full.steps.length; limit++) {
      expect(leavesAfter(limit)).toBe(limit);
      expect(solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS, { stepLimit: limit }).steps).toEqual(full.steps);
    }
    expect(leavesAfter()).toBe(full.steps.length);
  });

  it('shows a partly built difference as its first shape only', () => {
    const last = solidScriptProgramEvaluate(SOLID_SCRIPT_STEPS, { stepLimit: 6 }).shapes.at(-1);
    expect(last?.kind === 'boolean' && last.operation).toBe('difference');
    if (last?.kind !== 'boolean') return;
    expect(last.children).toHaveLength(1);
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
      { name: 'width', value: '2' },
      { name: 'i', value: '1' },
    ]);
    expect(solidScriptProgramEvaluate(script, { stepLimit: 0 }).variables).toEqual([]);
    expect(solidScriptProgramEvaluate(script).variables).toEqual([
      { name: 'width', value: '2' },
      { name: 'i', value: '2' },
    ]);
  });
});
