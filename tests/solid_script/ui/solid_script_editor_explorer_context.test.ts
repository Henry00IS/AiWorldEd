import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import {
  solidScriptExplorerCaption,
  type SolidScriptExplorerRun,
} from '@/solid_script/ui/solid_script_editor_explorer.js';
import { solidScriptExplorerContextEntries } from '@/solid_script/ui/solid_script_editor_explorer_context.js';
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

/**
 * Builds a Set line.
 *
 * @param name Variable.
 * @param value Value.
 * @returns Line.
 */
const set = (name: string, value: string): SolidScriptLine => line('variable', { name, value });

const END = line('end');
const ELSE = line('else');

/** A run captured at its end. */
const RUN_END: SolidScriptExplorerRun = { caption: 'At the end of the run', stoppedBefore: null, ran: true };

/**
 * Lists what a line can read as name=type, system values left out.
 *
 * @param lines Script.
 * @param at 0-based line.
 * @returns Names with their types.
 */
function contextAt(lines: SolidScriptLine[], at: number): string[] {
  return solidScriptExplorerContextEntries(solidScriptDocumentCreate(lines), at, null)
    .filter((entry) => entry.category !== 'System')
    .map((entry) => `${entry.name}=${entry.type}${entry.setHere ? ' (set here)' : ''}`);
}

/**
 * Lists the system values a line can read.
 *
 * @param lines Script.
 * @param at 0-based line.
 * @returns System names.
 */
function systemAt(lines: SolidScriptLine[], at: number): string[] {
  return solidScriptExplorerContextEntries(solidScriptDocumentCreate(lines), at, null)
    .filter((entry) => entry.category === 'System')
    .map((entry) => entry.name);
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('Context lists what the focused line can read before it runs', () => {
  it('lists names set above, not below, and marks what the line sets', () => {
    const lines = [set('A', '1'), set('B', '[A]'), set('A', 'two'), set('C', '3')];
    expect(contextAt(lines, 0)).toEqual(['A=Number (set here)']);
    expect(contextAt(lines, 1)).toEqual(['A=Number', 'B=Number (set here)']);
    expect(contextAt(lines, 3)).toEqual(['A=Text', 'B=Number', 'C=Number (set here)']);
  });

  it('shows a loop counter from its loop line on, only inside its loop, with what the loop body set', () => {
    const lines = [
      set('A', '1'),
      line('repeat', { variable: 'I', from: '0', to: '3' }),
      line('cube', { into: 'Box' }),
      set('B', '[I]'),
      END,
      set('C', '[B]'),
    ];
    expect(contextAt(lines, 1)).toEqual(['A=Number', 'I=Number (set here)']);
    expect(contextAt(lines, 3)).toEqual(['A=Number', 'Box=Solid', 'B=Number (set here)', 'I=Number']);
    expect(contextAt(lines, 5).some((entry) => entry.startsWith('I='))).toBe(false);
  });

  it('narrows the kinds inside If branches', () => {
    const lines = [
      line('if', { condition: '[Coin] == 1' }),
      set('H', '4'),
      ELSE,
      set('H', 'four'),
      END,
      line('if', { condition: 'IsNum([H])' }),
      set('A', '[H]'),
      ELSE,
      set('B', '[H]'),
      END,
    ];
    expect(contextAt(lines, 5)).toContain('H=Number or Text');
    expect(contextAt(lines, 6)).toContain('H=Number');
    expect(contextAt(lines, 8)).toContain('H=Text');
  });

  it('lists a Function input with what every Call passes, only inside the Function', () => {
    const lines = [
      line('function', { name: 'Twice', parameters: 'Value' }),
      line('return', { value: '[=[Local.Value] * 2]' }),
      END,
      line('call', { name: 'Twice', values: '1', result: 'R' }),
      set('After', '[R]'),
    ];
    expect(contextAt(lines, 1)).toContain('Local.Value=Number');
    expect(contextAt(lines, 4).some((entry) => entry.startsWith('Local.Value'))).toBe(false);
    expect(contextAt(lines, 4)).toContain('R=Number');
  });

  it('lists the selected lists everywhere and the fills only on the line that fills them', () => {
    const lines = [line('cube'), line('displace', { distance: '[$NZ]' })];
    expect(systemAt(lines, 0)).toEqual([
      '$Selected.Objects',
      '$Selected.Faces',
      '$Selected.Edges',
      '$Selected.Vertices',
    ]);
    expect(systemAt(lines, 1)).toEqual([
      '$Selected.Objects',
      '$Selected.Faces',
      '$Selected.Edges',
      '$Selected.Vertices',
      '$Vertex',
      '$X',
      '$Y',
      '$Z',
      '$NX',
      '$NY',
      '$NZ',
      '$Count',
      '$Index',
      '$Id',
    ]);
  });

  it('lists nothing for an empty script or a line past its end', () => {
    expect(solidScriptExplorerContextEntries(solidScriptDocumentCreate([]), 0, null)).toEqual([]);
    expect(solidScriptExplorerContextEntries(solidScriptDocumentCreate([set('A', '1')]), 3, null)).toEqual([]);
  });
});

describe('Variable explorer captions say where the values come from', () => {
  it('captions each category in each state', () => {
    const stopped: SolidScriptExplorerRun = {
      caption: 'Stopped at the breakpoint on line 3, before it runs',
      stoppedBefore: 2,
      ran: true,
    };
    expect(solidScriptExplorerCaption('All', RUN_END, 0)).toBe('At the end of the run');
    expect(solidScriptExplorerCaption('Variables', stopped, 0)).toBe(stopped.caption);
    expect(solidScriptExplorerCaption('Context', RUN_END, 4)).toBe('Before line 5 runs');
    expect(solidScriptExplorerCaption('Context', stopped, 2, 'stopped')).toBe(
      'Before line 3 runs, with the values where the run stopped',
    );
    expect(solidScriptExplorerCaption('Context', stopped, 1, 'last')).toBe(
      'Before line 2 runs, with the values from the last time it ran',
    );
    expect(solidScriptExplorerCaption('Context', stopped, 5, 'captured')).toBe(
      'Line 6 has not run, so these are the values where the run stopped',
    );
    expect(solidScriptExplorerCaption('Context', RUN_END, 5, 'captured')).toBe(
      'Line 6 has not run, so these are the values at the end of the run',
    );
    expect(solidScriptExplorerCaption('Context', RUN_END, 5, 'often')).toBe(
      'Line 6 ran too many times to keep its values, so these are the values at the end of the run',
    );
    expect(solidScriptExplorerCaption('Context', RUN_END, null)).toBe('No line is focused.');
    expect(solidScriptExplorerCaption('System', stopped, 2)).toBe(
      'Stopped at the breakpoint on line 3, before it runs; built-in values as they read now',
    );
  });

  it('says nothing ran yet for an empty script, and no line is focused in Context', () => {
    editorFixture([]);
    expect(caption()).toBe('Nothing ran yet');
    categoryShow('Context');
    expect(caption()).toBe('No line is focused.');
    expect(find('.solid-script-editor-explorer-table').textContent).toContain('Click a line to see what it can read.');
  });

  it('says the values come from the end of the run, or from the error that stopped it', () => {
    editorFixture([set('A', '1'), line('cube')]);
    expect(caption()).toBe('At the end of the run');
    solidScriptEditorCurrentGet()?.close();
    document.body.replaceChildren();
    editorFixture([set('A', '1'), set('B', '[Nobody]')]);
    expect(caption()).toBe('Where the error on line 2 stopped the run');
  });

  it('follows the focused line live in Context', () => {
    editorFixture([line('cube', { into: 'Box' }), set('A', '[Box.Faces.Count]'), set('B', '[A]')]);
    linePress(0);
    categoryShow('Context');
    expect(caption()).toBe('Before line 1 runs, with the values from the last time it ran');
    expect(explorerRows().find((row) => row.startsWith('Box|'))).toContain('Set Here');
    expect(explorerRows().map((row) => row.split('|')[0])).not.toContain('A');
    linePress(2);
    expect(caption()).toBe('Before line 3 runs, with the values from the last time it ran');
    const rows = explorerRows();
    expect(rows.map((row) => row.split('|')[0])).toEqual(expect.arrayContaining(['Box', 'A', 'B', '$Selected.Faces']));
    expect(rows.find((row) => row.startsWith('B|'))).toContain('Set Here');
  });

  it('shows the values where a breakpoint stopped the run when its line is focused', () => {
    const { root } = editorFixture([
      line('sphere'),
      line('repeat', { variable: 'i', from: '0', to: '1' }),
      line('cube', { size: '[=[i] + 1], 1, 1' }),
      END,
    ]);
    find('[data-line="2"] .solid-script-editor-gutter').click();
    tool('Start').click();
    expect(root.textContent).toContain('Stopped at the breakpoint on line 3, before it runs');
    linePress(2);
    categoryShow('Context');
    expect(caption()).toBe('Before line 3 runs, with the values where the run stopped');
    expect(
      explorerRows()
        .find((row) => row.startsWith('i|'))
        ?.split('|')[1],
    ).toBe('0');
    linePress(0);
    expect(caption()).toBe('Before line 1 runs, with the values from the last time it ran');
  });
});

describe('Context stays fast while the focus moves', () => {
  it('reuses the analysis of the script for every focused line of a long script', () => {
    const lines: SolidScriptLine[] = [];
    for (let index = 0; index < 100; index++)
      lines.push(line('repeat', { variable: `I${index}`, from: '0', to: '2' }), set(`V${index}`, `[I${index}]`), END);
    const script = solidScriptDocumentCreate(lines);
    solidScriptExplorerContextEntries(script, 0, null);
    const started = performance.now();
    for (let at = 0; at < lines.length; at++) solidScriptExplorerContextEntries(script, at, null);
    const perLineMs = (performance.now() - started) / lines.length;
    expect(perLineMs).toBeLessThan(20);
  });
});
