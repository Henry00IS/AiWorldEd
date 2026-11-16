import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptProgramRun, type SolidScriptProgramOptions } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  SOLID_SCRIPT_SYSTEM_GLOBALS,
  solidScriptSystemHostSet,
  solidScriptSystemPlayersSet,
  solidScriptTimeText,
} from '@/solid_script/language/solid_script_system.js';

/**
 * Echoes one field value and returns the text or the error.
 *
 * @param value Field value, such as [Editor.Version].
 * @param options Run options.
 * @returns Echoed text, or the error.
 */
function echo(value: string, options: SolidScriptProgramOptions = {}): string {
  const lines: SolidScriptLine[] = [
    { command: 'echo', values: { value } },
    { command: 'cube', values: {} },
  ];
  const run = solidScriptProgramRun(solidScriptDocumentCreate(lines), options);
  return run.error ? run.error.message : run.messages[0]!;
}

/**
 * Echoes one formula.
 *
 * @param formula Formula without [= ].
 * @returns Echoed text, or the error.
 */
function formula(formula: string): string {
  return echo(`[=${formula.replace(/([[\]])/g, '$$$1')}]`);
}

const HOST = {
  editorName: 'AI World Editor',
  editorVersion: '9.8.7',
  editorUrl: 'https://example.test/editor/',
  platform: 'desktop' as const,
  levelName: 'castle.aiw',
  roomName: 'Build Night',
  userName: 'Ada',
};

describe('SolidScript system values', () => {
  afterEach(() => {
    solidScriptSystemHostSet(() => ({ ...HOST, editorName: '', editorVersion: '', roomName: '' }));
    solidScriptSystemPlayersSet(null);
  });

  it('reads the editor, level, room and user', () => {
    solidScriptSystemHostSet(() => HOST);
    solidScriptSystemPlayersSet(() => 3);
    expect(echo('[Editor.Name] [Editor.Version] on [Editor.Platform]')).toBe('AI World Editor 9.8.7 on desktop');
    expect(echo('[Editor.Url]')).toBe('https://example.test/editor/');
    expect(echo('[Level.Name] in [Room.Name] with [Room.Players], online [Room.Online], by [User.Name]')).toBe(
      'castle.aiw in Build Night with 3, online true, by Ada',
    );
    solidScriptSystemHostSet(() => ({ ...HOST, roomName: '' }));
    solidScriptSystemPlayersSet(null);
    expect(echo('[Room.Online] [Room.Players]')).toBe('false 1');
  });

  it('tells where the script runs and counts runs', () => {
    expect(echo('[Run.Context]')).toBe('generator');
    expect(echo('[Run.Context]', { context: 'preview' })).toBe('preview');
    const first = Number(echo('[Run.Count]'));
    expect(Number(echo('[Run.Count]'))).toBe(first + 1);
    expect(Number(echo('[Run.Seed]'))).toBeGreaterThanOrEqual(0);
    expect(Number(echo('[Time.Delta]'))).toBeGreaterThanOrEqual(0);
  });

  it('reads the generator box, and explains its absence elsewhere', () => {
    expect(echo('[Box.Width] [Box.Depth] [Box.Height] [Box.Size.y]', { box: [4, 2, 3] })).toBe('4 2 3 2');
    expect(echo('[Box.Width]')).toMatch(/only known when the script runs in a generator/);
  });

  it('reads the time and constants', () => {
    expect(Number(echo('[Time.Year]'))).toBe(new Date().getFullYear());
    expect(echo('[Time.Date]')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(echo('[Math.Pi]'))).toBeCloseTo(Math.PI, 4);
    expect(Number(formula('Math.Tau / 2'))).toBeCloseTo(Math.PI, 4);
  });

  it('cannot be changed by the script', () => {
    const run = solidScriptProgramRun(
      solidScriptDocumentCreate([{ command: 'variable', values: { name: 'Time.Year', value: '1' } }]),
    );
    expect(run.error?.message).toMatch(/built-in|read/i);
  });

  it('lists a type and detail for every value', () => {
    for (const entry of SOLID_SCRIPT_SYSTEM_GLOBALS) {
      expect(entry.type.length).toBeGreaterThan(0);
      expect(entry.detail.length).toBeGreaterThan(5);
    }
  });
});

describe('SolidScript text and time functions', () => {
  it('writes a time with a pattern', () => {
    const seconds = new Date(2026, 10, 16, 9, 5, 7).getTime() / 1000;
    expect(solidScriptTimeText(seconds, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-11-16 09:05:07');
    expect(solidScriptTimeText(seconds, "dddd D MMMM 'at' h A")).toBe('Monday 16 November at 9 AM');
    expect(formula(`time_text(${seconds}, "ddd DD MMM YY")`)).toBe('Mon 16 Nov 26');
    expect(formula('time_text(Time.Now, "YYYY")')).toBe(String(new Date().getFullYear()));
  });

  it('pads, trims one side, capitalizes and counts', () => {
    expect(formula('pad_left(7, 3, "0")')).toBe('007');
    expect(formula('pad_right("ab", 4, ".")')).toBe('ab..');
    expect(formula('pad_left("abc", 2)')).toBe('abc');
    expect(formula('str(trim_start("  a  "), "|")')).toBe('a  |');
    expect(formula('str(trim_end("  a  "), "|")')).toBe('  a|');
    expect(formula('capitalize("hello world")')).toBe('Hello world');
    expect(formula('title_case("hello wide world")')).toBe('Hello Wide World');
    expect(formula('count_text("banana", "an")')).toBe('2');
    expect(formula('characters("abc")')).toBe('[a, b, c]');
    expect(formula('lines("a\\nb")')).toBe('[a, b]');
  });

  it('turns characters into codes and back', () => {
    expect(formula('character_code("A")')).toBe('65');
    expect(formula('character(97)')).toBe('a');
    expect(formula('character(character_code("x") + 1)')).toBe('y');
    expect(formula('character_code("")')).toMatch(/character_code\(text\) needs/);
    expect(formula('character(-1)')).toMatch(/character\(code\) needs/);
  });

  it('formats numbers', () => {
    expect(formula('format_number(3.14159, 2)')).toBe('3.14');
    expect(formula('format_number(1234567.891, 1, ",")')).toBe('1,234,567.9');
    expect(formula('format_number(-1234, 0, " ")')).toBe('-1 234');
    expect(formula('format_number(2, 3)')).toBe('2.000');
  });
});

describe('SolidScript explorer system values', () => {
  it('lists every built-in value read only with its type, value and detail', async () => {
    const { solidScriptExplorerEntries } = await import('@/solid_script/ui/solid_script_editor_explorer.js');
    solidScriptSystemHostSet(() => HOST);
    const entries = solidScriptExplorerEntries(solidScriptDocumentCreate([{ command: 'cube', values: {} }]), [], []);
    const version = entries.find((entry) => entry.name === 'Editor.Version');
    expect(version).toMatchObject({ category: 'System', value: '9.8.7', type: 'Text', readOnly: true });
    expect(version?.detail).toMatch(/version/);
    expect(entries.find((entry) => entry.name === 'Box.Width')?.value).toBe('Only in a Generator');
    expect(entries.filter((entry) => entry.category === 'System').length).toBeGreaterThanOrEqual(
      SOLID_SCRIPT_SYSTEM_GLOBALS.length,
    );
  });
});

describe('SolidScript math and list functions', () => {
  it('remaps, smooths, wraps, snaps and converts angles', () => {
    expect(formula('remap(5, 0, 10, 100, 200)')).toBe('150');
    expect(formula('smoothstep(0, 1, 0.5)')).toBe('0.5');
    expect(formula('smoothstep(0, 1, 2)')).toBe('1');
    expect(formula('wrap(370, 0, 360)')).toBe('10');
    expect(formula('wrap(-10, 0, 360)')).toBe('350');
    expect(formula('mod(-1, 4)')).toBe('3');
    expect(formula('snap(0.37, 0.25)')).toBe('0.25');
    expect(formula('fract(2.75)')).toBe('0.75');
    expect(Number(formula('radians(180)'))).toBeCloseTo(Math.PI, 5);
    expect(formula('degrees(Math.Pi)')).toBe('180');
    expect(formula('hypot(3, 4)')).toBe('5');
    expect(formula('between(5, 1, 9)')).toBe('true');
  });

  it('sums, averages and picks from lists', () => {
    expect(formula('sum([1, 2, 3])')).toBe('6');
    expect(formula('average([1, 2, 3, 6])')).toBe('3');
    expect(formula('first([4, 5, 6])')).toBe('4');
    expect(formula('last([4, 5, 6])')).toBe('6');
    expect(formula('slice([1, 2, 3, 4], 1, 2)')).toBe('[2, 3]');
    expect(formula('index_of(["a", "b"], "b")')).toBe('1');
    expect(formula('index_of(["a", "b"], "c")')).toBe('-1');
    expect(formula('unique([1, 2, 1, 3, 2])')).toBe('[1, 2, 3]');
    expect(formula('sorted([3, 1, 2])')).toBe('[1, 2, 3]');
    expect(formula('sorted(["b", "a"])')).toBe('[a, b]');
  });

  it('documents every built-in function', async () => {
    const { SOLID_SCRIPT_FUNCTIONS_BUILTIN } =
      await import('@/solid_script/language/solid_script_functions_builtin.js');
    const { SOLID_SCRIPT_FUNCTION_DOCS } = await import('@/solid_script/language/solid_script_function_docs.js');
    for (const name of Object.keys(SOLID_SCRIPT_FUNCTIONS_BUILTIN)) {
      const doc = SOLID_SCRIPT_FUNCTION_DOCS[name];
      expect(doc, name).toBeDefined();
      expect(doc!.usage.startsWith(`${name}(`), name).toBe(true);
      expect(doc!.summary.length, name).toBeGreaterThan(8);
    }
    expect(Object.keys(SOLID_SCRIPT_FUNCTION_DOCS).sort()).toEqual(Object.keys(SOLID_SCRIPT_FUNCTIONS_BUILTIN).sort());
  });
});
