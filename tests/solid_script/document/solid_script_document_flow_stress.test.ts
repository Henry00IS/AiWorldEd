import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentFlowAt,
  solidScriptDocumentFlowEnd,
} from '@/solid_script/document/solid_script_document_flow.js';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';
import { SOLID_SCRIPT_FUNCTION_DOCS } from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptFunctionSpelling } from '@/solid_script/language/solid_script_name_key.js';

/**
 * Builds a line.
 *
 * @param command Command id.
 * @param values Field texts.
 * @returns Line.
 */
const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * Builds a Set line.
 *
 * @param name Variable.
 * @param value Value.
 * @returns Line.
 */
const set = (name: string, value: string): SolidScriptLine => line('variable', { name, value });

/**
 * Builds a line that is turned off.
 *
 * @param entry Line.
 * @returns The line, off.
 */
const off = (entry: SolidScriptLine): SolidScriptLine => ({ ...entry, off: true });

const END = line('end');
const ELSE = line('else');

/**
 * Lists the kinds a variable may hold where a line stands, sorted; the unknown
 * kind shows as ?.
 *
 * @param lines Script.
 * @param position 0-based line, or where a new line goes.
 * @param name Variable name key.
 * @returns Kinds, empty for a name not set there.
 */
function kindsAt(lines: SolidScriptLine[], position: number, name: string): string[] {
  const variable = solidScriptDocumentFlowAt(solidScriptDocumentCreate(lines), position).get(name);
  return [...(variable?.kinds ?? [])].map((kind) => kind || '?').sort();
}

/**
 * Lists the kinds a variable may hold when the script's own lines are done.
 *
 * @param lines Script.
 * @param name Variable name key.
 * @returns Kinds, sorted, the unknown kind as ?.
 */
function kindsEnd(lines: SolidScriptLine[], name: string): string[] {
  const variable = solidScriptDocumentFlowEnd(solidScriptDocumentCreate(lines)).get(name);
  return [...(variable?.kinds ?? [])].map((kind) => kind || '?').sort();
}

describe('SolidScript kinds stress: formulas', () => {
  it('gives a formula the kind its outer function declares, whatever is inside', () => {
    const lines = [
      line('cube', { into: 'Box' }),
      set('A', '[=Abs([Box.Faces.Count] * 2 - Floor([Nobody]))]'),
      set('B', '[=Abs([=Str([Box], "x")])]'),
      set('C', '[=Str([A], 1, [Box])]'),
      set('D', '[=Vector(1, [A], 3)]'),
      set('E', '[=[A] > 3 && IsNum([A])]'),
      set('F', '[=[A] > 1 ? 4 : "four"]'),
      set('G', '[=-[A] * 2 + [A] % 3]'),
      set('H', '[=[D] * 2]'),
      set('I', '[=Len([Box.Faces])]'),
      set('J', '[=[Nobody] + 1]'),
    ];
    expect(kindsEnd(lines, 'a')).toEqual(['Number']);
    expect(kindsEnd(lines, 'b')).toEqual(['Number']);
    expect(kindsEnd(lines, 'c')).toEqual(['Text']);
    expect(kindsEnd(lines, 'd')).toEqual(['Vector']);
    expect(kindsEnd(lines, 'e')).toEqual(['Yes/No']);
    expect(kindsEnd(lines, 'f')).toEqual(['Number', 'Text']);
    expect(kindsEnd(lines, 'g')).toEqual(['Number']);
    expect(kindsEnd(lines, 'h')).toEqual(['Vector']);
    expect(kindsEnd(lines, 'i')).toEqual(['Number']);
    expect(kindsEnd(lines, 'j')).toEqual(['?']);
  });

  it('gives every built-in function the kinds its definition declares', () => {
    for (const [key, doc] of Object.entries(SOLID_SCRIPT_FUNCTION_DOCS)) {
      const kinds = kindsEnd([set('R', `[=${solidScriptFunctionSpelling(key)}(1)]`)], 'r');
      expect(kinds, key).toEqual(doc.gives === 'Any' ? ['?'] : [...doc.gives].sort());
    }
  });

  it('reads a formula that cannot be parsed, or brackets as $[ $], without guessing', () => {
    const lines = [set('A', '[=Abs(]'), set('B', '[=$[1, 2, 3$]]'), set('C', '[=Unknown(1)]')];
    expect(kindsEnd(lines, 'a')).toEqual(['?']);
    expect(kindsEnd(lines, 'b')).toEqual(['Vector']);
    expect(kindsEnd(lines, 'c')).toEqual(['?']);
  });
});

describe('SolidScript kinds stress: Functions', () => {
  it('shows a Function input the union of what every Call passes, and its Return the union back', () => {
    const lines = [
      line('function', { name: 'ToString', parameters: 'Value' }),
      line('return', { value: '[=Str([Local.Value])]' }),
      END,
      line('cube', { into: 'Henry' }),
      line('call', { name: 'ToString', values: '1', result: 'R1' }),
      line('call', { name: 'ToString', values: '[Henry]', result: 'R2' }),
      line('call', { name: 'ToString', values: 'oak', result: 'R3' }),
      set('R4', '[=ToString([Henry.Faces])]'),
    ];
    expect(kindsAt(lines, 1, 'local.value')).toEqual(['Brush', 'Face List', 'Number', 'Text']);
    expect(kindsEnd(lines, 'r1')).toEqual(['Text']);
    expect(kindsEnd(lines, 'r4')).toEqual(['Text']);
  });

  it('joins what different Return lines give on different paths', () => {
    const lines = [
      line('function', { name: 'Choose', parameters: 'N' }),
      line('if', { condition: '[Local.N] > 1' }),
      line('return', { value: '5' }),
      ELSE,
      line('cube', { into: 'Local.Made' }),
      line('return', { value: '[Local.Made]' }),
      END,
      END,
      line('call', { name: 'Choose', values: '2', result: 'R' }),
      set('S', '[=Choose(3)]'),
    ];
    expect(kindsEnd(lines, 'r')).toEqual(['Brush', 'Number']);
    expect(kindsEnd(lines, 's')).toEqual(['Brush', 'Number']);
    expect(kindsAt(lines, 5, 'local.made')).toEqual(['Brush']);
  });

  it('ends on recursion, direct, through another Function and without a way out', () => {
    const lines = [
      line('function', { name: 'Fact', parameters: 'N' }),
      line('if', { condition: '[Local.N] <= 1' }),
      line('return', { value: '1' }),
      END,
      line('return', { value: '[=[Local.N] * Fact([Local.N] - 1)]' }),
      END,
      line('function', { name: 'Ping', parameters: 'X' }),
      line('call', { name: 'Pong', values: '[Local.X]', result: 'Local.Y' }),
      line('return', { value: '[Local.Y]' }),
      END,
      line('function', { name: 'Pong', parameters: 'X' }),
      line('if', { condition: 'IsString([Local.X])' }),
      line('return', { value: '[Local.X]' }),
      END,
      line('call', { name: 'Ping', values: '[=Str([Local.X])]', result: 'Local.Z' }),
      line('return', { value: '[Local.Z]' }),
      END,
      line('function', { name: 'Forever', parameters: 'X' }),
      line('call', { name: 'Forever', values: '[Local.X]', result: 'Local.R' }),
      line('return', { value: '[Local.R]' }),
      END,
      line('call', { name: 'Fact', values: '5', result: 'F' }),
      line('call', { name: 'Ping', values: '7', result: 'P' }),
      line('call', { name: 'Forever', values: '7', result: 'Q' }),
    ];
    expect(kindsEnd(lines, 'f')).toEqual(['Number']);
    expect(kindsEnd(lines, 'p')).toEqual(['Text']);
    expect(kindsEnd(lines, 'q')).toEqual(['?']);
  });

  it('passes kinds through chains of Local inputs', () => {
    const lines = [
      line('function', { name: 'Outer', parameters: 'P' }),
      line('call', { name: 'Middle', values: '[Local.P]', result: 'Local.R' }),
      line('return', { value: '[Local.R]' }),
      END,
      line('function', { name: 'Middle', parameters: 'Q' }),
      line('call', { name: 'Inner', values: '[Local.Q.Faces(0)]', result: 'Local.S' }),
      line('return', { value: '[Local.S]' }),
      END,
      line('function', { name: 'Inner', parameters: 'Face' }),
      line('return', { value: '[Local.Face.Edges]' }),
      END,
      line('cube', { into: 'Box' }),
      line('call', { name: 'Outer', values: '[Box]', result: 'Out' }),
    ];
    expect(kindsAt(lines, 5, 'local.q')).toEqual(['Brush']);
    expect(kindsAt(lines, 9, 'local.face')).toEqual(['Face']);
    expect(kindsEnd(lines, 'out')).toEqual(['Edge List']);
    expect(kindsEnd(lines, 'local.r')).toEqual([]);
  });
});

describe('SolidScript kinds stress: blocks', () => {
  it('reaches a fixed point when loops pass kinds round through several variables', () => {
    const lines = [
      set('A', '1'),
      set('B', 'oak'),
      line('cube', { into: 'C' }),
      line('repeat', { variable: 'I', from: '0', to: '9' }),
      set('A', '[B]'),
      set('B', '[C]'),
      set('C', '[C.Faces]'),
      END,
    ];
    expect(kindsEnd(lines, 'a')).toEqual(['Brush', 'Face List', 'Number', 'Text']);
    expect(kindsAt(lines, 4, 'a')).toEqual(['Brush', 'Face List', 'Number', 'Text']);
    expect(kindsEnd(lines, 'c')).toEqual(['Brush', 'Face List']);
    expect(kindsAt(lines, 5, 'i')).toEqual(['Number']);
  });

  it('reassigns inside If and Else in a loop, and joins at every End', () => {
    const lines = [
      set('X', '1'),
      line('for_each', { variable: 'Item', list: '1, oak, 3' }),
      line('if', { condition: '[Coin] == 1' }),
      line('cube', { into: 'X' }),
      ELSE,
      line('if', { condition: '[Coin] == 2' }),
      set('X', '[Item]'),
      END,
      END,
      END,
    ];
    expect(kindsAt(lines, 2, 'item')).toEqual(['Number', 'Text']);
    expect(kindsAt(lines, 8, 'x')).toEqual(['Brush', 'Number', 'Text']);
    expect(kindsEnd(lines, 'x')).toEqual(['Brush', 'Number', 'Text']);
  });

  it('reuses one loop name across a Repeat and a For Each', () => {
    const lines = [
      line('cube', { into: 'Box' }),
      line('repeat', { variable: 'I', from: '0', to: '2' }),
      set('Seen', '[I]'),
      END,
      line('for_each', { variable: 'I', list: '[Box.Faces]', key: 'K' }),
      set('Seen', '[I]'),
      END,
      line('for_each', { variable: 'I', list: '[Box.Data]', key: 'K' }),
      END,
    ];
    expect(kindsAt(lines, 2, 'i')).toEqual(['Number']);
    expect(kindsAt(lines, 5, 'i')).toEqual(['Face']);
    expect(kindsAt(lines, 5, 'k')).toEqual(['Number']);
    expect(kindsAt(lines, 7, 'i')).toEqual(['Face', 'Number']);
    expect(kindsAt(lines, 8, 'k')).toEqual(['Text']);
    expect(kindsEnd(lines, 'seen')).toEqual(['Face', 'Number']);
  });

  it('follows Data paths, members, items and system values', () => {
    const lines = [
      line('cube', { into: 'B' }),
      set('D', '[B.Data.Height]'),
      set('E', '[B.Faces(0).Edges]'),
      set('F', '[B.Faces.Area]'),
      set('G', '[B.Faces.Count]'),
      set('H', '[$Selected.Faces]'),
      set('L', '1, oak'),
      set('M', '[L.Anything]'),
      set('N', '[B.Faces.First.Normal.x]'),
      set('B.Data.Kind', 'trim'),
      set('P()', '1'),
      set('P(0)', 'oak'),
    ];
    expect(kindsEnd(lines, 'd')).toEqual(['?']);
    expect(kindsEnd(lines, 'e')).toEqual(['Edge List']);
    expect(kindsEnd(lines, 'f')).toEqual(['Number List']);
    expect(kindsEnd(lines, 'g')).toEqual(['Number']);
    expect(kindsEnd(lines, 'h')).toEqual(['Face List']);
    expect(kindsEnd(lines, 'm')).toEqual(['?']);
    expect(kindsEnd(lines, 'n')).toEqual(['Number']);
    expect(kindsEnd(lines, 'b')).toEqual(['Brush']);
    expect(kindsEnd(lines, 'p')).toEqual(['List']);
  });

  it('reads an item picked by a name or a formula inside the brackets', () => {
    const lines = [
      line('cube', { into: 'B' }),
      set('Pts', '[B.Faces]'),
      set('K', '0'),
      set('A', '[Pts([K])]'),
      set('X', '[Pts([=[K] + 0.5]).Normal.x]'),
      set('Both', '[A] and [K]'),
      set('Y', '[=[Pts([K])].Normal]'),
      set('Named', '[Part[K]]'),
    ];
    expect(kindsEnd(lines, 'pts')).toEqual(['Face List']);
    expect(kindsEnd(lines, 'a')).toEqual(['Face']);
    expect(kindsEnd(lines, 'x')).toEqual(['Number']);
    expect(kindsEnd(lines, 'both')).toEqual(['Text']);
    expect(kindsEnd(lines, 'y')).toEqual(['Vector']);
    expect(kindsEnd(lines, 'named')).toEqual(['?']);
  });

  it('ignores lines that are turned off, whatever they are', () => {
    const lines = [
      set('X', '1'),
      off(line('cube', { into: 'X' })),
      off(line('function', { name: 'F', parameters: 'A' })),
      set('Y', 'oak'),
      off(END),
      off(line('call', { name: 'F', values: '1', result: 'X' })),
      off(line('repeat', { variable: 'X' })),
      off(END),
    ];
    expect(kindsEnd(lines, 'x')).toEqual(['Number']);
    expect(kindsEnd(lines, 'y')).toEqual(['Text']);
  });

  it('is not fooled by brackets, case, deletes, Inputs written by Set or stray lines', () => {
    const lines = [
      line('input', { name: 'Steps', type: 'count' }),
      set('[Henry]', '1'),
      set('HENRY', '[henry]'),
      set('Steps', 'oak'),
      line('delete_variable', { name: 'Gone' }),
      set('Gone', '1'),
      line('delete_variable', { name: 'Gone' }),
      line('clear_variable', { name: 'Henry' }),
      END,
      ELSE,
      line('call', { name: 'Nobody', values: '1', result: 'R' }),
      set('Empty', ''),
      line('return', { value: 'oak' }),
      set('Never', '1'),
    ];
    expect(kindsEnd(lines, 'henry')).toEqual(['Number']);
    expect(kindsEnd(lines, 'steps')).toEqual(['Number']);
    expect(kindsEnd(lines, 'gone')).toEqual([]);
    expect(kindsEnd(lines, 'r')).toEqual(['?']);
    expect(kindsEnd(lines, 'empty')).toEqual(['Text']);
    expect(kindsEnd(lines, 'never')).toEqual([]);
    expect(kindsAt(lines, 14, 'empty')).toEqual(['Text']);
  });
});

describe('SolidScript kinds stress: If conditions narrow', () => {
  const mixed = [line('if', { condition: '[Coin] == 1' }), set('H', '4'), ELSE, set('H', 'four'), END];

  it('narrows a name compared with a number on both sides, as anything else stops the script', () => {
    const lines = [...mixed, line('if', { condition: '[H] > 3' }), set('In', '[H]'), ELSE, set('Out', '[H]'), END];
    expect(kindsAt(lines, 5, 'h')).toEqual(['Number', 'Text']);
    expect(kindsAt(lines, 6, 'h')).toEqual(['Number']);
    expect(kindsAt(lines, 8, 'h')).toEqual(['Number']);
  });

  it('narrows with kind checks, their negation, && and ||', () => {
    const lines = [
      ...mixed,
      line('if', { condition: 'IsNum([H])' }),
      set('A', '[H]'),
      ELSE,
      set('B', '[H]'),
      END,
      line('if', { condition: '!IsString([H]) && [K] > 0' }),
      set('C', '[H]'),
      END,
      line('if', { condition: 'IsNum([H]) || IsBool([H])' }),
      set('D', '[H]'),
      ELSE,
      set('E', '[H]'),
      END,
    ];
    expect(kindsAt(lines, 6, 'h')).toEqual(['Number']);
    expect(kindsAt(lines, 8, 'h')).toEqual(['Text']);
    expect(kindsAt(lines, 11, 'h')).toEqual(['Number']);
    // No line sets K, so the If may not make it up: the run stops at [K].
    expect(kindsAt(lines, 11, 'k')).toEqual([]);
    expect(kindsAt(lines, 14, 'h')).toEqual(['Number']);
    expect(kindsAt(lines, 16, 'h')).toEqual(['Text']);
  });

  it('narrows an equality to its value where it holds, and leaves the rest where it does not', () => {
    const lines = [...mixed, line('if', { condition: '[H] == "abc"' }), set('A', '[H]'), ELSE, set('B', '[H]'), END];
    expect(kindsAt(lines, 6, 'h')).toEqual(['Text']);
    expect(kindsAt(lines, 8, 'h')).toEqual(['Number', 'Text']);
  });

  it('drops a branch no run can take: Inputs keep their declared kind, and constants', () => {
    const lines = [
      line('input', { name: 'Mode', type: 'number' }),
      line('input', { name: 'Fancy', type: 'switch' }),
      line('if', { condition: '[Mode] == "Wide"' }),
      set('Z', '1'),
      END,
      line('if', { condition: '1 == 2' }),
      set('W', '1'),
      ELSE,
      set('V', 'oak'),
      END,
      line('if', { condition: '[Fancy]' }),
      line('cube', { into: 'Out' }),
      ELSE,
      set('Out', 'none'),
      END,
      line('if', { condition: 'IsString([Out])' }),
      set('T', '[Out]'),
      ELSE,
      set('U', '[Out]'),
      END,
    ];
    expect(kindsEnd(lines, 'z')).toEqual([]);
    expect(kindsAt(lines, 3, 'mode')).toEqual(['Number']);
    expect(kindsEnd(lines, 'w')).toEqual([]);
    expect(kindsEnd(lines, 'v')).toEqual(['Text']);
    expect(kindsAt(lines, 15, 'out')).toEqual(['Brush', 'Text']);
    expect(kindsEnd(lines, 't')).toEqual(['Text']);
    expect(kindsEnd(lines, 'u')).toEqual(['Brush']);
  });
});

describe('SolidScript kind checks squiggle only what no run can use', () => {
  const check = (lines: SolidScriptLine[]) =>
    solidScriptKindCheck(solidScriptDocumentCreate(lines)).map((warning) => `${warning.line}: ${warning.text}`);

  it('warns about a field, a member and a formula input whose every possible kind is wrong', () => {
    const lines = [
      set('Flag', '[=1 > 2]'),
      line('cube', { into: 'Box' }),
      set('Word', 'oak'),
      line('extrude_face', { of: '[Flag]' }),
      line('echo', { value: '[Word.Faces]' }),
      line('echo', { value: '[=Abs([Box])]' }),
      line('cube', { size: '[Box], 1, 1' }),
    ];
    expect(check(lines)).toEqual([
      '4: Of needs a Brush, Face or Text, or a list of them, not a Yes/No',
      '5: [Word] holds Text, which has no .Faces; it has .Length, .Words',
      '6: Abs() needs a Number for Number, not a Brush',
    ]);
  });

  it('says nothing when any way through the script may give a usable value', () => {
    const lines = [
      set('Maybe', '[=1 > 2]'),
      line('if', { condition: '[Coin] == 1' }),
      line('cube', { into: 'Maybe' }),
      END,
      line('extrude_face', { of: '[Maybe]' }),
      line('echo', { value: '[Maybe.Faces] [Unknown.Faces] [=Abs([Unknown])]' }),
      line('echo', { value: '[=Abs([=Str(1)])]' }),
    ];
    expect(check(lines)).toEqual([]);
  });
});

/**
 * Builds Functions F0 to F(count-1); each calls the next inside nested Repeats,
 * once in a formula and once by Call, and the last calls F0 again.
 *
 * @param count Functions.
 * @param loops Repeats around each call.
 * @returns Lines.
 */
function chain(count: number, loops: number): SolidScriptLine[] {
  const lines: SolidScriptLine[] = [];
  for (let at = 0; at < count; at++) {
    const next = `F${(at + 1) % count}`;
    lines.push(line('function', { name: `F${at}`, parameters: 'X' }));
    for (let deep = 0; deep < loops; deep++) lines.push(line('repeat', { variable: `I${deep}`, from: '0', to: '3' }));
    lines.push(set('Local.Y', `[=${next}([Local.X])]`));
    lines.push(line('call', { name: next, values: '[Local.Y]', result: 'Local.X' }));
    for (let deep = 0; deep < loops; deep++) lines.push(END);
    lines.push(line('return', { value: '[Local.X]' }), END);
  }
  return lines;
}

describe('the analyzer stays quick', () => {
  it('follows a ring of Functions called in nested loops without blowing up', () => {
    const lines = [
      ...chain(6, 3),
      line('repeat', { variable: 'J' }),
      line('call', { name: 'F0', values: '1', result: 'R' }),
      END,
    ];
    const started = performance.now();
    expect(kindsEnd(lines, 'r')).toEqual(['?', 'Number']);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('follows a chain of ten Functions to the kind given at its end', () => {
    const lines: SolidScriptLine[] = [];
    for (let at = 0; at < 10; at++) {
      lines.push(line('function', { name: `G${at}`, parameters: 'X' }));
      lines.push(line('return', { value: at < 9 ? `[=G${at + 1}([Local.X])]` : '[Local.X]' }), END);
    }
    lines.push(line('call', { name: 'G0', values: 'oak', result: 'R' }));
    expect(kindsEnd(lines, 'r')).toEqual(['Text']);
  });
});
