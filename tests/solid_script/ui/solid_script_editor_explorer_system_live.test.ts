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

/** A cube, its top face picked, then a second cube. */
const PICKED: SolidScriptLine[] = [
  { command: 'cube', values: {} },
  { command: 'select_objects' },
  { command: 'select_faces', values: { which: 'Facing Up' } },
  { command: 'cube', values: {} },
];

/** Opens the System names of the variable explorer. */
function systemShow(): void {
  find<HTMLButtonElement>('[data-tab="variables"]').click();
  categoryShow('System');
}

/**
 * Reads the value cell of a system name in the explorer.
 *
 * @param name System name.
 * @returns Value text.
 */
function valueOf(name: string): string | undefined {
  return explorerRows()
    .find(
      (row) =>
        row
          .split('|')[0]
          ?.replace(/^[▸▾] /, '')
          .replace(/\(\)$/, '') === name,
    )
    ?.split('|')[1];
}

/**
 * Opens a list row of the explorer and returns its item rows.
 *
 * @param name List name.
 * @returns Item rows as name|value.
 */
function itemsOf(name: string): string[] {
  find(`.solid-script-editor-explorer-row[data-name="${name}"] > *`).click();
  return explorerRows()
    .filter((row) => row.startsWith(`${name}(`))
    .map((row) => row.split('|').slice(0, 2).join('|'));
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('System names show the values of the run where it was captured', () => {
  it('says nothing ran yet for an empty script', () => {
    editorFixture([]);
    systemShow();
    expect(caption()).toBe('Nothing ran yet; built-in values as they read now');
    expect(valueOf('$Selected.Faces')).toBe('Nothing Ran Yet');
    expect(valueOf('$NZ')).toBe('Only Inside Lines That Fill It');
  });

  it('shows the lists at the end of a finished run, with their items', () => {
    editorFixture(PICKED);
    systemShow();
    expect(caption()).toBe('At the end of the run; built-in values as they read now');
    expect(valueOf('$Selected.Faces')).toBe('[Face 3]');
    expect(valueOf('$Selected.Objects')).toBe('[cube]');
    expect(itemsOf('$Selected.Objects')).toEqual(['$Selected.Objects(0)|cube']);
    expect(itemsOf('$Selected.Faces')).toEqual(['$Selected.Faces(0)|Face 3']);
  });

  it('shows the lists where a breakpoint paused the run, before its line', () => {
    const { root } = editorFixture(PICKED);
    find('[data-line="3"] .solid-script-editor-gutter').click();
    tool('Start').click();
    expect(root.textContent).toContain('Stopped at the breakpoint on line 4, before it runs');
    systemShow();
    expect(valueOf('$Selected.Faces')).toBe('[Face 3]');
    expect(valueOf('$Selected.Objects')).toBe('[cube]');
    linePress(3);
    categoryShow('Context');
    expect(valueOf('$Selected.Faces')).toBe('[Face 3]');
    expect(itemsOf('$Selected.Faces')).toEqual(['$Selected.Faces(0)|Face 3']);
  });

  it('says when the fills of the paused line hold values, in System and Context', () => {
    editorFixture(PICKED);
    find('[data-line="2"] .solid-script-editor-gutter').click();
    tool('Start').click();
    systemShow();
    expect(valueOf('$NZ')).toBe('Set for Each Element While Line 3 Runs');
    expect(valueOf('$Index')).toBe('Set for Each Element While Line 3 Runs');
    expect(valueOf('$X')).toBe('Set for Each Element While Line 3 Runs');
    expect(valueOf('$Point')).toBe('Only Inside Lines That Fill It');
    expect(valueOf('$Selected.Faces')).toBe('[]');
    linePress(2);
    categoryShow('Context');
    expect(valueOf('$Face')).toBe('Set for Each Element While Line 3 Runs');
  });

  it('follows each debugger step', () => {
    editorFixture(PICKED);
    tool('Step').click();
    systemShow();
    expect(caption()).toBe('At step 1, line 1; built-in values as they read now');
    expect(valueOf('$Selected.Objects')).toBe('[]');
    expect(valueOf('$Selected.Faces')).toBe('[]');
    tool('Step').click();
    expect(caption()).toBe('At step 2, line 4; built-in values as they read now');
    expect(valueOf('$Selected.Objects')).toBe('[cube]');
    expect(valueOf('$Selected.Faces')).toBe('[Face 3]');
  });

  it('lists $Persistent and $Local, muted when empty, $Persistent opening to its names', () => {
    editorFixture([{ command: 'variable', values: { name: '$Persistent.Page', value: '1' } }]);
    systemShow();
    expect(valueOf('$Local')).toBe('Only Inside a Function');
    expect(find('[data-name="$Local"] > :nth-child(2)').classList).toContain(
      'solid-script-editor-explorer-placeholder',
    );
    expect(valueOf('$Persistent')).toBe('1 Value');
    expect(find('[data-name="$Persistent"] > :nth-child(2)').classList).not.toContain(
      'solid-script-editor-explorer-placeholder',
    );
    find('.solid-script-editor-explorer-row[data-name="$Persistent"] > *').click();
    expect(explorerRows().filter((row) => row.startsWith('$Persistent.'))).toContainEqual(
      expect.stringMatching(/^\$Persistent\.Page\|1\|/),
    );
    expect(explorerRows().some((row) => row.includes('$Persistent()'))).toBe(false);
  });
});
