import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_FUNCTION_DOCS } from '@/solid_script/language/solid_script_function_docs.js';

/** Help that names another command or modifier instead of explaining itself. */
const SOLID_SCRIPT_AS_IN_COMMAND = /\bas in [A-Z][A-Za-z0-9]+(?: [A-Z][A-Za-z0-9]+)*/;

/** A typed sample in help: such as 2, 1, 2 or Example: Cube Size 2. */
const SOLID_SCRIPT_HELP_EXAMPLE = /such as|Example|example/;

/**
 * Returns command help text that people see: the manual, each field hint and
 * each choice word's detail.
 *
 * @param command Command.
 * @returns Named help strings.
 */
function helpOf(command: (typeof solidScriptCommands)[number]): [string, string][] {
  const help: [string, string][] = [[`${command.id}.manual`, command.manual]];
  for (const parameter of command.parameters) {
    help.push([`${command.id}.${parameter.key}`, parameter.hint]);
    for (const word of parameter.words ?? []) {
      if (word.detail) help.push([`${command.id}.${parameter.key}.${word.word}`, word.detail]);
    }
  }
  return help;
}

describe('SolidScript help says what to type, with an example, and does not point at another command', () => {
  it('gives every field hint something to type and an example', () => {
    const missing = solidScriptCommands.flatMap((command) =>
      command.parameters
        .filter((parameter) => !SOLID_SCRIPT_HELP_EXAMPLE.test(parameter.hint))
        .map((parameter) => `${command.id}.${parameter.key}`),
    );
    expect(missing).toEqual([]);
  });

  it('gives every function tooltip an example', () => {
    const missing = Object.entries(SOLID_SCRIPT_FUNCTION_DOCS)
      .filter(([, doc]) => !SOLID_SCRIPT_HELP_EXAMPLE.test(doc.summary))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('does not say as in a command or modifier name', () => {
    const hits: string[] = [];
    for (const command of solidScriptCommands) {
      for (const [where, text] of helpOf(command)) {
        if (SOLID_SCRIPT_AS_IN_COMMAND.test(text)) hits.push(where);
      }
    }
    for (const [name, doc] of Object.entries(SOLID_SCRIPT_FUNCTION_DOCS)) {
      if (SOLID_SCRIPT_AS_IN_COMMAND.test(`${doc.usage} ${doc.summary}`)) hits.push(`function.${name}`);
    }
    for (const [path, text] of [
      ['documentation/solidscript.md', readFileSync('documentation/solidscript.md', 'utf8')],
      [
        'src/solid_script/reference/solid_script_reference.ts',
        readFileSync('src/solid_script/reference/solid_script_reference.ts', 'utf8'),
      ],
    ] as const) {
      if (SOLID_SCRIPT_AS_IN_COMMAND.test(text)) hits.push(path);
    }
    expect(hits).toEqual([]);
  });
});
