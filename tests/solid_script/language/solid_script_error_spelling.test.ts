import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun, type SolidScriptProgramOptions } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * Runs lines with options.
 *
 * @param options Run options.
 * @param lines Lines.
 * @returns Run result.
 */
function runWith(options: SolidScriptProgramOptions, ...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), options);
}

/**
 * Returns the message a run stops with.
 *
 * @param lines Lines.
 * @returns Message, or an empty string.
 */
function failure(...lines: SolidScriptLine[]): string {
  return runWith({}, ...lines).error?.message ?? '';
}

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

describe('SolidScript messages spell names as they were written', () => {
  it('names a missing variable as written', () => {
    expect(failure(line('echo', { value: '[MissingThing]' }))).toMatch(/there is no variable \[MissingThing\];/);
  });

  it('spells a name a formula writes without brackets as written, with the formula that works for a known one', () => {
    const height = line('variable', { name: 'StepHeight', value: '2' });
    expect(failure(height, line('echo', { value: '[=Nope + 1]' }))).toMatch(
      /Nope needs brackets in a formula.*There is no variable Nope either; for a variable write \[Nope\], for text write "Nope"/,
    );
    expect(failure(height, line('echo', { value: '[=stepHeight + 1]' }))).toMatch(
      /stepHeight needs brackets in a formula.*Did you mean to write \[=\[stepHeight\] \+ 1\]\?/,
    );
  });

  it('teaches Local. in PascalCase outside a Function', () => {
    expect(failure(line('echo', { value: '[local.Width]' }))).toMatch(
      /\[Local\.Width\] is a local variable, and Local\. only works inside a Function; outside one, write \[Width\]/,
    );
  });

  it('names a list and its item as written', () => {
    const message = failure(line('variable', { name: 'Points()', value: '4' }), line('echo', { value: '[Points(5)]' }));
    expect(message).toMatch(/Points\(5\) does not exist: Points has 1 items/);
  });

  it('names an unknown function as written', () => {
    expect(failure(line('echo', { value: '[=FooBar(1)]' }))).toMatch(/unknown function FooBar\(\);/);
  });

  it('shows the call stack with the names as written', () => {
    const result = runWith(
      { breakpoints: { lines: new Set([3]), pauseAt: 1 } },
      line('function', { name: 'StepUp', parameters: 'Index' }),
      line('variable', { name: 'local.Height', value: '[=[Local.Index] * 2]' }),
      line('cube'),
      END,
      line('echo', { value: '[=stepup(3)]' }),
    );
    expect(result.stack.map((frame) => [frame.name, frame.locals.map((local) => local.name)])).toEqual([
      ['StepUp()', ['Local.Index', 'Local.Height']],
    ]);
  });
});
