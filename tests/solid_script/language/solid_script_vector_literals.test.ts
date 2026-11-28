import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFieldCheck } from '@/solid_script/language/solid_script_field.js';
import { solidScriptFieldTokens } from '@/solid_script/language/solid_script_field_tokens.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const set = (name: string, value: string): SolidScriptLine => line('variable', { name, value });
const echo = (value: string): SolidScriptLine => line('echo', { value });
const CUBE = line('cube', { size: '2, 2, 2' });

/** What a run printed, or the error it stopped with. */
function outcome(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...lines, CUBE]), {});
  return result.error ? [result.error.message] : result.messages;
}

describe('SolidScript Set values', () => {
  it('keeps a blank value as empty text and reads Yes and No from comparisons', () => {
    expect(outcome(set('A', ''), echo('<[A]>'))).toEqual(['<>']);
    expect(outcome(echo('[=1 < 2] [=True and False]'))).toEqual(['Yes No']);
  });

  it('splits typed commas into items, keeping escaped commas and brackets as text', () => {
    expect(outcome(set('A', 't,6mv'), echo('[A.Count] [A.First] [A.Last]'))).toEqual(['2 t 6mv']);
    expect(outcome(set('A', '1, oak, 3'), echo('[A.Count] [=[A(0)] + 1]'))).toEqual(['3 2']);
    expect(outcome(set('A', 't,6mv,$[4, 5, 6$]'), echo('[A.Count] [A]'))).toEqual(['5 [t, 6mv, [4, 5, 6]]']);
    expect(outcome(set('A', 't$,6mv'), echo('[A]'))).toEqual(['t,6mv']);
  });
});

describe('SolidScript vector literals', () => {
  it('reads [x, y, z] as a vector, the same as [=Vector(x, y, z)]', () => {
    expect(outcome(set('V', '[20, 30, 10]'), echo('[V.y]'))).toEqual(['30']);
    expect(outcome(set('V', '[-1.5, .5, 0]'), echo('[V]'))).toEqual(['[-1.5, 0.5, 0]']);
    expect(outcome(set('V', '[20, 30, 10]'), set('W', '[=Vector(20, 30, 10)]'), echo('[=[V] == [W]]'))).toEqual([
      'Yes',
    ]);
    expect(outcome(set('X', '7'), set('V', '[1, [X], 3]'), echo('[V]'))).toEqual(['[1, 7, 3]']);
  });

  it('reads a bracket as a vector once its inner brackets are solved to three numbers', () => {
    expect(
      outcome(
        set('X', '5'),
        set('Y', '7'),
        set('P', '[[=[X]-1], 20, 10], [5, 10, [Y]]'),
        echo('[P.Count] [P.First] [P.Last]'),
      ),
    ).toEqual(['2 [4, 20, 10] [5, 10, 7]']);
    expect(outcome(set('X', '7'), set('V', '[[X], 2, 3]'), echo('[V.x]'))).toEqual(['7']);
    expect(outcome(set('N', 'Wood'), set('WoodSize', '3'), echo('[[N]Size]'))).toEqual(['3']);
  });

  it('lets a vector field take three numbers, a vector in brackets or a vector value', () => {
    const at = (v: string, ...before: SolidScriptLine[]) => {
      const result = solidScriptProgramRun(
        solidScriptDocumentCreate([...before, line('transform', { v }), CUBE, line('end')]),
        {},
      );
      return result.error ? result.error.message : 'ok';
    };
    expect(at('20, 40, 10')).toBe('ok');
    expect(at('[20, 40, 10]')).toBe('ok');
    expect(at('[V]', set('V', '[20, 40, 10]'))).toBe('ok');
  });

  it('reads a list of vectors and a list of numbers apart', () => {
    expect(outcome(set('P', '[2.3, 1.9, 1],[4, 5, 6]'), echo('[P.Count] [P.Last]'))).toEqual(['2 [4, 5, 6]']);
    expect(outcome(set('P', '1,2,3,4,5,6'), echo('[P.Count]'))).toEqual(['6']);
    expect(outcome(set('P', '[20, 30, 10], [10, 2, 30]'), echo('[P]'))).toEqual(['[[20, 30, 10], [10, 2, 30]]']);
  });

  it('builds a Polyhedron from vectors written as [x, y, z]', () => {
    const corners = '[0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2]';
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([line('polyhedron', { points: corners }), line('end')]),
      {},
    );
    expect(result.error?.message ?? null).toBeNull();
  });

  it('explains a bracket that starts with a number but is no vector, with what was meant', () => {
    expect(outcome(set('V', '[1,]'))[0]).toMatch(/needs 2 or 3 numbers.*Did you mean to write \[1, 0\]\?/);
    expect(outcome(set('V', '[0*2]'))[0]).toMatch(/Did you mean to write \[=0\*2\]\?/);
    expect(outcome(set('V', '[1, 2, 3, 4]'), echo('[V.Count]'))).toEqual(['4']);
    expect(solidScriptFieldCheck('[1, 2]')).toBe('');
    expect(solidScriptFieldCheck('[3,]')).toMatch(/Did you mean to write \[3, 0\]\?/);
    expect(solidScriptFieldCheck('[3,2]')).toBe('');
    expect(outcome(set('L', '[2,5,[3, 2, 3],[3,2,0]]'), echo('[L]'))).toEqual(['[2, 5, [3, 2, 3], [3, 2, 0]]']);
    expect(solidScriptFieldCheck('[1, 2, 3]')).toBe('');
    expect(solidScriptFieldCheck('[[X], 2, 3]')).toBe('');
  });
});

describe('SolidScript vector literal colours', () => {
  it('colours the numbers of a vector in brackets as numbers, minus included', () => {
    const text = '[20, -3, .5]';
    const numbers = solidScriptFieldTokens(text)
      .filter((token) => token.kind === 'number')
      .map((token) => text.slice(token.from, token.to));
    expect(numbers).toEqual(['20', '-3', '.5']);
  });
});

describe('SolidScript point lists', () => {
  /** The error of a run, or null. */
  const fails = (...lines: SolidScriptLine[]) =>
    solidScriptProgramRun(solidScriptDocumentCreate(lines), {}).error?.message ?? null;

  it('sweeps Sweep Along Path along vectors in brackets, with a profile of vectors whose z is ignored', () => {
    expect(fails(line('sweep_along_path', { path: '[0, 0, 0], [1, 0, 0], [2, 1, 0]' }))).toBeNull();
    expect(
      fails(
        set('Path', '[0, 0, 0], [1, 0, 0]'),
        line('sweep_along_path', { path: '[Path]', profile: '[0, 0, 0], [0.2, 0, 0], [0.2, 0.1, 0]' }),
      ),
    ).toBeNull();
    expect(fails(line('sweep_along_path', { path: '0, 0, 0; 1, 0, 0' }))).toMatch(/\[0, 0, 0\], \[1, 0, 0\]/);
  });

  it('takes Polygon corners from vectors in brackets', () => {
    expect(
      fails(
        line('linear_extrude', { height: '1' }),
        line('polygon', { points: '[0, 0, 0], [2, 0, 0], [0, 2, 0]' }),
        line('end'),
        line('end'),
      ),
    ).toBeNull();
  });
});
