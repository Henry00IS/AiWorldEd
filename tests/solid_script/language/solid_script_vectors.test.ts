import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { calculateExpression } from '@/ai/shared/mcp_calculate.js';

/**
 * Makes a line.
 *
 * @param command Command id.
 * @param values Field values.
 * @returns Line.
 */
function line(command: string, values: Record<string, string> = {}): SolidScriptLine {
  return { command, values };
}

/**
 * Runs lines and returns what Echo wrote, or the error.
 *
 * @param lines Lines.
 * @returns Messages or error text.
 */
function echoed(...lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...lines, line('cube')]));
  return result.error ? result.error.message : result.messages;
}

/**
 * Echoes one formula.
 *
 * @param formula Formula without [= ].
 * @returns Echoed text, or the error.
 */
function formula(formula: string): string {
  const out = echoed(line('echo', { value: `[=${formula.replace(/([[\]])/g, '$$$1')}]` }));
  return typeof out === 'string' ? out : out[0]!;
}

describe('SolidScript vectors', () => {
  it('keeps a position in one variable and reads and changes its parts', () => {
    expect(
      echoed(
        line('variable', { name: 'pos', value: '1, 2, 3' }),
        line('echo', { value: '[pos] [pos.x] [pos.y] [pos.z]' }),
        line('variable', { name: 'pos.z', value: '[=[pos.z] + 4]' }),
        line('echo', { value: '[pos] [=[pos].z * 2] [=[pos.x] + [pos.y]]' }),
      ),
    ).toEqual(['[1, 2, 3] 1 2 3', '[1, 2, 7] 14 3']);
  });

  it('moves and sizes shapes with one vector variable', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        line('variable', { name: 'size', value: '2, 4, 6' }),
        line('variable', { name: 'spot', value: '10, 0, 0' }),
        line('translate', { v: '[spot]' }),
        line('cube', { size: '[size]', anchor: 'Left, Bottom, Back' }),
        { command: 'end' },
      ]),
    );
    expect(result.error).toBeNull();
    const points = JSON.stringify(result.shapes);
    expect(points).toContain('"x":12');
    expect(points).toContain('"z":6');
  });

  it('does vector math with numbers and other vectors', () => {
    expect(formula('[1, 2, 3] + [10, 20, 30]')).toBe('[11, 22, 33]');
    expect(formula('[1, 2, 3] * 2')).toBe('[2, 4, 6]');
    expect(formula('[2, 4, 6] / 2')).toBe('[1, 2, 3]');
    // Two vectors combine part by part; Dot and Cross are functions.
    expect(formula('[1, 2, 3] * [4, 5, 6]')).toBe('[4, 10, 18]');
    expect(formula('Vector(2, 4, 6) * Vector(1, 1, 1)')).toBe('[2, 4, 6]');
    expect(formula('[4, 10, 18] / [4, 5, 6]')).toBe('[1, 2, 3]');
    expect(formula('[5, 5, 5] - [1, 2, 3]')).toBe('[4, 3, 2]');
    expect(formula('2 * [1, 2, 3]')).toBe('[2, 4, 6]');
    expect(formula('12 / [1, 2, 3]')).toBe('[12, 6, 4]');
    expect(formula('[[1, 0], [0, 2]] * [3, 4]')).toBe('[3, 8]');
    expect(formula('length([3, 4, 0])')).toBe('5');
    expect(formula('normalize([0, 0, 5])')).toBe('[0, 0, 1]');
    expect(formula('dot([1, 2, 3], [4, 5, 6])')).toBe('32');
    expect(formula('cross([1, 0, 0], [0, 1, 0])')).toBe('[0, 0, 1]');
    expect(formula('distance([0, 0, 0], [0, 3, 4])')).toBe('5');
    expect(formula('lerp([0, 0, 0], [10, 20, 30], 0.5)')).toBe('[5, 10, 15]');
    expect(formula('lerp(2, 4, 0.25)')).toBe('2.5');
  });

  it('explains vector mistakes in plain words', () => {
    expect(echoed(line('variable', { name: 'n', value: '4' }), line('echo', { value: '[n.x]' }))).toMatch(
      /\[n\] is Whole Number, not a vector with a \.x/,
    );
    expect(echoed(line('variable', { name: 'ghost.x', value: '1' }))).toMatch(/there is no vector \[ghost\] to change/);
    expect(formula('normalize([0, 0, 0])')).toMatch(/cannot turn 0, 0, 0 into a direction/);
  });
});

describe('SolidScript text and helper functions', () => {
  it('changes and searches text', () => {
    expect(formula('uppercase("door")')).toBe('DOOR');
    expect(formula('lowercase("Door")')).toBe('door');
    expect(formula('trim("  hi  ")')).toBe('hi');
    expect(formula('contains("big door", "door")')).toBe('Yes');
    expect(formula('starts_with("door_1", "door")')).toBe('Yes');
    expect(formula('ends_with("door_1", "_2")')).toBe('No');
    expect(formula('position("abcabc", "c")')).toBe('2');
    expect(formula('part("window", 0, 3)')).toBe('win');
    expect(formula('replace("a-b-c", "-", "+")')).toBe('a+b+c');
    expect(formula('replace_pattern("a1b22", "[0-9]+", "#")')).toBe('a#b#');
    expect(formula('find_pattern("a1b22", "[0-9]+")')).toBe('[1, 22]');
    expect(formula('repeat_text("ab", 3)')).toBe('ababab');
    expect(formula('reversed("abc")')).toBe('cba');
    expect(formula('reversed([1, 2, 3])')).toBe('[3, 2, 1]');
    expect(formula('split("a, b,c")')).toBe('[a, b, c]');
    expect(formula('join(["a", "b"], "-")')).toBe('a-b');
    expect(formula('number("2.5") * 2')).toBe('5');
  });

  it('picks, clamps, truncates and makes the same random number for the same seed', () => {
    expect(formula('pick(1, "red", "green", "blue")')).toBe('green');
    expect(formula('clamp(12, 0, 10)')).toBe('10');
    expect(formula('trunc(-2.7)')).toBe('-2');
    expect(formula('random(0, 10, 4) == random(0, 10, 4)')).toBe('Yes');
    expect(formula('pick(5, "a")')).toMatch(/has 1 choices, numbered from 0, so 5 is not one of them/);
  });
});

describe('SolidScript formulas and the MCP calculator', () => {
  it('give the same answers, because they share one formula language', () => {
    for (const text of [
      '20+(0.5*12)',
      '-(4+2)/2',
      '2*3+4',
      '2*(3+4)',
      '10 - 2 - 3',
      '8 / 2 / 2',
      '+5',
      '1.25*4',
      'sqrt(81)',
      'PI',
    ]) {
      const shared = (calculateExpression(text).data as { value: number }).value;
      expect(formula(text), text).toBe(String(shared));
    }
    for (const text of [
      'Math.Tau / 2',
      'remap(5, 0, 10, 0, 1)',
      'smoothstep(0, 2, 1)',
      'wrap(370, 0, 360)',
      '2 ^ 10',
      'sum([1, 2])',
    ]) {
      const shared = (calculateExpression(text).data as { value: number }).value;
      expect(formula(text), text).toBe(String(shared));
    }
    expect(calculateExpression('1/0').ok).toBe(false);
    expect(formula('1/0')).toMatch(/division by zero/);
  });
});

describe('SolidScript dotted names', () => {
  it('stops a script with a made-up dotted name before any line runs', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([line('cube'), line('variable', { name: 'chicken.soup', value: '1' })]),
    );
    expect(result.shapes).toEqual([]);
    expect(result.error?.message).toMatch(/^line 2: Variable: chicken\.soup can only be read; a line sets whole names/);
    const read = solidScriptProgramRun(
      solidScriptDocumentCreate([line('echo', { value: '[chicken.soup]' }), line('cube')]),
    );
    expect(read.error?.message).toMatch(/^line 1: Message: there is no variable/);
    expect(echoed(line('echo', { value: '[Face.Area]' }))).not.toMatch(/cannot be a name/);
    expect(echoed(line('variable', { name: 'Face.Area', value: '1' }))).toMatch(/Face\.Area can only be read/);
    expect(
      echoed(line('variable', { name: 'Items', value: '1, 2, 3, 4' }), line('echo', { value: '[Items.size]' })),
    ).toMatch(/List of Numbers has no \.size; it has \.Count, \.First, \.Last/);
  });

  it('allows the dotted forms SolidScript gives a meaning', () => {
    expect(
      echoed(
        line('variable', { name: 'v', value: '50, 20, 40' }),
        line('variable', { name: 'persistent.best', value: '[v.y]' }),
        line('add_item', { value: '1', list: 'items' }),
        line('echo', { value: '[v.x] [v.y] [v.z] [persistent.best] [items.count] [=[v].z + 1]' }),
      ),
    ).toEqual(['50 20 40 20 1 41']);
  });
});

describe('SolidScript formula words', () => {
  it('reads ^ as a power and and, or, not as logic words', () => {
    expect(
      echoed(line('echo', { value: '[=2 ^ 3] [=-2 ^ 2] [=2 ^ 3 ^ 2] [=1 < 2 and not (3 < 2)] [=false or 1 == 1]' })),
    ).toEqual(['8 -4 512 Yes Yes']);
  });

  it('clears a name not set yet into an empty list for Add Item', () => {
    expect(
      echoed(
        line('clear_variable', { name: 'outline' }),
        line('add_item', { value: '[=vector(1, 2)]', list: 'outline' }),
        line('echo', { value: '[outline.count] [outline(0)]' }),
      ),
    ).toEqual(['1 [1, 2]']);
  });
});
