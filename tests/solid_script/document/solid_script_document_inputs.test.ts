import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentInputLayout,
  solidScriptInputRulesHold,
} from '@/solid_script/document/solid_script_document_inputs.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * An Input line.
 *
 * @param name Variable.
 * @param fallback Default.
 * @returns Line.
 */
function input(name: string, fallback = '1'): SolidScriptLine {
  return { command: 'input', values: { name, type: 'Number', default: fallback } };
}

const END: SolidScriptLine = { command: 'end' };

/** A script with a loose input, two Input Groups, a nested If and notes. */
const LINES: SolidScriptLine[] = [
  input('size'),
  { command: 'input_note', values: { text: 'Sizes are in metres.' } },
  { command: 'input_group', values: { title: 'Steps' } },
  input('steps', '4'),
  { command: 'if', values: { condition: 'true' } },
  input('rise', '0.2'),
  END,
  { command: 'input_note', values: { text: 'Rise is per step.' } },
  END,
  { command: 'input_group', values: { title: 'Railing' } },
  input('rail', '1'),
  END,
  input('after'),
];

describe('solidScriptDocumentInputLayout', () => {
  it('lists inputs and notes in line order with the title of the Input Group around them', () => {
    const layout = solidScriptDocumentInputLayout(solidScriptDocumentCreate(LINES));
    expect(
      layout.map((item) => `${item.group}|${item.kind === 'input' ? item.input.name : `note:${item.text}`}`),
    ).toEqual([
      '|size',
      '|note:Sizes are in metres.',
      'Steps|steps',
      'Steps|rise',
      'Steps|note:Rise is per step.',
      'Railing|rail',
      '|after',
    ]);
  });

  it('runs the lines inside an Input Group in place, so its inputs are read after its End', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        ...LINES,
        { command: 'echo', values: { value: '[=[steps] + [rail]]' } },
        { command: 'cube' },
      ]),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['5']);
  });

  it('marks inputs inside an Input Row with the row they share and inputs inside Show Inputs When with its condition', () => {
    const layout = solidScriptDocumentInputLayout(
      solidScriptDocumentCreate([
        { command: 'input', values: { name: 'rails', type: 'Switch', default: 'no' } },
        { command: 'show_inputs_when', values: { name: 'rails', value: 'yes' } },
        { command: 'input_row' },
        input('railHeight'),
        input('railWidth'),
        END,
        END,
        input('loose'),
      ]),
    );
    expect(
      layout.map((item) => [
        item.kind === 'input' ? item.input.name : '',
        item.row,
        item.when.map((rule) => `${rule.name}=${rule.value}`),
      ]),
    ).toEqual([
      ['rails', null, []],
      ['railHeight', 2, ['rails=yes']],
      ['railWidth', 2, ['rails=yes']],
      ['loose', null, []],
    ]);
  });
});

describe('SolidScript inspector rows skip lines turned off', () => {
  it('shows no input for an off Input line', () => {
    const lines: SolidScriptLine[] = [
      { command: 'input', values: { name: 'width', type: 'Number', default: '2' }, off: true },
      { command: 'input', values: { name: 'depth', type: 'Number', default: '3' } },
    ];
    const layout = solidScriptDocumentInputLayout(solidScriptDocumentCreate(lines));
    expect(layout.map((item) => (item.kind === 'input' ? item.input.name : item.text))).toEqual(['depth']);
  });
});

describe('solidScriptInputRulesHold', () => {
  it('treats a comma-separated Value as any one of those words', () => {
    const when = [{ name: 'Mode', value: 'Fixed, Plus' }];
    expect(solidScriptInputRulesHold(when, () => 'Fixed')).toBe(true);
    expect(solidScriptInputRulesHold(when, () => 'Plus')).toBe(true);
    expect(solidScriptInputRulesHold(when, () => 'Fit')).toBe(false);
  });
});
