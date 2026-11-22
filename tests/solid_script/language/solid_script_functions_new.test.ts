import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';

/**
 * Evaluates a formula and returns its echoed text, or the error.
 *
 * @param formula Formula without [= ].
 * @returns Text.
 */
function formula(formula: string): string {
  const value = `[=${formula.replace(/([[\]])/g, '$$$1')}]`;
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([{ command: 'echo', values: { value } }, { command: 'cube' }]),
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

/**
 * Parses an echoed vector and rounds each component.
 *
 * @param text Echoed vector.
 * @returns Components.
 */
function vector(text: string): number[] {
  return text
    .slice(1, -1)
    .split(',')
    .map((part) => Math.round(Number(part) * 1e6) / 1e6 + 0);
}

describe('SolidScript formula helpers', () => {
  it('keeps Random numbers stable, and builds a vector from the same seeds per axis', () => {
    expect(formula('Random(2, 6, 42)')).toBe(formula('Random(2, 6, 42)'));
    expect(formula('Random([0, 0, 0], [1, 1, 1], 5)')).toBe(
      `[${formula('Random(0, 1, 5)')}, ${formula('Random(0, 1, 6)')}, ${formula('Random(0, 1, 7)')}]`,
    );
  });

  it('hashes a value, shuffles a list, and finds the nearest point', () => {
    expect(Number(formula('Hash(7, 1)'))).toBeGreaterThanOrEqual(0);
    expect(Number(formula('Hash(7, 1)'))).toBeLessThan(1);
    expect(formula('Hash(7, 1)')).toBe(formula('Hash(7, 1)'));
    expect(formula('Hash(7, 1)')).not.toBe(formula('Hash(8, 1)'));
    expect(formula('Shuffle([1, 2, 3, 4], 9)')).toBe(formula('Shuffle([1, 2, 3, 4], 9)'));
    expect(formula('Shuffle([1, 2, 3, 4], 9)').startsWith('[')).toBe(true);
    expect(formula('Nearest([[0, 0, 0], [4, 0, 0], [1, 0, 0]], [1.2, 0, 0])')).toBe('2');
  });

  it('gives smooth noise from 0 to 1, the same for the same seed', () => {
    const at = Number(formula('Noise(0.25, 0, 0, 1, 3)'));
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThanOrEqual(1);
    expect(formula('Noise(0.25, 0, 0, 1, 3)')).toBe(formula('Noise(0.25, 0, 0, 1, 3)'));
    expect(formula('Noise(0, 0, 0, 1, 3)')).not.toBe(formula('Noise(10, 0, 0, 1, 3)'));
  });

  it('samples, aims and trims a path by a fraction of its length', () => {
    const path = '[[0, 0, 0], [2, 0, 0], [2, 2, 0]]';
    expect(formula(`PathAt(${path}, 0)`)).toBe('[0, 0, 0]');
    expect(formula(`PathAt(${path}, 0.5)`)).toBe('[2, 0, 0]');
    expect(formula(`PathAt(${path}, 1)`)).toBe('[2, 2, 0]');
    expect(formula(`PathDirection(${path}, 0.25)`)).toBe('[1, 0, 0]');
    expect(formula(`PathDirection(${path}, 0.75)`)).toBe('[0, 1, 0]');
    expect(formula(`TrimPath(${path}, 0.25, 0.75)`)).toBe('[[1, 0, 0], [2, 0, 0], [2, 1, 0]]');
  });

  it('rotates, measures, projects and reflects vectors', () => {
    expect(vector(formula('RotateVector([1, 0, 0], [0, 1, 0], 90)'))).toEqual([0, 0, -1]);
    expect(formula('Angle([1, 0, 0], [0, 1, 0])')).toBe('90');
    expect(formula('ProjectOnPlane([1, 2, 0], [0, 0, 0], [0, 1, 0])')).toBe('[1, 0, 0]');
    expect(formula('Reflect([1, -1, 0], [0, 1, 0])')).toBe('[1, 1, 0]');
  });

  it('stops with a teaching hint when a direction is zero or a path is too short', () => {
    expect(formula('RotateVector([1, 0, 0], [0, 0, 0], 90)')).toMatch(/must not be 0, 0, 0|cannot use 0, 0, 0/);
    expect(formula('PathAt([[0, 0, 0]], 0.5)')).toMatch(/needs at least 2 points/);
    expect(formula('Nearest([], [0, 0, 0])')).toMatch(/needs a list of points/);
    expect(formula('Noise(0, 0, 0, 0, 1)')).toMatch(/scale greater than 0/);
  });
});
