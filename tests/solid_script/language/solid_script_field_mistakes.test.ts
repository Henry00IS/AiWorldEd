import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptCommandFind, solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  solidScriptFieldMistake,
  solidScriptFieldMistakeOf,
} from '@/solid_script/language/solid_script_field_mistakes.js';
import { solidScriptMistakeCheck } from '@/solid_script/language/solid_script_use_check.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const K = line('variable', { name: 'K', value: '0' });

/** The error a run stops with. */
function failure(...lines: SolidScriptLine[]): string {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), {}).error?.message ?? '';
}

describe('SolidScript mistake hints', () => {
  it('rewrites common mistakes from the text as written', () => {
    expect(solidScriptFieldMistake('[K]*2')).toBe('[=[K]*2]');
    expect(solidScriptFieldMistake('2 * [K] + 1')).toBe('[=2 * [K] + 1]');
    expect(solidScriptFieldMistake('[[K]*2]')).toBe('[=[K]*2]');
    expect(solidScriptFieldMistake('[K*2]')).toBe('[=[K]*2]');
    expect(solidScriptFieldMistake('[Pos.x / Sin(A)]')).toBe('[=[Pos.x] / Sin([A])]');
    expect(solidScriptFieldMistake('[K]*2, 0, [K]')).toBe('[=[K]*2], 0, [K]');
    expect(solidScriptFieldMistake('=[K]*2')).toBe('[=[K]*2]');
    expect(solidScriptFieldMistake('[Box.Width]')).toBe('[$Box.Width]');
    expect(solidScriptFieldMistake('[selected.faces.Count]')).toBe('[$selected.faces.Count]');
    expect(solidScriptFieldMistake('[Box.Width]*2')).toBe('[=[$Box.Width]*2]');
    for (const fine of ['1, 2, 3', '-1', '[K]', '[=[K]*2]', '[Pos.x]', '[Heights(0)]', '[$Box.Width]', '1e-3', ''])
      expect(solidScriptFieldMistake(fine), fine).toBe('');
  });

  it('adds the hint to the error a run stops with', () => {
    expect(failure(K, line('transform', { move: '[K]*2' }), line('cube'), line('end'))).toContain(
      'Did you mean to write [=[K]*2]?',
    );
    expect(failure(K, line('transform', { move: '[[K]*2], 0, 0' }), line('cube'), line('end'))).toContain(
      'Did you mean to write [=[K]*2], 0, 0?',
    );
    expect(failure(line('echo', { value: '[Box.Width]' }))).toContain('Did you mean to write [$Box.Width]?');
  });

  it('points the mistakes out in the editor without running', () => {
    const document = solidScriptDocumentCreate([K, line('transform', { move: '[K]*2' }), line('cube'), line('end')]);
    expect(solidScriptMistakeCheck(document)).toEqual([
      { line: 2, text: 'Move: math outside a formula is not worked out. Did you mean to write [=[K]*2]?' },
    ]);
    const offset = solidScriptCommandFind('transform')!.parameters[0]!;
    expect(solidScriptConfiguratorFieldBuild(offset, '[K]*2', () => {}).warning()).toContain(
      'Did you mean to write [=[K]*2]?',
    );
  });

  it('does not hint a missing $ on the Arch Span Along choice Along X', () => {
    const span = solidScriptCommandFind('arch')!.parameters.find((parameter) => parameter.key === 'span')!;
    expect(span.words?.map((entry) => entry.word)).toContain('Along X');
    expect(solidScriptFieldMistakeOf(span, 'Along X')).toBe('');
    const document = solidScriptDocumentCreate([line('arch', { span: 'Along X' }), line('end')]);
    expect(
      solidScriptMistakeCheck(document).filter((warning) => warning.text.includes('system values start with $')),
    ).toEqual([]);
    expect(solidScriptConfiguratorFieldBuild(span, 'Along X', () => {}).warning()).not.toContain(
      'system values start with $',
    );
  });

  it('does not hint a missing $ for any listed choice of any command', () => {
    const hinted: string[] = [];
    for (const command of solidScriptCommands) {
      for (const parameter of command.parameters) {
        const words = parameter.type === 'boolean' ? ['Yes', 'No'] : (parameter.words ?? []).map((entry) => entry.word);
        for (const word of words) {
          const note = solidScriptFieldMistakeOf(parameter, word);
          if (note.includes('system values start with $'))
            hinted.push(`${command.id} ${parameter.label}: ${word} -> ${note}`);
        }
      }
    }
    expect(hinted).toEqual([]);
  });

  it('still hints a bare system short in a field of a line that fills it', () => {
    const fills = (name: string): boolean => ['$X', '$NX'].includes(name);
    expect(solidScriptFieldMistakeOf({ type: 'number' }, 'X', () => false, fills)).toBe(
      'system values start with $. Did you mean to write $X?',
    );
    expect(solidScriptFieldMistakeOf({ type: 'number' }, '[=X]', () => false, fills)).toBe(
      'a formula reads every variable and system value in brackets. Did you mean to write [=[$X]]?',
    );
    const document = solidScriptDocumentCreate([line('displace', { distance: '[=NX * 0.1]' })]);
    expect(solidScriptMistakeCheck(document).map((warning) => warning.text)).toEqual([
      'Distance: a formula reads every variable and system value in brackets. Did you mean to write [=[$NX] * 0.1]?',
    ]);
  });

  it('never hints a system short where the line does not fill it, or in quotes and plain text', () => {
    expect(solidScriptFieldMistakeOf({ type: 'number' }, 'X')).toBe('');
    const cube = solidScriptDocumentCreate([line('cube', { size: 'X, 1, 1' }), line('end')]);
    expect(solidScriptMistakeCheck(cube)).toEqual([]);
    const fills = (name: string): boolean => name === '$Y';
    expect(solidScriptFieldMistake('Hello y', false, () => false, fills)).toBe('');
    expect(solidScriptFieldMistake('[="y"]', false, () => false, fills)).toBe('');
    expect(solidScriptFieldMistake('[=1<2 ? "y" : "n"]', true, () => false, fills)).toBe('');
    expect(solidScriptFieldMistake('[K] > "y"', false, () => false, fills, true)).toBe('');
    expect(
      solidScriptFieldMistake(
        '[K] > y',
        false,
        () => false,
        () => false,
        true,
      ),
    ).toBe('');
  });

  it('hints a system short in a running line that fills it', () => {
    const message = failure(
      line('mesh_brushes'),
      line('cube'),
      line('end'),
      line('select_brushes'),
      line('displace', { distance: '[=NX * 0.1]' }),
    );
    expect(message).toContain('Did you mean to write [=[$NX] * 0.1]?');
  });

  it('keeps the hints for a $ before a variable and a system value without its $', () => {
    const sees = (name: string): boolean => name === 'K';
    expect(solidScriptFieldMistake('[=[$K]-1]', true, () => false, sees)).toBe('[=[K]-1]');
    expect(solidScriptFieldMistake('[Box.Width]')).toBe('[$Box.Width]');
    expect(solidScriptFieldMistake('[=Pi * 2]')).toBe('[=[$Math.Pi] * 2]');
  });
});
