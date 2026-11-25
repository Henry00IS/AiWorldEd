import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';
import {
  solidScriptChoiceLiteralProblems,
  solidScriptChoiceWordProblem,
  solidScriptChoiceWordsForField,
  solidScriptChoiceWordsForTarget,
  solidScriptChoiceWordsFromText,
} from '@/solid_script/language/solid_script_choices.js';
import { solidScriptInputRead } from '@/solid_script/language/solid_script_input.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptSuggestionContext, solidScriptSuggestions } from '@/solid_script/ui/solid_script_suggestions.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

describe('declared choice lists', () => {
  it('lists brush Mode words, including through a list and $Selected.Objects', () => {
    const words = ['Additive', 'Subtractive', 'Intersecting'];
    expect(solidScriptChoiceWordsForTarget('Brush.Mode').map((entry) => entry.word)).toEqual(words);
    expect(solidScriptChoiceWordsForTarget('Box.Mode').map((entry) => entry.word)).toEqual(words);
    expect(solidScriptChoiceWordsForTarget('Brushes.Modes').map((entry) => entry.word)).toEqual(words);
    expect(solidScriptChoiceWordsForTarget('[$Selected.Objects.Modes]').map((entry) => entry.word)).toEqual(words);
    expect(solidScriptChoiceWordsForTarget('$Input.Objects.Modes').map((entry) => entry.word)).toEqual(words);
  });

  it('lists Script.Usage and Script.Mode words, including Pass-Through on Script.Mode', () => {
    expect(solidScriptChoiceWordsForTarget('$Script.Usage').map((entry) => entry.word)).toEqual([
      'Generator',
      'Modifier',
    ]);
    expect(solidScriptChoiceWordsForTarget('[$Script.Mode]').map((entry) => entry.word)).toEqual([
      'Additive',
      'Subtractive',
      'Intersecting',
      'Pass-Through',
    ]);
  });

  it('lists the Choices of a Choice input', () => {
    const input = solidScriptInputRead({ name: 'Style', type: 'Choice', choices: 'Oak, Pine, Steel', fallback: 'Oak' });
    expect(solidScriptChoiceWordsForTarget('[Style]', [input]).map((entry) => entry.word)).toEqual([
      'Oak',
      'Pine',
      'Steel',
    ]);
  });

  it('gives Set Value the target words and If the words of names in the condition', () => {
    const value = solidScriptCommandFind('variable')?.parameters.find((field) => field.key === 'value');
    const condition = solidScriptCommandFind('if')?.parameters.find((field) => field.key === 'condition');
    expect(value && condition).toBeTruthy();
    if (!value || !condition) return;
    expect(solidScriptChoiceWordsForField(value, { name: 'Box.Mode' }, '').map((entry) => entry.word)).toEqual([
      'Additive',
      'Subtractive',
      'Intersecting',
    ]);
    expect(solidScriptChoiceWordsFromText('[$Script.Usage] == "').map((entry) => entry.word)).toEqual([
      'Generator',
      'Modifier',
    ]);
    expect(solidScriptChoiceWordsForField(condition, {}, '[$Script.Usage] == "').map((entry) => entry.word)).toEqual([
      'Generator',
      'Modifier',
    ]);
  });

  it('explains typable words that are not in the list, and leaves names and empty text alone', () => {
    const words = solidScriptChoiceWordsForTarget('Brush.Mode');
    expect(solidScriptChoiceWordProblem('Open', words)).toBe(
      'must be Additive, Subtractive or Intersecting, not "Open"',
    );
    expect(solidScriptChoiceWordProblem('Additive', words)).toBe('');
    expect(solidScriptChoiceWordProblem('', words)).toBe('');
    expect(solidScriptChoiceWordProblem('[Name]', words)).toBe('');
    expect(solidScriptChoiceLiteralProblems('[$Script.Usage] == "World"')).toEqual([
      '[$Script.Usage] must be Generator or Modifier, not "World"',
    ]);
    expect(solidScriptChoiceLiteralProblems('[$Script.Usage] == "Generator"')).toEqual([]);
  });
});

describe('kind check of declared choices', () => {
  it('warns when Set writes an invalid Mode word', () => {
    const warnings = solidScriptKindCheck(
      solidScriptDocumentCreate([line('cube', { into: 'Box' }), line('variable', { name: 'Box.Mode', value: 'Open' })]),
    );
    expect(warnings.map((warning) => warning.text)).toEqual([
      'Value must be Additive, Subtractive or Intersecting, not "Open"',
    ]);
  });

  it('warns when an If compares $Script.Usage to a word it does not have', () => {
    const warnings = solidScriptKindCheck(
      solidScriptDocumentCreate([line('if', { condition: '[$Script.Usage] == "World"' }), line('end')]),
    );
    expect(warnings.map((warning) => warning.text)).toEqual([
      '[$Script.Usage] must be Generator or Modifier, not "World"',
    ]);
  });

  it('does not warn when the word is listed, or the value is a name', () => {
    expect(
      solidScriptKindCheck(
        solidScriptDocumentCreate([
          line('cube', { into: 'Box' }),
          line('variable', { name: 'Box.Mode', value: 'Subtractive' }),
          line('if', { condition: '[$Script.Mode] == "Pass-Through"' }),
          line('end'),
          line('widget_slider', { name: 'Size', color: '#ff0000' }),
          line('widget_slider', { name: 'Width', color: '#f80' }),
          line('widget_slider', { name: 'Depth', color: 'Orange' }),
        ]),
      ),
    ).toEqual([]);
  });

  it('warns on an invalid literal in a Color field, but accepts hex and colour names', () => {
    const warnings = solidScriptKindCheck(
      solidScriptDocumentCreate([line('widget_slider', { name: 'Size', color: 'sparkly' })]),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.text).toContain('Color');
  });
});

describe('choice suggestions', () => {
  it('offers Mode words for a Set Value of Brush.Mode as whole-field words', () => {
    const words = solidScriptChoiceWordsForTarget('Brush.Mode');
    const context = solidScriptSuggestionContext('Sub', 3, true);
    const labels = solidScriptSuggestions(context, { names: [], extra: [], words }).map((entry) => entry.label);
    expect(labels).toEqual(['Subtractive']);
  });

  it('offers quoted Usage words after == in an If condition, without replacing the field', () => {
    const words = solidScriptChoiceWordsForTarget('$Script.Usage');
    const text = '[$Script.Usage] == ';
    const context = solidScriptSuggestionContext(text, text.length, false, true);
    const labels = solidScriptSuggestions(context, { names: [], extra: [], words, phrase: true }).map(
      (entry) => entry.label,
    );
    expect(labels.slice(0, 2)).toEqual(['"Generator"', '"Modifier"']);
  });
});
