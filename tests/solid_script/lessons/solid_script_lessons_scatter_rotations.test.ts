import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Reads the numbers of a printed vector.
 *
 * @param text Printed vector, such as [1, 0, 0].
 * @returns Numbers.
 */
function numbers(text = ''): number[] {
  return text.replace(/[[\]]/g, '').split(',').map(Number);
}

describe('Scatter Points Rotations', () => {
  it('writes per point the turn that stands up along the face under it', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube', values: { size: '1', label: 'C' } },
        { command: 'select_faces', values: { which: 'Facing Right', of: 'C' } },
        { command: 'scatter_points', values: { count: '3', into: 'P', normals: 'N', rotations: 'R' } },
        { command: 'echo', values: { value: '[R.Count]' } },
        {
          command: 'echo',
          values: {
            value: '[=TransformDirection(Transform(Vector(0, 0, 0), [R(2)], Vector(1, 1, 1)), Vector(0, 1, 0))]',
          },
        },
        { command: 'echo', values: { value: '[N(2)]' } },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    const [count, up, normal] = result.messages;
    expect(count).toBe('3');
    const expected = numbers(normal);
    numbers(up).forEach((value, axis) => expect(value).toBeCloseTo(expected[axis] ?? NaN, 6));
  });
});
