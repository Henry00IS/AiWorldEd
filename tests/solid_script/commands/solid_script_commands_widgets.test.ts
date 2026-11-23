import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

const HEIGHT: SolidScriptLine = { command: 'input', values: { name: 'Height', type: 'Number', default: '2' } };

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

describe('Widget Slider', () => {
  it('shows the value the script allowed, separately from the input it writes', () => {
    const result = run(
      [
        HEIGHT,
        { command: 'variable', values: { name: 'Tall', value: '[=Min([Height], 5)]' } },
        { command: 'widget_slider', values: { shows: '[Tall]', writes: 'Height', min: '1' } },
        { command: 'cube' },
      ],
      { Height: '9' },
    );
    expect(result.error).toBeNull();
    expect(result.widgets).toEqual([
      {
        kind: 'Slider',
        line: 3,
        label: 'Height',
        value: 5,
        writes: 'Height',
        origin: [0, 0, 0],
        direction: [0, 1, 0],
        min: 1,
        max: null,
      },
    ]);
  });

  it('follows the Transform around it and keeps a unit direction for Along', () => {
    const result = run([
      HEIGHT,
      { command: 'transform', values: { move: '1, 0, 0' } },
      { command: 'widget_slider', values: { shows: '[Height]', writes: 'Height', at: '0, 1, 0', along: '0, 0, 4' } },
      { command: 'end' },
    ]);
    expect(result.error).toBeNull();
    expect(result.widgets[0]?.origin).toEqual([1, 1, 0]);
    expect(result.widgets[0]?.direction).toEqual([0, 0, 1]);
  });

  it('stops when Writes names no input', () => {
    const result = run([
      { command: 'variable', values: { name: 'Height', value: '2' } },
      { command: 'widget_slider', values: { shows: '[Height]', writes: 'Height' } },
    ]);
    expect(result.error?.message).toContain('there is no input "Height"');
    expect(result.widgets).toEqual([]);
  });
});
