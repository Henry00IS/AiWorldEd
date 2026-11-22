import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Scales the top of a 1 m mesh cube centred on the origin and reads the top
 * face again.
 *
 * @param scale Scale Faces values.
 * @returns Area and center of the top, or the error.
 */
function top(scale: Record<string, string>): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'mesh_from_solids', values: { label: 'C' } },
      { command: 'cube', values: { size: '1', anchor: 'Center, Center, Center' } },
      { command: 'end' },
      { command: 'select_faces', values: { which: 'Facing Up', of: 'C' } },
      { command: 'scale_faces', values: scale },
      { command: 'select_faces', values: { which: 'Facing Up', of: 'C', into: 'Up' } },
      { command: 'echo', values: { value: '[Up(0).Area] [Up(0).Center]' } },
    ]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

describe('Scale Faces Center and Axis', () => {
  it('scales every way about the face center by default', () => {
    expect(top({ factor: '0.5' })).toBe('0.25 [0, 0.5, 0]');
  });

  it('scales only along Axis', () => {
    expect(top({ factor: '0.5', axis: '1, 0, 0' })).toBe('0.5 [0, 0.5, 0]');
  });

  it('scales about Center when given', () => {
    expect(top({ factor: '0.5', center: '0.5, 0.5, 0.5' })).toBe('0.25 [0.25, 0.5, 0.25]');
  });

  it('scales faces that share corners as one island about the middle of their centers', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        {
          command: 'grid_mesh',
          values: { size: '2, 0, 2', columns: '2', rows: '1', anchor: 'Center, Center, Center' },
        },
        { command: 'select_objects', values: { into: 'G' } },
        { command: 'select_faces', values: { which: 'All' } },
        { command: 'scale_faces', values: { factor: '0.5' } },
        { command: 'echo', values: { value: '[G(0).Size]' } },
      ]),
    );
    expect(result.error?.message ?? result.messages[0]).toBe('[1, 0, 1]');
  });
});
