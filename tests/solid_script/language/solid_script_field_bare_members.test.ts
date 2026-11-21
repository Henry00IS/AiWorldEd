import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentDefines } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptMistakeBareMembers } from '@/solid_script/language/solid_script_field_bare_members.js';
import { solidScriptMistakeNamesWritten } from '@/solid_script/language/solid_script_field_mistakes.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptMistakeCheck } from '@/solid_script/language/solid_script_use_check.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/** A 2 m cube with the four edges of its top face selected. */
const EDGES = [
  line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center' }),
  line('select_objects', { which: 'Between', how: 'New' }),
  line('select_faces', { which: 'Facing Up', how: 'New' }),
  line('select_edges', { which: 'All', how: 'New' }),
];

/** Why a bare member read is a mistake, as the hint says it. */
const WHY = 'a variable read with a member needs its own brackets';

/** What a running formula says of a name it writes without brackets. */
const TOLD = 'needs brackets in a formula; a word without them can only be a function, such as Sin(5)';

/**
 * Opens a For Each over the selected edges, or over another list.
 *
 * @param item Item name.
 * @param list List.
 * @returns Line.
 */
const each = (item: string, list = '[$Selected.Edges]'): SolidScriptLine => line('for_each', { variable: item, list });

/**
 * Echoes field text.
 *
 * @param value Field text.
 * @returns Line.
 */
const echo = (value: string): SolidScriptLine => line('echo', { value });

/**
 * Runs lines and checks them in the editor.
 *
 * @param lines Lines.
 * @returns The error the run stops with, and the editor warnings.
 */
function hints(lines: SolidScriptLine[]): { run: string; editor: string[] } {
  const document = solidScriptDocumentCreate(lines);
  const run = solidScriptProgramRun(document).error?.message ?? '';
  const editor = solidScriptMistakeCheck(document, solidScriptDocumentDefines(document)).map(
    (warning) => `${warning.line}: ${warning.text}`,
  );
  return { run, editor };
}

describe('SolidScript hint for a variable read with a member and no brackets in a formula', () => {
  it("gives Henry's Points From List line the bracketed form, never $", () => {
    const points = '[Edge.Start], [Edge.End], [=Edge.Start + [0,0.1,0]], [=Edge.End + [0.1,0.1,0]]';
    const { run, editor } = hints([...EDGES, each('Edge'), line('polyhedron', { points }), line('end'), line('end')]);
    const meant = '[Edge.Start], [Edge.End], [=[Edge.Start] + [0,0.1,0]], [=[Edge.End] + [0.1,0.1,0]]';
    expect(run).toBe(
      `line 6: Points From List: Edge.Start ${TOLD}; write [Edge.Start]. Did you mean to write ${meant}?`,
    );
    expect(editor).toEqual([`6: Points From List: in a formula, ${WHY}. Did you mean to write ${meant}?`]);
    expect(run).not.toContain('$');
  });

  it('runs the bracketed form, and reads [0,0.1,0] in a formula as a vector', () => {
    const run = solidScriptProgramRun(
      solidScriptDocumentCreate([
        ...EDGES,
        each('Edge'),
        echo('[=[Edge.Start] + [0,0.1,0]] [=[0,0.1,0]]'),
        line('end'),
      ]),
    );
    expect(run.error).toBeNull();
    expect(run.messages[0]).toBe('[1, 1.1, 1] [0, 0.1, 0]');
  });

  it('follows nested loops and a shadowed name: the inner Item is an Edge, the outer one a vector', () => {
    const inner = hints([
      ...EDGES,
      each('P', '[0, 1, 2], [3, 4, 5]'),
      each('P'),
      echo('[=P.Start + [0, 1, 0]]'),
      line('end'),
      line('end'),
    ]);
    expect(inner.run).toContain(`P.Start ${TOLD}; write [P.Start]. Did you mean to write [=[P.Start] + [0, 1, 0]]?`);
    expect(inner.editor).toEqual([`7: Message: in a formula, ${WHY}. Did you mean to write [=[P.Start] + [0, 1, 0]]?`]);
    const outer = hints([
      ...EDGES,
      each('P', '[0, 1, 2], [3, 4, 5]'),
      each('Q'),
      line('end'),
      echo('[=[P].X + 1] [=[P.Y]]'),
      line('end'),
    ]);
    expect(outer).toEqual({ run: '', editor: [] });
    const both = hints([
      ...EDGES,
      each('Edge'),
      each('Face', '[$Selected.Faces]'),
      echo('[=Edge.Length + Face.Area]'),
      line('end'),
      line('end'),
    ]);
    expect(both.editor).toEqual([
      `7: Message: in a formula, ${WHY}. Did you mean to write [=[Edge.Length] + [Face.Area]]?`,
    ]);
  });

  it('gives no suggestion for a name that is a variable on another line only', () => {
    const after = hints([...EDGES, each('Edge'), echo('[Edge.Start]'), line('end'), echo('[=Edge.Start + [0, 1, 0]]')]);
    expect(after.run).toBe(
      `line 8: Message: Edge.Start ${TOLD}. There is no variable Edge either; for a variable write [Edge], for text write "Edge.Start"`,
    );
    expect(after.editor).toEqual([]);
    const later = hints([echo('[=Box.Width + 1]'), line('variable', { name: 'Box', value: '1, 2, 3' }), line('cube')]);
    expect(later.run).toContain(`Box.Width ${TOLD}`);
    expect(later.editor).toEqual([]);
  });

  it('writes every member read of a path, each occurrence, and leaves the right ones as they are', () => {
    const mixed = hints([
      ...EDGES,
      each('Edge'),
      echo('[=[Edge.Start] + Edge.End.X + Edge.End] and [=Edge.Length * 2]'),
      line('end'),
    ]);
    const meant = '[=[Edge.Start] + [Edge.End.X] + [Edge.End]] and [=[Edge.Length] * 2]';
    expect(mixed.run).toContain(`Edge.End.X ${TOLD}; write [Edge.End.X]. Did you mean to write ${meant}?`);
    expect(mixed.editor).toEqual([`6: Message: in a formula, ${WHY}. Did you mean to write ${meant}?`]);
    const set = hints([
      line('variable', { name: 'Pos', value: '1, 2, 3' }),
      echo('[=Pos.X + Pos.Length]'),
      line('cube'),
    ]);
    expect(set.editor).toEqual([`2: Message: in a formula, ${WHY}. Did you mean to write [=[Pos.X] + [Pos.Length]]?`]);
    const into = hints([
      line('cube'),
      line('select_objects', { which: 'All', how: 'New', into: 'Picked' }),
      echo('[=Picked.Count + 1]'),
    ]);
    expect(into.run).toContain(
      `Picked.Count ${TOLD}; write [Picked.Count]. Did you mean to write [=[Picked.Count] + 1]?`,
    );
  });

  it('keeps $ for a system value, and never gives it to a name of the script', () => {
    const system = hints([...EDGES, each('Edge'), echo('[=Box.Width + 1] [=$Box.Width] [=Math.Pi]'), line('end')]);
    const meant = '[=[$Box.Width] + 1] [=[$Box.Width]] [=[$Math.Pi]]';
    expect(system.run).toBe(`line 6: Message: Box.Width ${TOLD}; write [$Box.Width]. Did you mean to write ${meant}?`);
    expect(system.editor).toEqual([
      `6: Message: a formula reads every variable and system value in brackets. Did you mean to write ${meant}?`,
    ]);
    const own = hints([...EDGES, each('Box', '[$Selected.Objects]'), echo('[=Box.Faces.Count + 1]'), line('end')]);
    expect(own.run).toContain(
      `Box.Faces.Count ${TOLD}; write [Box.Faces.Count]. Did you mean to write [=[Box.Faces.Count] + 1]?`,
    );
    expect(own.editor).toEqual([`6: Message: in a formula, ${WHY}. Did you mean to write [=[Box.Faces.Count] + 1]?`]);
    expect(`${own.run} ${own.editor.join(' ')}`).not.toContain('$');
  });

  it('gives no suggestion for an unknown name, and brackets a plain variable read without them', () => {
    const unknown = hints([...EDGES, each('Edge'), echo('[=Foo.Start + 1]'), line('end')]);
    expect(unknown.run).toBe(
      `line 6: Message: Foo.Start ${TOLD}. There is no variable Foo either; for a variable write [Foo], for text write "Foo.Start"`,
    );
    expect(unknown.editor).toEqual([]);
    const plain = hints([...EDGES, each('Edge'), echo('[=Max(1, 2) + 1.5 + Edge]'), line('end')]);
    expect(plain.run).toContain('Did you mean to write [=Max(1, 2) + 1.5 + [Edge]]?');
    expect(plain.editor).toEqual([
      '6: Message: a formula reads every variable and system value in brackets. Did you mean to write [=Max(1, 2) + 1.5 + [Edge]]?',
    ]);
    const fine = hints([...EDGES, each('Edge'), echo('[=Max(1, 2) + 1.5 + [Edge.Length]]'), line('end')]);
    expect(fine).toEqual({ run: '', editor: [] });
  });

  it('reads formulas as they parse: [Edge].Start, $ names, text and names a list comprehension binds', () => {
    const sees = (name: string): boolean => name.toLowerCase() === 'edge';
    expect(solidScriptMistakeBareMembers('[=[Edge].Start * 2]', sees)).toBe('[=[Edge.Start] * 2]');
    expect(solidScriptMistakeBareMembers('[=$Edge.Start + "Edge.Start"]', sees)).toBe('[=$Edge.Start + "Edge.Start"]');
    expect(solidScriptMistakeBareMembers('[=$[for (Edge = Things) Edge.Start$]]', sees)).toBe(
      '[=$[for (Edge = Things) Edge.Start$]]',
    );
    expect(solidScriptMistakeBareMembers('Edge.Start [=Edge.X] [=Edge.Start(1)]', sees)).toBe(
      'Edge.Start [=Edge.X] [=Edge.Start(1)]',
    );
    expect(solidScriptMistakeBareMembers('[=Edge.Start + ', sees)).toBe('[=Edge.Start + ');
  });

  it('drops a $ from a variable of the script, and never adds one to it', () => {
    const DOLLAR = 'a $ marks only system values, never a variable of the script';
    const width = line('variable', { name: 'Width', value: '5' });
    const minus = hints([width, echo('[=[$Width]-1]'), line('cube')]);
    expect(minus.run).toBe(
      'line 2: Message: there is no variable [$Width]; set it on a line above this one. A $ marks only system values, never a variable of the script. Did you mean to write [=[Width]-1]?',
    );
    expect(minus.editor).toEqual([`2: Message: ${DOLLAR}. Did you mean to write [=[Width]-1]?`]);
    expect(hints([width, echo('=[$Width] > 3'), line('cube')]).editor).toEqual([
      `2: Message: ${DOLLAR}. Did you mean to write =[Width] > 3?`,
    ]);
    expect(hints([width, echo('"$Width"'), line('cube')])).toEqual({ run: '', editor: [] });
    // $X is a value of each vertex, so [$X] may mean it: no hint is certain.
    const x = line('variable', { name: 'X', value: '5' });
    for (const typed of ['[=[$X]-1]', '"$X"', '=[$X] > 3'])
      expect(hints([x, echo(typed), line('cube')]).editor.join(' '), typed).not.toMatch(
        /\[\$\$|Did you mean to write [^?]*\$\$/,
      );
    for (const name of ['X', 'Edge', 'Index', 'Nz'])
      for (const typed of ['[=[N] > 3]', '[N] + 1', '[=N + 1]', '[N]']) {
        const text = typed.replace(/N/g, name);
        const editor = hints([line('variable', { name, value: '5' }), echo(text), line('cube')]).editor.join(' ');
        expect(editor, text).not.toContain(`$${name}`);
      }
    const after = hints([...EDGES, each('Nz', '1, 2'), line('end'), echo('[=[Nz] > 3]')]);
    expect(after.editor.join(' ')).not.toContain('$');
    expect(hints([...EDGES, each('Edge'), echo('[$Index] [$Edge.Start]'), line('end')])).toEqual({
      run: '',
      editor: [],
    });
  });

  it('shares one rule for names, that can also bracket every bare variable of a formula', () => {
    const sees = (name: string): boolean => ['edge', 'width'].includes(name.toLowerCase());
    expect(solidScriptMistakeNamesWritten('[=Edge.Start + [$Width]] [=Edge * 2]', sees)).toBe(
      '[=[Edge.Start] + [Width]] [=Edge * 2]',
    );
    expect(solidScriptMistakeNamesWritten('[=Edge.Start + [$Width]] [=Edge * 2 + Max(Foo, 1)]', sees, true)).toBe(
      '[=[Edge.Start] + [Width]] [=[Edge] * 2 + Max(Foo, 1)]',
    );
    expect(solidScriptMistakeNamesWritten('[=[Edge] + Edge.X + true]', sees, true)).toBe('[=[Edge] + [Edge.X] + true]');
  });
});
