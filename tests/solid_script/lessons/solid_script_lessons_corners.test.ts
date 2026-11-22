import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A flat 2 by 2 grid of four faces whose UVs run unbroken from 0 to 1. */
const GRID: SolidScriptLine[] = [
  { command: 'grid_mesh', values: { size: '2, 0, 2', columns: '2', rows: '2' } },
  { command: 'select_objects' },
  { command: 'select_faces', values: { which: 'All' } },
];

/**
 * Runs lines, then prints a member of every vertex or face of the selection.
 *
 * @param lines Lines that build and pick.
 * @param list List to walk, such as [$Selected.Faces].
 * @param member Member of each item, such as Angles.
 * @returns Printed values.
 */
function each(lines: SolidScriptLine[], list: string, member: string): string[] {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      ...lines,
      { command: 'for_each', values: { variable: 'E', list } },
      { command: 'echo', values: { value: `[E.${member}]` } },
      { command: 'end' },
    ]),
  );
  expect(result.error?.message).toBeUndefined();
  return result.messages;
}

describe('Corner values', () => {
  it('gives the angle at each corner of a face, in the order of its vertices', () => {
    expect(new Set(each(GRID, '[$Selected.Faces]', 'Angles'))).toEqual(new Set(['[90, 90, 90, 90]']));
    const ico = [
      { command: 'icosphere_mesh' },
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'All' } },
    ];
    expect(new Set(each(ico, '[$Selected.Faces]', 'Angles'))).toEqual(new Set(['[60, 60, 60]']));
  });

  it('tells whether the faces at a vertex give it different UVs', () => {
    const vertices = '[$Selected.Objects.Vertices]';
    expect(new Set(each(GRID, vertices, 'IsUVSplit'))).toEqual(new Set(['No']));
    expect(new Set(each([...GRID, { command: 'unwrap' }], vertices, 'IsUVSplit'))).toContain('Yes');
  });

  it('tells whether the two faces at an edge give its ends different UVs', () => {
    const edges = '[$Selected.Objects.Edges]';
    expect(new Set(each(GRID, edges, 'IsUVSplit'))).toEqual(new Set(['No']));
    expect(new Set(each([...GRID, { command: 'unwrap' }], edges, 'IsUVSplit'))).toContain('Yes');
  });
});
