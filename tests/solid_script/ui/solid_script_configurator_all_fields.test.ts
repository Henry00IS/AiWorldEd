import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import { SolidScriptConfigurator } from '@/solid_script/ui/solid_script_configurator.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';

/**
 * Opens the options window of a command with some values and lists the field
 * rows it hides.
 *
 * @param command Command.
 * @param values Stored values.
 * @returns Labels of hidden rows, and how many rows there are.
 */
function hiddenRows(command: SolidScriptCommand, values: Record<string, string>): { hidden: string[]; rows: number } {
  document.body.replaceChildren();
  new SolidScriptConfigurator(document.body, command, values, () => {}).show();
  const rows = [...document.body.querySelectorAll<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.field}`)];
  const hidden = rows.filter((row) => row.hidden || row.closest('[hidden]') !== null);
  return { hidden: hidden.map((row) => row.textContent ?? ''), rows: rows.length };
}

/**
 * Every value set to try on a command: its defaults, then each word of each
 * field that offers words.
 *
 * @param command Command.
 * @returns Value sets.
 */
function valueSets(command: SolidScriptCommand): Record<string, string>[] {
  const words = command.parameters.flatMap((parameter) =>
    (parameter.words ?? []).map((entry) => ({ [parameter.key]: entry.word })),
  );
  return [{}, ...words];
}

afterEach(() => document.body.replaceChildren());

describe('SolidScript options window shows every field', () => {
  it('hides no field of any block, whatever word a choice field holds', () => {
    const problems: string[] = [];
    for (const command of solidScriptCommands)
      for (const values of valueSets(command)) {
        const { hidden, rows } = hiddenRows(command, values);
        if (hidden.length > 0) problems.push(`${command.id} ${JSON.stringify(values)} hides ${hidden.join(', ')}`);
        if (rows < command.parameters.length)
          problems.push(`${command.id} shows ${rows} of ${command.parameters.length}`);
      }
    expect(problems).toEqual([]);
  }, 180_000);
});
