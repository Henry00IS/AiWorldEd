import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind, solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNamesAt } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptFieldMistake } from '@/solid_script/language/solid_script_field_mistakes.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { SOLID_SCRIPT_SYSTEM_LISTED } from '@/solid_script/language/solid_script_system.js';
import {
  SOLID_SCRIPT_SYSTEM_FILLS,
  SOLID_SCRIPT_SYSTEM_NAME,
  solidScriptSystemFill,
  solidScriptSystemNameOk,
  type SolidScriptSystemFillName,
} from '@/solid_script/language/solid_script_system_names.js';
import { SOLID_SCRIPT_FUNCTIONS_BUILTIN } from '@/solid_script/language/solid_script_functions_builtin.js';
import { solidScriptFunctionSpelling } from '@/solid_script/language/solid_script_name_key.js';
import { SOLID_SCRIPT_MEMBER_TYPES, solidScriptMemberNames } from '@/solid_script/language/solid_script_members.js';
import {
  SOLID_SCRIPT_PASCAL_IDENT,
  SOLID_SCRIPT_SHOWN_WORDS,
  solidScriptShownNameOk,
} from '@/solid_script/language/solid_script_shown_names.js';
import { SOLID_SCRIPT_SYSTEM_VALUES } from '@/solid_script/language/solid_script_name_rules.js';
import { solidScriptExplorerEntries } from '@/solid_script/ui/solid_script_editor_explorer.js';
import { solidScriptSuggestionContext, solidScriptSuggestions } from '@/solid_script/ui/solid_script_suggestions.js';

/**
 * Collects declared system names that are missing a $ or are not PascalCase.
 *
 * @param names Names as scripts should write them.
 * @returns Problems, one per bad name.
 */
function solidScriptSystemNameProblems(names: readonly string[]): string[] {
  return names.flatMap((name) =>
    solidScriptSystemNameOk(name) ? [] : [`${JSON.stringify(name)} is not $ then PascalCase`],
  );
}

/**
 * Collects texts of a command that should teach its fills: the manual, field
 * defaults and field hints.
 *
 * @param command Command.
 * @returns Texts.
 */
function solidScriptCommandTeachings(command: (typeof solidScriptCommands)[number]): string[] {
  return [command.manual, ...command.parameters.flatMap((parameter) => [parameter.default, parameter.hint])];
}

/**
 * Runs one Echo or shape script and returns the result.
 *
 * @param lines Script lines.
 * @returns Run result.
 */
function run(...lines: Parameters<typeof solidScriptDocumentCreate>[0]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

describe('every system name is $ then PascalCase', () => {
  it('declares every fill and listed system value in $ PascalCase, with no leftover lowercase names', () => {
    const listed = SOLID_SCRIPT_SYSTEM_LISTED.map(([name]) => name);
    const fills = Object.keys(SOLID_SCRIPT_SYSTEM_FILLS);
    const used = solidScriptCommands.flatMap((command) => command.fills);
    expect(solidScriptSystemNameProblems([...listed, ...fills, ...used])).toEqual([]);
    for (const name of used) expect(solidScriptSystemFill(name)?.name, name).toBe(name);
  });

  it('shows system values and fills with their $ PascalCase names in the explorer and suggestions', () => {
    const document = solidScriptDocumentCreate([
      { command: 'mesh_brushes' },
      { command: 'cube' },
      { command: 'end' },
      { command: 'displace', values: {} },
    ]);
    const system = solidScriptExplorerEntries(document, [], [])
      .filter((entry) => entry.category === 'System')
      .map((entry) => entry.name);
    expect(solidScriptSystemNameProblems(system)).toEqual([]);
    const command = solidScriptCommandFind('displace');
    if (!command) throw new Error('Displace is missing');
    const labels = solidScriptSuggestions(solidScriptSuggestionContext('[', 1, false), {
      names: solidScriptDocumentNamesAt(document, 0),
      extra: command.fills,
      words: [],
    }).map((entry) => entry.label);
    expect(labels).toContain('$NZ');
    expect(labels.some((label) => label.toLowerCase() === 'nz' || label === '$nz')).toBe(false);
    const detail = solidScriptSuggestions(solidScriptSuggestionContext('[$NZ', 4, false), {
      names: solidScriptDocumentNamesAt(document, 0),
      extra: command.fills,
      words: [],
    }).find((entry) => entry.label === '$NZ')?.detail;
    expect(detail).toMatch(/^Number:/);
  });

  it('teaches the official $ names in every command that fills them, not the old unprefixed ones', () => {
    const problems: string[] = [];
    for (const command of solidScriptCommands) {
      if (command.fills.length === 0) continue;
      const texts = solidScriptCommandTeachings(command).join('\n');
      for (const name of command.fills as SolidScriptSystemFillName[]) {
        if (!texts.includes(name)) problems.push(`${command.label} never mentions ${name}`);
        const bare = name.slice(1);
        const lowered = `[${bare.toLowerCase()}]`;
        const titled = `[${bare[0]}${bare.slice(1).toLowerCase()}]`;
        for (const old of [`[${bare}]`, lowered, titled])
          if (old !== `[${name}]` && texts.includes(old))
            problems.push(`${command.label} still teaches ${old}; write [${name}]`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('fills $X on Displace, and refuses the old unprefixed names', () => {
    const waved = run(
      { command: 'mesh_brushes' },
      { command: 'cube' },
      { command: 'end' },
      { command: 'displace', values: { distance: '[=[$X] * 0]' } },
    );
    expect(waved.error).toBeNull();
    expect(solidScriptFieldMistake('[Nz] > 0.5', false)).toBe('[$NZ] > 0.5');
  });

  it('reads $Math.Pi in a formula and tells the user to write the $ when it is missing', () => {
    const echo = (value: string) => run({ command: 'echo', values: { value } }, { command: 'cube' });
    expect(Number(echo('[=$Math.Pi]').messages[0])).toBeCloseTo(Math.PI, 5);
    expect(echo('[=Math.Pi]').error?.message ?? '').toMatch(/\$Math\.Pi/);
    expect(echo('[=Pi]').error?.message ?? '').toMatch(/\$Math\.Pi/);
    expect(SOLID_SCRIPT_SYSTEM_NAME.test('$Math.Pi')).toBe(true);
    expect(SOLID_SCRIPT_SYSTEM_NAME.test('Math.Pi')).toBe(false);
    expect(SOLID_SCRIPT_SYSTEM_NAME.test('$nz')).toBe(false);
  });
});

/** Abbreviations that must not appear as a choice word, even in Title Case. */
const SOLID_SCRIPT_CHOICE_ABBREVIATION = /^(cw|ccw|min|max|dir)$/i;

/**
 * Records a shown name that is not PascalCase or Title Case.
 *
 * @param problems List to append to.
 * @param where Where the name is declared.
 * @param name Name as shown to the user.
 */
function solidScriptShownProblem(problems: string[], where: string, name: string): void {
  if (!solidScriptShownNameOk(name)) problems.push(`${where}: ${JSON.stringify(name)} is not PascalCase`);
}

describe('every shown name is PascalCase', () => {
  it('declares every member of every kind in PascalCase', () => {
    const problems: string[] = [];
    for (const [kind, members] of Object.entries(SOLID_SCRIPT_MEMBER_TYPES)) {
      if (!SOLID_SCRIPT_PASCAL_IDENT.test(kind)) problems.push(`kind ${JSON.stringify(kind)} is not PascalCase`);
      for (const name of [...Object.keys(members), ...solidScriptMemberNames(kind)])
        if (!SOLID_SCRIPT_PASCAL_IDENT.test(name)) problems.push(`${kind}.${name} is not a PascalCase member`);
    }
    expect(problems).toEqual([]);
  });

  it('offers only PascalCase labels from every autocomplete source', () => {
    const problems: string[] = [];
    for (const name of Object.keys(SOLID_SCRIPT_FUNCTIONS_BUILTIN))
      solidScriptShownProblem(problems, 'function', solidScriptFunctionSpelling(name));
    for (const [name] of SOLID_SCRIPT_SYSTEM_LISTED) solidScriptShownProblem(problems, 'system value', name);
    for (const [group, members] of Object.entries(SOLID_SCRIPT_SYSTEM_VALUES)) {
      solidScriptShownProblem(problems, 'system group', group);
      for (const member of members) solidScriptShownProblem(problems, `$${group}`, `$${group}.${member}`);
    }
    expect(problems).toEqual([]);
  });

  it('lists only spelled-out Title Case choice words, with no abbreviations such as cw, ccw, min, max or dir', () => {
    const problems: string[] = [];
    for (const command of solidScriptCommands) {
      for (const parameter of command.parameters) {
        for (const { word } of parameter.words ?? []) {
          const where = `${command.label} ${parameter.label}`;
          if (!SOLID_SCRIPT_SHOWN_WORDS.test(word))
            problems.push(`${where}: ${JSON.stringify(word)} is not Title Case`);
          for (const part of word.split(/, | \/ | /))
            if (SOLID_SCRIPT_CHOICE_ABBREVIATION.test(part))
              problems.push(`${where}: ${JSON.stringify(word)} uses an abbreviation`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('declares every fill in $ then PascalCase', () => {
    const problems: string[] = [];
    for (const name of Object.keys(SOLID_SCRIPT_SYSTEM_FILLS)) solidScriptShownProblem(problems, 'fill', name);
    for (const command of solidScriptCommands)
      for (const name of command.fills) solidScriptShownProblem(problems, `${command.label} fill`, name);
    expect(problems).toEqual([]);
  });
});
