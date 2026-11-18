import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFieldCheck } from '@/solid_script/language/solid_script_field.js';
import { solidScriptFieldTokens } from '@/solid_script/language/solid_script_field_tokens.js';
import { solidScriptTypeDefault } from '@/solid_script/language/solid_script_types.js';
import { solidScriptTypeCheck } from '@/solid_script/language/solid_script_use_check.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const set = (name: string, value: string, type = ''): SolidScriptLine =>
  line('variable', type === '' ? { name, value } : { name, value, type });
const echo = (value: string): SolidScriptLine => line('echo', { value });
const CUBE = line('cube', { size: '2, 2, 2' });

/** What a run printed, or the error it stopped with. */
function outcome(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...lines, CUBE]), {});
  return result.error ? [result.error.message] : result.messages;
}

describe('SolidScript Set with a Type', () => {
  it('gives a blank value the default of its Type, and keeps a blank Any as empty text', () => {
    expect(solidScriptTypeDefault('Number')).toBe(0);
    expect(solidScriptTypeDefault('Text')).toBe('');
    expect(solidScriptTypeDefault('Vector')).toEqual([0, 0, 0]);
    expect(solidScriptTypeDefault('Yes/No')).toBe(false);
    expect(solidScriptTypeDefault('Face List')).toEqual([]);
    expect(outcome(set('N', '', 'Number'), echo('[N]'))).toEqual(['0']);
    expect(outcome(set('B', '', 'Yes/No'), echo('[B]'))).toEqual(['No']);
    expect(outcome(echo('[=1 < 2] [=True and False]'))).toEqual(['Yes No']);
    expect(outcome(set('V', '', 'Vector'), echo('[V]'))).toEqual(['[0, 0, 0]']);
    expect(outcome(set('L', '', 'List'), echo('[L.Count]'))).toEqual(['0']);
    expect(outcome(set('L', '', 'Text List'), set('L()', 'oak'), echo('[L.Count]'))).toEqual(['1']);
    expect(outcome(set('A', ''), echo('<[A]>'))).toEqual(['<>']);
  });

  it('splits a list Type on commas, and lets a plain List hold items of any kind', () => {
    expect(outcome(set('A', 't,6mv', 'Text List'), echo('[A.Count] [A.First] [A.Last]'))).toEqual(['2 t 6mv']);
    expect(outcome(set('A', '1, oak, 3', 'List'), echo('[A.Count] [=[A(0)] + 1]'))).toEqual(['3 2']);
    expect(outcome(set('A', 'oak', 'List'), echo('[A.Count]'))).toEqual(['1']);
    expect(outcome(set('A', '1, oak', 'Number List'))[0]).toMatch(/\[A\] is declared Number List/);
    expect(outcome(set('A', 't,6mv,$[4, 5, 6$]'), echo('[A]'))).toEqual(['t,6mv,[4, 5, 6]']);
    const check = (...lines: SolidScriptLine[]) =>
      solidScriptTypeCheck(solidScriptDocumentCreate(lines)).map((w) => w.text);
    expect(check(set('A', 't,6mv', 'Text List'), set('B', '', 'Number'), set('C', '[1, 2, 3]', 'Vector'))).toEqual([]);
    expect(check(set('A', '1, oak', 'Number List'))[0]).toMatch(/declared Number List/);
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
        solidScriptDocumentCreate([...before, line('translate', { v }), CUBE, line('end')]),
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
    expect(outcome(set('V', '[1, 2]'))[0]).toMatch(/needs exactly 3 numbers.*Did you mean to write \[1, 2, 0\]\?/);
    expect(outcome(set('V', '[0*2]'))[0]).toMatch(/Did you mean to write \[=0\*2\]\?/);
    expect(outcome(set('V', '[1, 2, 3, 4]'))[0]).toMatch(/Did you mean to write 1, 2, 3, 4\?/);
    expect(solidScriptFieldCheck('[1, 2]')).toMatch(/Did you mean to write \[1, 2, 0\]\?/);
    expect(solidScriptFieldCheck('[3,]')).toMatch(/Did you mean to write \[3, 0, 0\]\?/);
    expect(solidScriptFieldCheck('[3,2]')).toMatch(/Did you mean to write \[3, 2, 0\]\?/);
    expect(outcome(set('L', '[2,5,[3, 2, 3],[3,2,0]]'))[0]).toMatch(
      /is not a vector.*Did you mean to write 2, 5, \[3, 2, 3\], \[3, 2, 0\]\?/,
    );
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

  it('sweeps Curve To Mesh along vectors in brackets, with a profile of vectors whose z is ignored', () => {
    expect(fails(line('curve_to_mesh', { path: '[0, 0, 0], [1, 0, 0], [2, 1, 0]' }))).toBeNull();
    expect(
      fails(
        set('Path', '[0, 0, 0], [1, 0, 0]'),
        line('curve_to_mesh', { path: '[Path]', profile: '[0, 0, 0], [0.2, 0, 0], [0.2, 0.1, 0]' }),
      ),
    ).toBeNull();
    expect(fails(line('curve_to_mesh', { path: '0, 0, 0; 1, 0, 0' }))).toMatch(/\[0, 0, 0\], \[1, 0, 0\]/);
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
