import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand, SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptConfiguratorProblem } from '@/solid_script/ui/solid_script_configurator_fields.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptAuditDefaultProblem } from './solid_script_audit_default_run.js';
import { solidScriptAuditFieldValues, solidScriptAuditScript } from './solid_script_audit_lines.js';

/**
 * Checks that an empty declared-default field is accepted, stays empty when
 * saved, and does what typing the default does.
 *
 * @param command Command.
 * @param parameter Field with a declared default.
 * @returns Problem, or empty.
 */
function solidScriptAuditParameterDefaultProblem(
  command: SolidScriptCommand,
  parameter: SolidScriptCommandParameter,
): string {
  const fallback = parameter.default;
  if (fallback.trim() === '') return `${command.id}.${parameter.key} has no declared default`;
  const rejected = solidScriptConfiguratorProblem(parameter, '');
  if (rejected !== '') return `${command.id}.${parameter.key}: empty was rejected (${rejected})`;
  const stored = solidScriptAuditParameterDefaultStored(command, parameter);
  if (stored !== '') return `${command.id}.${parameter.key}: empty was stored as '${stored}'`;
  return solidScriptAuditDefaultProblem(command, parameter);
}

/**
 * Returns what a script keeps for an empty field after a save and reload.
 *
 * @param command Command.
 * @param parameter Field.
 * @returns Stored text.
 */
function solidScriptAuditParameterDefaultStored(
  command: SolidScriptCommand,
  parameter: SolidScriptCommandParameter,
): string {
  const script = solidScriptAuditScript(command, solidScriptAuditFieldValues(parameter, ''));
  const document = solidScriptDocumentCreate(script.lines);
  const again = solidScriptDocumentNormalize(JSON.parse(JSON.stringify(document)));
  return (again.blocks[script.at]?.values[parameter.key] ?? '').trim();
}

describe('an empty field with a declared default does what the default does', () => {
  const fields = solidScriptCommands.flatMap((command) =>
    command.parameters
      .filter((parameter) => parameter.default.trim() !== '')
      .map((parameter) => [command.id, parameter.key, command, parameter] as const),
  );

  it.each(fields)('%s.%s', (_id, _key, command, parameter) => {
    expect(solidScriptAuditParameterDefaultProblem(command, parameter)).toBe('');
  });
});
