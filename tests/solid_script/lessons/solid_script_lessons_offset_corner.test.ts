import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A 2 m cube baked into a mesh, held in [Box]. */
const CUBE: SolidScriptLine[] = [
  { command: 'mesh_from_solids', values: {} },
  { command: 'cube', values: { size: '2' } },
  { command: 'end', values: {} },
  { command: 'select_objects', values: { into: 'Box' } },
];

/** The corners of the first face of the cube. */
const CORNERS = 'Box.Faces(0).FaceCorners';

/**
 * Prints one value after the cube.
 *
 * @param value Value to print.
 * @returns Printed value, or the error.
 */
function read(value: string): string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...CUBE, { command: 'echo', values: { value } }]));
  return result.error ? result.error.message : result.messages.join('\n');
}

describe('Offset corners around a face', () => {
  it('steps to the next and previous corner, wrapping around the face', () => {
    expect(read(`[=[${CORNERS}.Last.NextCorner.Index]]`)).toBe('0');
    expect(read(`[=[${CORNERS}.First.PreviousCorner.Index]]`)).toBe('3');
    expect(read(`[=[${CORNERS}.First.NextCorner.NextCorner.Index]]`)).toBe('2');
  });

  it('lists the face corners starting at this one', () => {
    expect(read(`[=[${CORNERS}.Last.Ring.Indices]]`)).toBe('[3, 0, 1, 2]');
    expect(read(`[=[${CORNERS}.Last.Ring.Count]]`)).toBe('4');
  });

  it('works on every corner of a list', () => {
    expect(read(`[=[${CORNERS}.NextCorners.Indices]]`)).toBe('[1, 2, 3, 0]');
    expect(read(`[=[${CORNERS}.PreviousCorners.Indices]]`)).toBe('[3, 0, 1, 2]');
  });
});
