import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDebugBreakpointAllowed } from '@/solid_script/debug/solid_script_debug_breakpoints.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';
import { SOLID_SCRIPT_LIMITS, solidScriptLimitCount } from '@/solid_script/language/solid_script_limits.js';
import type { SolidScriptRun } from '@/solid_script/language/solid_script_machine_types.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * Makes a Note line.
 *
 * @param text Note text.
 * @returns Line.
 */
function note(text: string): SolidScriptLine {
  return { command: 'note', values: { text } };
}

/** Lines with Notes and their line numbers once every Note is left out. */
interface SolidScriptNotedLines {
  /** Lines without any Note. */
  plain: SolidScriptLine[];
  /**
   * For each 1-based line of the noted script, its 1-based line without Notes,
   * or 0 for a Note.
   */
  lineWithoutNotes: number[];
}

/**
 * Leaves out every Note of a script and remembers where each other line went.
 *
 * @param lines Lines that may hold Notes.
 * @returns Lines without Notes and the line map.
 */
function notesLeftOut(lines: readonly SolidScriptLine[]): SolidScriptNotedLines {
  const plain: SolidScriptLine[] = [];
  const lineWithoutNotes = [0];
  for (const line of lines) {
    if (line.command === 'note') lineWithoutNotes.push(0);
    else lineWithoutNotes.push(plain.push(line));
  }
  return { plain, lineWithoutNotes };
}

/**
 * Puts a Note before every line, the lines inside blocks too.
 *
 * @param lines Lines.
 * @returns Lines with Notes.
 */
function notesEverywhere(lines: readonly SolidScriptLine[]): SolidScriptLine[] {
  return lines.flatMap((line, index) => [note(`before line ${index + 1}`), note('a second note'), line]);
}

/**
 * Runs lines.
 *
 * @param lines Lines.
 * @param options Run options.
 * @returns Run result.
 */
function run(lines: readonly SolidScriptLine[], options: Parameters<typeof solidScriptProgramRun>[1] = {}) {
  return solidScriptProgramRun(solidScriptDocumentCreate([...lines]), options);
}

/**
 * The parts of a run that must not depend on Notes, with line numbers written
 * as the lines without Notes number them.
 *
 * @param result Run result.
 * @param lineWithoutNotes Line map, or null when the run had no Notes.
 * @returns Comparable summary.
 */
function outcome(result: SolidScriptRun, lineWithoutNotes: readonly number[] | null) {
  const line = (at: number): number => (lineWithoutNotes ? (lineWithoutNotes[at] ?? -1) : at);
  return {
    shapes: JSON.stringify(result.shapes),
    messages: result.messages,
    steps: result.steps.map(line),
    error: result.error
      ? { line: line(result.error.line ?? -1), message: result.error.message.replace(/^line \d+: /i, '') }
      : null,
    variables: result.variables,
  };
}

/**
 * Expects a script with Notes to run exactly like the same script without them.
 *
 * @param noted Lines with Notes.
 * @param options Run options.
 */
function expectNotesChangeNothing(noted: readonly SolidScriptLine[], options: Parameters<typeof run>[1] = {}): void {
  const { plain, lineWithoutNotes } = notesLeftOut(noted);
  expect(outcome(run(noted, options), lineWithoutNotes)).toEqual(outcome(run(plain, options), null));
}

/** A loop that counts, a For Each, a Function called from a formula and a Call. */
const LOOPS: SolidScriptLine[] = [
  { command: 'function', values: { name: 'Twice', parameters: 'A' } },
  { command: 'return', values: { value: '[=[$Local.A] * 2]' } },
  END,
  { command: 'function', values: { name: 'Post', parameters: 'X' } },
  { command: 'transform', values: { move: '[$Local.X], 0, 0' } },
  { command: 'cube', values: { size: '0.2, 1, 0.2' } },
  END,
  END,
  { command: 'variable', values: { name: 'Total', value: '0' } },
  { command: 'repeat', values: { variable: 'I', from: '1', to: '31' } },
  { command: 'variable', values: { name: 'Total', value: '[=[Total] + Twice([I])]' } },
  END,
  { command: 'for_each', values: { variable: 'X', list: '1, 2, 3' } },
  { command: 'call', values: { name: 'Post', values: '[X]' } },
  END,
  { command: 'echo', values: { value: '[Total]' } },
];

describe('SolidScript Notes at run time', { timeout: 60_000 }, () => {
  it('gives the same shapes, messages and variables with a Note before every line, inside loops and functions', () => {
    const noted = notesEverywhere(LOOPS);
    expectNotesChangeNothing(noted);
    expect(run(noted).messages).toEqual(['930']);
  });

  it('builds every official example exactly as it does with its Notes left out', () => {
    for (const example of SOLID_SCRIPT_EXAMPLES) {
      expect(example.lines.some((line) => line.command === 'note')).toBe(true);
      expectNotesChangeNothing(example.lines, { inputs: { width: '4', depth: '4', height: '3' } });
    }
  });

  it('reports a mistake inside a loop at its own line, counting the Notes above it', () => {
    const noted = [
      note('one'),
      { command: 'repeat', values: { variable: 'I', from: '1', to: '4' } },
      note('two'),
      note('three'),
      { command: 'cube', values: { size: '[Missing], 1, 1' } },
      END,
    ];
    const result = run(noted);
    expect(result.error?.line).toBe(5);
    expect(result.error?.message).toMatch(/^line 5: /);
  });

  it('never lets a breakpoint sit on a Note, and pauses at the next working line with its own number', () => {
    const lines = [
      { command: 'repeat', values: { variable: 'I', from: '0', to: '3' } },
      note('the cube'),
      { command: 'cube' },
      END,
    ];
    const document = solidScriptDocumentCreate(lines);
    expect(solidScriptDebugBreakpointAllowed(document.blocks[1])).toBe(false);
    expect(solidScriptDebugBreakpointAllowed(document.blocks[2])).toBe(true);
    const onNote = solidScriptProgramRun(document, { breakpoints: { lines: new Set([2]), pauseAt: 1 } });
    expect(onNote.breaks).toEqual([]);
    expect(onNote.paused).toBeNull();
    const onCube = solidScriptProgramRun(document, { breakpoints: { lines: new Set([3]), pauseAt: 2 } });
    expect(onCube.paused).toEqual({ line: 3, steps: 1 });
  });

  it('steps through the same shapes with or without Notes, at every step', () => {
    const noted = notesEverywhere(LOOPS);
    const total = run(noted).steps.length;
    expect(total).toBe(3);
    for (let stepLimit = 0; stepLimit <= total; stepLimit++) expectNotesChangeNothing(noted, { stepLimit });
  });

  it('leaves Notes out of the line profile and counts the other lines the same', () => {
    const noted = notesEverywhere(LOOPS);
    const { plain, lineWithoutNotes } = notesLeftOut(noted);
    const notedProfile = run(noted, { profile: true }).profile;
    const plainProfile = run(plain, { profile: true }).profile;
    const counts = [...notedProfile].map(([line, entry]) => [lineWithoutNotes[line], entry.count]);
    expect(counts.every(([line]) => line !== 0)).toBe(true);
    expect(new Map(counts as [number, number][])).toEqual(new Map([...plainProfile].map(([l, e]) => [l, e.count])));
  });

  it('stops at the brush cap after the same number of brushes with Notes in the loop', () => {
    const noted = [
      { command: 'repeat', values: { variable: 'I', from: '1', to: '5002' } },
      note('two cubes a round'),
      { command: 'cube' },
      note('the second one'),
      { command: 'cube' },
      END,
    ];
    const result = run(noted);
    expect(result.error?.text).toContain(solidScriptLimitCount(SOLID_SCRIPT_LIMITS.brushes));
    expectNotesChangeNothing(noted);
  });

  it('stops at the work cap with the same message when Notes sit in the busiest loop', () => {
    const result = run([
      { command: 'repeat', values: { variable: 'I', from: '0', to: '10000' } },
      note('outer'),
      { command: 'repeat', values: { variable: 'J', from: '0', to: '10000' } },
      note('inner'),
      { command: 'if', values: { condition: '[I] < 0' } },
      { command: 'cube' },
      END,
      END,
      END,
    ]);
    expect(result.error?.text).toMatch(
      new RegExp(
        `^Line \\d+: the script stopped after ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.work)} steps of work`,
      ),
    );
  });
});
