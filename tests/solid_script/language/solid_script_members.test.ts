import { describe, expect, it } from 'vitest';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const CUBE = line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center' });
const SELECT_EDGES: SolidScriptLine[] = [CUBE, line('select_objects'), line('select_edges')];

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns The run.
 */
function run(lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), {});
}

/**
 * Messages a run printed, one per Print line.
 *
 * @param lines Lines.
 * @returns Messages.
 */
function printed(lines: SolidScriptLine[]): string[] {
  const result = run(lines);
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

describe('SolidScript Edge.Center', () => {
  it('reads Edge.Center as the midpoint of Start and End', () => {
    expect(
      printed([
        ...SELECT_EDGES,
        line('for_each', { variable: 'Edge', list: '[$Selected.Edges]' }),
        line('echo', { value: '[=[Edge.Center] - ([Edge.Start] + [Edge.End]) / 2]' }),
        line('end'),
      ]),
    ).toEqual(Array(12).fill('[0, 0, 0]'));
  });

  it('gives the normal unknown-member warning for Edge.Middle', () => {
    const lines = [
      CUBE,
      line('select_objects'),
      line('select_edges', { into: 'Edges' }),
      line('echo', { value: '[Edges.First.Middle]' }),
    ];
    const unknown =
      /an Edge has no \.Middle; it has \.Start, \.End, \.Center, \.Length, \.Direction, \.Angle, \.SignedAngle, \.IsConvex, \.IsBoundary, \.Id, \.Faces, \.Parent, \.Data/;
    expect(run(lines).error?.message ?? '').toMatch(unknown);
    expect(solidScriptKindCheck(solidScriptDocumentCreate(lines)).map((warning) => warning.text)).toEqual([
      '[Edges.First] holds Edge, which has no .Middle; it has .Start, .End, .Center, .Length, .Direction, .Angle, .SignedAngle, .IsConvex, .IsBoundary, .Id, .Faces, .Parent, .Data',
    ]);
  });
});
