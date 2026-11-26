import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentEvent } from '@/solid_script/document/solid_script_document_event.js';

const RESET: SolidScriptLine = { command: 'input', values: { name: 'ResetAll', type: 'Button', default: '' } };
const SHOW: SolidScriptLine = { command: 'input', values: { name: 'ShowRails', type: 'Switch', default: 'No' } };

/**
 * Runs lines with stored input values.
 *
 * @param lines Lines.
 * @param inputs Stored input values.
 * @returns Run result.
 */
function run(lines: SolidScriptLine[], inputs: Record<string, string> = {}) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), { inputs });
}

describe('Widget Button and Widget Toggle', () => {
  it('puts a button at At that presses a Button Input, named by its Label or the input in words', () => {
    const result = run([RESET, { command: 'widget_button', values: { writes: 'ResetAll', at: '0, 2, 0' } }]);
    expect(result.error).toBeNull();
    expect(result.widgets).toEqual([
      { kind: 'Button', line: 2, label: 'Reset All', writes: 'ResetAll', at: [0, 2, 0], on: false, color: '' },
    ]);
  });

  it('shows a toggle on or off as Shows says, and follows the Transform around it', () => {
    const result = run([
      SHOW,
      { command: 'transform', values: { move: '1, 0, 0' } },
      { command: 'widget_toggle', values: { shows: '[ShowRails]', writes: 'ShowRails', label: 'Rails' } },
      { command: 'end' },
    ]);
    expect(result.error).toBeNull();
    expect(result.widgets[0]).toMatchObject({ kind: 'Toggle', label: 'Rails', at: [1, 0, 0], on: false });
    expect(
      run([SHOW, { command: 'widget_toggle', values: { shows: 'Yes', writes: 'ShowRails' } }]).widgets[0],
    ).toMatchObject({ on: true });
  });

  it('stops when Writes names no input', () => {
    expect(run([{ command: 'widget_button', values: { writes: 'Nope' } }]).error?.message).toContain('no input "Nope"');
  });
});

describe('solidScriptDocumentEvent', () => {
  it('runs When Button Pressed and keeps what it sets, Persistent values too', () => {
    const script = solidScriptDocumentCreate([
      RESET,
      { command: 'when_button_pressed', values: { name: 'ResetAll' } },
      { command: 'variable', values: { name: '$Persistent.Page', value: 'Rails' } },
      { command: 'end' },
    ]);
    const { next, persistent, handled } = solidScriptDocumentEvent(
      script,
      { kind: 'button', name: 'ResetAll' },
      {},
      null,
    );
    expect(handled.error).toBeNull();
    expect(next).toEqual({});
    expect(persistent).toEqual({ page: 'Rails' });
  });

  it('writes the new value of a changed input before its handlers run', () => {
    const script = solidScriptDocumentCreate([SHOW]);
    const { next } = solidScriptDocumentEvent(script, { kind: 'input', name: 'ShowRails' }, { ShowRails: 'No' }, 'Yes');
    expect(next).toEqual({ ShowRails: 'Yes' });
  });
});
