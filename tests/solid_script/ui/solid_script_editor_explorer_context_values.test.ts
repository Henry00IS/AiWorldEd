import { afterEach, describe, expect, it } from 'vitest';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import {
  categoryShow,
  caption,
  editorFixture,
  explorerRows,
  find,
  linePress,
  tool,
} from './solid_script_editor_fixture.js';

/**
 * Builds a line.
 *
 * @param command Command id.
 * @param values Field texts.
 * @returns Line.
 */
const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/** A loop that counts A up, then a branch that never runs. */
const COUNTING: SolidScriptLine[] = [
  line('variable', { name: 'A', value: '1' }),
  line('repeat', { variable: 'i', from: '0', to: '2' }),
  line('variable', { name: 'A', value: '[=[A] + 1]' }),
  line('cube'),
  line('end'),
  line('if', { condition: '[A] > 100' }),
  line('variable', { name: 'B', value: '1' }),
  line('end'),
  line('sphere'),
];

/**
 * Reads the value Context shows for a name.
 *
 * @param name Shown name.
 * @returns Value text, or undefined when the name is not listed.
 */
function valueOf(name: string): string | undefined {
  return explorerRows()
    .find((row) => row.startsWith(`${name}|`))
    ?.split('|')[1];
}

/**
 * Focuses a line and shows its Context.
 *
 * @param at 0-based line.
 */
function contextOf(at: number): void {
  linePress(at);
  categoryShow('Context');
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('Context shows the values the focused line sees', () => {
  it('after a run, shows the values of the last time the line ran, else the end of the run', () => {
    editorFixture(COUNTING);
    contextOf(2);
    expect(caption()).toBe('Before line 3 runs, with the values from the last time it ran');
    expect(valueOf('A')).toBe('3');
    expect(valueOf('i')).toBe('2');
    contextOf(8);
    expect(caption()).toBe('Before line 9 runs, with the values from the last time it ran');
    expect(valueOf('A')).toBe('4');
    contextOf(6);
    expect(caption()).toBe('Line 7 has not run, so these are the values at the end of the run');
    expect(valueOf('A')).toBe('4');
  });

  it('at a breakpoint, shows the values before the paused line runs', () => {
    editorFixture(COUNTING);
    find('[data-line="3"] .solid-script-editor-gutter').click();
    tool('Start').click();
    contextOf(3);
    expect(caption()).toBe('Before line 4 runs, with the values where the run stopped');
    expect(valueOf('A')).toBe('2');
    expect(valueOf('i')).toBe('0');
    tool('Start').click();
    contextOf(3);
    expect(valueOf('A')).toBe('3');
    expect(valueOf('i')).toBe('1');
  });

  it('at a breakpoint, shows another focused line with its last run so far, else where the run stopped', () => {
    editorFixture(COUNTING);
    find('[data-line="3"] .solid-script-editor-gutter').click();
    tool('Start').click();
    contextOf(2);
    expect(caption()).toBe('Before line 3 runs, with the values from the last time it ran');
    expect(valueOf('A')).toBe('1');
    expect(valueOf('i')).toBe('0');
    contextOf(8);
    expect(caption()).toBe('Line 9 has not run, so these are the values where the run stopped');
    expect(valueOf('A')).toBe('2');
  });

  it('follows each debugger step', () => {
    editorFixture(COUNTING);
    tool('Step').click();
    contextOf(3);
    expect(caption()).toBe('Before line 4 runs, with the values from the last time it ran');
    expect(valueOf('A')).toBe('2');
    expect(valueOf('i')).toBe('0');
    tool('Step').click();
    contextOf(2);
    expect(valueOf('A')).toBe('2');
    expect(valueOf('i')).toBe('1');
    contextOf(8);
    expect(caption()).toBe('Line 9 has not run, so these are the values at step 2, line 4');
    expect(valueOf('A')).toBe('3');
  });
});
