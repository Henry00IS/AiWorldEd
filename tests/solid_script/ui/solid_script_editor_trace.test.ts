import { afterEach, describe, expect, it } from 'vitest';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { editorFixture, find, tool } from './solid_script_editor_fixture.js';

/** A cube, an If that is false around a sphere, then a cylinder. */
const BRANCHED: SolidScriptLine[] = [
  { command: 'variable', values: { name: 'Flag', value: '0' } },
  { command: 'cube', values: {} },
  { command: 'if', values: { condition: '[Flag] == 1' } },
  { command: 'sphere', values: {} },
  { command: 'end', values: {} },
  { command: 'cylinder', values: {} },
];

/**
 * Lists the traced lines.
 *
 * @returns 0-based lines.
 */
function traced(): number[] {
  return [...document.querySelectorAll('.solid-script-editor-traced')].map((row) =>
    Number(row.getAttribute('data-line')),
  );
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('Trace marks the lines the run passed', () => {
  it('says what it does and marks nothing until it is pressed', () => {
    editorFixture(BRANCHED);
    expect(tool('Trace').title).toMatch(/^Mark every line the run passed/);
    expect(tool('Trace').getAttribute('aria-pressed')).toBe('false');
    expect(traced()).toEqual([]);
  });

  it('marks the lines of a whole run without debugging, not a branch that did not run', () => {
    editorFixture(BRANCHED);
    tool('Trace').click();
    expect(tool('Trace').getAttribute('aria-pressed')).toBe('true');
    expect(traced()).toEqual([0, 1, 2, 5]);
    expect(find('[data-line="1"]').title).toBe('Traced: the run passed this line');
    tool('Trace').click();
    expect(traced()).toEqual([]);
  });

  it('marks only the lines before the breakpoint the run paused at', () => {
    editorFixture(BRANCHED);
    find('[data-line="5"] .solid-script-editor-gutter').click();
    tool('Trace').click();
    tool('Start').click();
    expect(traced()).toEqual([0, 1, 2]);
  });

  it('follows the debugger steps', () => {
    editorFixture(BRANCHED);
    tool('Trace').click();
    tool('Step').click();
    expect(traced()).toEqual([0, 1]);
    tool('Step').click();
    expect(traced()).toEqual([0, 1, 2, 5]);
  });

  it('marks the lines that ran before an error', () => {
    editorFixture([
      { command: 'cube', values: {} },
      { command: 'variable', values: { name: 'B', value: '[Nobody]' } },
      { command: 'sphere', values: {} },
    ]);
    tool('Trace').click();
    expect(traced()).toEqual([0, 1]);
  });
});
