import { describe, expect, it } from 'vitest';
import type { SolidScriptCommand, SolidScriptCommandAccepts } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptKindKnown } from '@/solid_script/language/solid_script_kinds.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
  type SolidScriptFunctionKinds,
} from '@/solid_script/language/solid_script_function_docs.js';
import { SOLID_SCRIPT_FUNCTIONS_BUILTIN } from '@/solid_script/language/solid_script_functions_builtin.js';

/**
 * Tells whether a list of kinds names only kinds the analyzer knows.
 *
 * @param kinds Any, or kinds.
 * @returns Yes when every kind is known.
 */
function known(kinds: SolidScriptCommandAccepts | SolidScriptFunctionKinds): boolean {
  return kinds === 'Any' || (kinds.length > 0 && kinds.every(solidScriptKindKnown));
}

/**
 * Lists the field keys a command's flow names.
 *
 * @param command Command.
 * @returns Field keys.
 */
function flowKeys(command: SolidScriptCommand): string[] {
  const { kind: _kind, ...rest } = command.flow ?? { kind: 'loop' };
  return Object.values(rest).filter((value): value is string => typeof value === 'string');
}

describe('every command declares what its fields take and give', () => {
  const keysOf = (command: SolidScriptCommand): string[] => command.parameters.map(({ key }) => key);

  it.each(solidScriptCommands.map((command) => [command.id, command] as const))('%s', (_id, command) => {
    for (const parameter of command.parameters) {
      expect(known(parameter.accepts), `${command.id}.${parameter.key} accepts`).toBe(true);
      const gives = parameter.writes?.gives;
      if (!gives) continue;
      if (gives.rule === 'kind') expect(solidScriptKindKnown(gives.kind), `${command.id}.${parameter.key}`).toBe(true);
      if ('field' in gives) expect(keysOf(command)).toContain(gives.field);
      if (gives.rule !== 'word') continue;
      const words = command.parameters.find(({ key }) => key === gives.field)?.words ?? [];
      expect(
        words.some((word) => word.gives !== undefined),
        `${command.id}.${gives.field} words`,
      ).toBe(true);
    }
    for (const key of flowKeys(command)) expect(keysOf(command), `${command.id} flow`).toContain(key);
  });
});

describe('every built-in function declares its kinds', () => {
  const names = Object.keys(SOLID_SCRIPT_FUNCTIONS_BUILTIN);

  it('has the same functions running and documented', () => {
    expect(Object.keys(SOLID_SCRIPT_FUNCTION_DOCS).sort()).toEqual([...names].sort());
  });

  it.each(names)('%s', (name) => {
    const doc = SOLID_SCRIPT_FUNCTION_DOCS[name];
    expect(doc && known(doc.gives), `${name} gives`).toBe(true);
    for (const argument of solidScriptFunctionArguments(name)) {
      expect(argument.about, `${name}(${argument.name}) is declared`).not.toBe('');
      expect(known(argument.type), `${name}(${argument.name})`).toBe(true);
    }
    for (const kind of doc?.checks ?? []) expect(solidScriptKindKnown(kind)).toBe(true);
  });
});
