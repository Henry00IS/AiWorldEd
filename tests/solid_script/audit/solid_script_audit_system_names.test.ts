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
      { command: 'extrude_faces', values: {} },
      { command: 'cube' },
      { command: 'end' },
    ]);
    const system = solidScriptExplorerEntries(document, [], [])
      .filter((entry) => entry.category === 'System')
      .map((entry) => entry.name);
    expect(solidScriptSystemNameProblems(system)).toEqual([]);
    const command = solidScriptCommandFind('extrude_faces');
    if (!command) throw new Error('Extrude Faces is missing');
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

  it('fills $NZ on Extrude Faces and $X on Displace, and refuses the old unprefixed names', () => {
    const end = { command: 'end' };
    const cube = { command: 'cube' };
    const lifted = run({ command: 'extrude_faces', values: { distance: '0.5', which: '[$NZ] > 0.5' } }, cube, end);
    expect(lifted.error).toBeNull();
    const waved = run({ command: 'displace', values: { distance: '[=[$X] * 0]' } }, cube, end);
    expect(waved.error).toBeNull();
    const old = run({ command: 'extrude_faces', values: { distance: '0.5', which: '[Nz] > 0.5' } }, cube, end);
    expect(old.error?.message ?? '').toMatch(/\$NZ/);
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
