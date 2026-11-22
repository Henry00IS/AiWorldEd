import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Bakes the solids into one mesh, welds it and counts its corners.
 *
 * @param solids Lines inside Mesh From Solids.
 * @param merge Merge By Distance values.
 * @returns Corner count, or the error.
 */
function corners(solids: SolidScriptLine[], merge: Record<string, string>): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'mesh_from_solids' },
      ...solids,
      { command: 'end' },
      { command: 'select_objects', values: {} },
      { command: 'merge_by_distance', values: merge },
      { command: 'select_objects', values: { into: 'O' } },
      { command: 'echo', values: { value: '[O(0).Vertices.Count]' } },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

const PAIR: SolidScriptLine[] = [
  { command: 'cube', values: { size: '1', anchor: 'Center, Center, Center' } },
  { command: 'transform', values: { move: '1.05, 0, 0' } },
  { command: 'cube', values: { size: '1', anchor: 'Center, Center, Center' } },
  { command: 'end' },
];

describe('Merge By Distance modes', () => {
  it('welds near corners of separate parts in Mode All, but not in Mode Connected', () => {
    expect(corners(PAIR, { distance: '0.1' })).toBe('12');
    expect(corners(PAIR, { distance: '0.1', merging: 'Connected' })).toBe('16');
  });

  it('welds the ends of short edges in Mode Connected', () => {
    const slab: SolidScriptLine[] = [{ command: 'cube', values: { size: '1, 0.05, 1' } }];
    expect(corners(slab, { distance: '0.1', merging: 'Connected' })).toBe('4');
  });

  it('welds only corners that pass Weld Where', () => {
    expect(corners(PAIR, { distance: '0.1', weld: '[=[$Vertex.Position.Y] > 0]' })).toBe('14');
  });
});
