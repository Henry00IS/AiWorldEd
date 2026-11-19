import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFlowPathKinds } from '@/solid_script/document/solid_script_document_flow_kinds.js';
import { solidScriptFieldMistake } from '@/solid_script/language/solid_script_field_mistakes.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const CUBE = line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center' });

/**
 * Runs lines and returns what they printed, or the error.
 *
 * @param lines Script lines.
 * @returns Messages, or a one-item list of the error.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), {});
  return result.error ? [result.error.message] : result.messages;
}

describe('SolidScript current-element system names', () => {
  it('lets Select Faces Where read [$Face] and [$Index], and refuses the old [Face] name', () => {
    expect(
      printed(
        CUBE,
        line('select_brushes'),
        line('select_faces', { which: 'All', where: '[=[$Face.Area] > 1]' }),
        line('echo', { value: '[$Selected.Faces.Count]' }),
      ),
    ).toEqual(['6']);
    expect(
      printed(
        CUBE,
        line('select_brushes'),
        line('select_faces', { which: 'All', where: '[=[$Index] == 0]' }),
        line('echo', { value: '[$Selected.Faces.Count] [$Selected.Faces.First.Area]' }),
      ),
    ).toEqual(['1 4']);
    expect(
      printed(CUBE, line('select_brushes'), line('select_faces', { which: 'All', where: '[=[Face.Area] > 1]' }))[0],
    ).toMatch(/no variable \[Face\.Area\].*\$Face\.Area/);
  });

  it('lets Select Vertices Where use [$Y] as the short form of [$Vertex.Position.Y]', () => {
    const byMember = printed(
      CUBE,
      line('select_brushes'),
      line('select_vertices', { which: 'All', where: '[=[$Vertex.Position.Y] > 0]', into: 'Up' }),
      line('echo', { value: '[Up.Count]' }),
    );
    const byShort = printed(
      CUBE,
      line('select_brushes'),
      line('select_vertices', { which: 'All', where: '[=[$Y] > 0]', into: 'Up' }),
      line('echo', { value: '[Up.Count]' }),
    );
    expect(byMember).toEqual(['4']);
    expect(byShort).toEqual(byMember);
  });

  it('lets Select Faces Where use [$CX] as the short form of [$Face.Center.X]', () => {
    const byMember = printed(
      CUBE,
      line('select_brushes'),
      line('select_faces', { which: 'All', where: '[=[$Face.Center.Y] > 0]' }),
      line('echo', { value: '[$Selected.Faces.Count]' }),
    );
    const byShort = printed(
      CUBE,
      line('select_brushes'),
      line('select_faces', { which: 'All', where: '[=[$CY] > 0]' }),
      line('echo', { value: '[$Selected.Faces.Count]' }),
    );
    expect(byMember).toEqual(['1']);
    expect(byShort).toEqual(byMember);
  });

  it('fills $Face and $Index on Select Faces, and $Vertex on Select Vertices', () => {
    expect(solidScriptCommandFind('select_faces')?.fills).toEqual(
      expect.arrayContaining(['$Face', '$Index', '$CX', '$CY', '$CZ']),
    );
    expect(solidScriptCommandFind('select_vertices')?.fills).toEqual(['$Vertex', '$Index']);
    expect(solidScriptCommandFind('select_edges')?.fills).toEqual(['$Edge', '$Index']);
  });

  it('gives the analyzer the members of $Face, and hints to write [$Face.Area] when the $ is missing', () => {
    expect(solidScriptFlowPathKinds('$Face.Area', () => [])).toEqual(['Number']);
    expect(solidScriptFlowPathKinds('$Vertex.Position.Y', () => [])).toEqual(['Number']);
    expect(solidScriptFlowPathKinds('$Selected.Faces.Count', () => [])).toEqual(['Number']);
    expect(solidScriptFieldMistake('[Face.Area] > 1')).toBe('[=[$Face.Area] > 1]');
  });
});
