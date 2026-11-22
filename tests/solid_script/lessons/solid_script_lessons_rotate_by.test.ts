import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Turns up (0, 1, 0) by the rotation a RotateBy formula gives.
 *
 * @param rotateBy RotateBy call.
 * @returns Where up ends, as numbers.
 */
function upAfter(rotateBy: string): number[] {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      {
        command: 'echo',
        values: {
          value: `[=TransformDirection(Transform(Vector(0, 0, 0), ${rotateBy}, Vector(1, 1, 1)), Vector(0, 1, 0))]`,
        },
      },
    ]),
  );
  expect(result.error?.message).toBeUndefined();
  return (result.messages[0] ?? '').replace(/[[\]]/g, '').split(',').map(Number);
}

describe('RotateBy', () => {
  it('turns By in world space, or in the rotated space with Local', () => {
    const world = upAfter('RotateBy(Vector(90, 0, 0), Vector(0, 90, 0))');
    const local = upAfter('RotateBy(Vector(90, 0, 0), Vector(0, 90, 0), true)');
    [1, 0, 0].forEach((value, axis) => expect(world[axis]).toBeCloseTo(value, 6));
    [0, 0, 1].forEach((value, axis) => expect(local[axis]).toBeCloseTo(value, 6));
  });
});
