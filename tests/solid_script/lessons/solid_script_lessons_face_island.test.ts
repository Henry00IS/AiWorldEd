import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

describe('Face.Island', () => {
  it('gives the island of each face, so a per-item field can pick or vary by island', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'mesh_from_solids', values: { label: 'Pair' } },
        { command: 'cube', values: { size: '1' } },
        { command: 'transform', values: { move: '3, 0, 0' } },
        { command: 'cube', values: { size: '1' } },
        { command: 'end' },
        { command: 'end' },
        { command: 'select_objects', values: { into: 'Objs' } },
        { command: 'select_faces', values: { which: 'All', where: '[=[$Face.Island] == 1]', into: 'Second' } },
        { command: 'echo', values: { value: '[Objs(0).Islands.Count] [Second.Count]' } },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages[0]).toBe('2 6');
  });
});
