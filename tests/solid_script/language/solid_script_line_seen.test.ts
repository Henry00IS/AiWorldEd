import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { SOLID_SCRIPT_SEEN_LIMIT } from '@/solid_script/language/solid_script_machine.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptLineSeen } from '@/solid_script/language/solid_script_machine_types.js';

const LOOP: SolidScriptLine[] = [
  { command: 'variable', values: { name: 'A', value: '1' } },
  { command: 'repeat', values: { variable: 'i', from: '0', to: '3' } },
  { command: 'variable', values: { name: 'A', value: '[=[A] + 1]' } },
  { command: 'cube', values: {} },
  { command: 'end', values: {} },
  { command: 'sphere', values: {} },
];

/**
 * Reads the values a line saw as name=value.
 *
 * @param seen Kept values of one line.
 * @returns Names with their values, locals included.
 */
function valuesOf(seen: SolidScriptLineSeen | null | undefined): string[] {
  if (!seen) return [];
  return [
    ...seen.variables.map((variable) => `${variable.name}=${variable.value}`),
    ...seen.stack.flatMap((frame) => frame.locals.map((local) => `${local.name}=${local.value}`)),
  ];
}

describe('SolidScript keeps what each line saw the last time it ran', () => {
  it('keeps the variables just before the last run of each line', () => {
    // Arrange
    const document = solidScriptDocumentCreate(LOOP);

    // Act
    const run = solidScriptProgramRun(document, { profile: true });

    // Assert
    expect(run.error).toBeNull();
    expect(valuesOf(run.seen.get(1))).toEqual([]);
    expect(valuesOf(run.seen.get(3))).toEqual(expect.arrayContaining(['A=3', 'i=2']));
    expect(valuesOf(run.seen.get(4))).toEqual(expect.arrayContaining(['A=4', 'i=2']));
    expect(valuesOf(run.seen.get(6))).toEqual(['A=4']);
    expect(run.seen.has(5)).toBe(false);
  });

  it('keeps nothing unless the run profiles', () => {
    // Act
    const run = solidScriptProgramRun(solidScriptDocumentCreate(LOOP));

    // Assert
    expect(run.seen.size).toBe(0);
  });

  it('stops keeping at the last step shown, so later lines keep their earlier runs', () => {
    // Act
    const run = solidScriptProgramRun(solidScriptDocumentCreate(LOOP), { profile: true, stepLimit: 2 });

    // Assert
    expect(valuesOf(run.seen.get(3))).toEqual(expect.arrayContaining(['A=2', 'i=1']));
    expect(valuesOf(run.seen.get(4))).toEqual(expect.arrayContaining(['A=3', 'i=1']));
    expect(run.seen.has(6)).toBe(false);
  });

  it('shows the variables of the last step shown, not as the run went on past it', () => {
    // Act
    const run = solidScriptProgramRun(solidScriptDocumentCreate(LOOP), { stepLimit: 2 });

    // Assert
    expect(run.variables.map((variable) => `${variable.name}=${variable.value}`)).toEqual(
      expect.arrayContaining(['A=3', 'i=1']),
    );
  });

  it('keeps the values before the line paused at, and none after it', () => {
    // Act
    const run = solidScriptProgramRun(solidScriptDocumentCreate(LOOP), {
      profile: true,
      breakpoints: { lines: new Set([4]), pauseAt: 2 },
    });

    // Assert
    expect(run.paused?.line).toBe(4);
    expect(valuesOf(run.seen.get(4))).toEqual(expect.arrayContaining(['A=3', 'i=1']));
    expect(valuesOf(run.seen.get(3))).toEqual(expect.arrayContaining(['A=2', 'i=1']));
    expect(run.seen.has(6)).toBe(false);
  });

  it('keeps the locals of the Function call that last ran the line', () => {
    // Act
    const run = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'function', values: { name: 'post', parameters: 'n' } },
        { command: 'cube', values: { size: '[$local.n], 1, 1' } },
        { command: 'end', values: {} },
        { command: 'call', values: { name: 'post', values: '3' } },
        { command: 'call', values: { name: 'post', values: '5' } },
      ]),
      { profile: true },
    );

    // Assert
    expect(run.error).toBeNull();
    expect(valuesOf(run.seen.get(2))).toContain('$Local.n=5');
  });

  it('keeps nothing for a line that runs again once too many values were kept', () => {
    // Arrange: the loop keeps two values per line run, so it passes the limit.
    const rounds = 10_000;
    const document = solidScriptDocumentCreate([
      { command: 'variable', values: { name: 'A', value: '1' } },
      {
        command: 'repeat',
        values: { variable: 'j', from: '1', to: String(Math.ceil(SOLID_SCRIPT_SEEN_LIMIT / rounds) + 1) },
      },
      { command: 'repeat', values: { variable: 'i', from: '1', to: String(rounds + 1) } },
      { command: 'variable', values: { name: 'A', value: '[i]' } },
      { command: 'end', values: {} },
      { command: 'end', values: {} },
      { command: 'sphere', values: {} },
    ]);

    // Act
    const run = solidScriptProgramRun(document, { profile: true });

    // Assert
    expect(run.error).toBeNull();
    expect(valuesOf(run.seen.get(2))).toEqual(['A=1']);
    expect(run.seen.get(4)).toBeNull();
    expect(run.seen.get(7)).toBeNull();
  });
});
