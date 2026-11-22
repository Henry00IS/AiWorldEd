import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Evaluates one formula and returns what Echo prints, or the error.
 *
 * @param formula Formula without [= ].
 * @returns Printed value.
 */
function formula(formula: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'echo', values: { value: `[=${formula}]` } },
      { command: 'cube', values: {} },
    ]),
    {},
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

/**
 * Samples a formula with [P] along a row of points and returns the numbers.
 *
 * @param make Formula maker given a position formula.
 * @returns Values.
 */
function row(make: (position: string) => string): number[] {
  return Array.from({ length: 40 }, (_, index) =>
    Number(formula(make(`Vector(${index * 0.37}, 0.5, ${index * 0.21})`))),
  );
}

describe('Noise', () => {
  it('takes one position vector, a scale and a seed, from 0 to 1', () => {
    const values = row((p) => `Noise(${p}, 2, 1)`);
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(30);
    expect(formula('Noise(Vector(1, 2, 3), 2, 1)')).toBe(formula('Noise(Vector(1, 2, 3), 2, 1)'));
  });

  it('stops on the old x, y, z form with a hint to the vector form', () => {
    expect(formula('Noise(1, 2, 3, 1, 0)')).toContain('needs a Vector for Position');
  });

  it('adds finer layers with Detail, rougher with Roughness', () => {
    const fine = (detail: number) =>
      Array.from({ length: 200 }, (_, index) =>
        Number(formula(`Noise(Vector(${index * 0.01}, 0.5, 0.3), 2, 1, ${detail}, 0.8)`)),
      );
    const turns = (values: number[]) =>
      values
        .slice(1, -1)
        .filter((value, index) => (value - (values[index] ?? 0)) * ((values[index + 2] ?? 0) - value) < 0).length;
    expect(turns(fine(6))).toBeGreaterThan(turns(fine(0)));
  });

  it('has Ridged and Terrain types, still from 0 to 1', () => {
    for (const type of ['Ridged', 'Terrain']) {
      const values = row((p) => `Noise(${p}, 2, 1, 2, 0.5, "${type}")`);
      expect(
        values.every((value) => value >= 0 && value <= 1),
        type,
      ).toBe(true);
      expect(new Set(values).size, type).toBeGreaterThan(30);
    }
    expect(formula('Noise(Vector(0, 0, 0), 1, 0, 2, 0.5, "Lumpy")')).toContain('Smooth, Ridged or Terrain');
  });

  it('gives three independent values with NoiseVector', () => {
    const value = formula('NoiseVector(Vector(0.3, 0.6, 0.9), 1, 2)');
    const numbers = JSON.parse(value) as number[];
    expect(numbers).toHaveLength(3);
    expect(new Set(numbers).size).toBe(3);
  });
});

describe('Voronoi', () => {
  it('gives the distance to the nearest cell point, the edge between cells, and a value per cell', () => {
    const distance = row((p) => `Voronoi(${p}, 1, 3)`);
    expect(distance.every((value) => value >= 0 && value < 1.8)).toBe(true);
    const edge = row((p) => `Voronoi(${p}, 1, 3, "Edge")`);
    expect(edge.every((value) => value >= 0)).toBe(true);
    const cell = row((p) => `Voronoi(${p}, 1, 3, "Cell")`);
    expect(cell.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(cell).size).toBeLessThan(cell.length);
    expect(formula('Voronoi(Vector(0, 0, 0), 1, 3, "Size")')).toContain('Distance, Edge or Cell');
  });
});
