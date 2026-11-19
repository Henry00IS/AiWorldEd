import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand, SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptAuditFieldValues, solidScriptAuditScript } from './solid_script_audit_lines.js';

/**
 * Writes a Vector3-like object as three numbers.
 *
 * @param value Unknown JSON value.
 * @returns Numbers, or the value unchanged.
 */
function solidScriptAuditPoint(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value) || !('z' in value)) return value;
  const point = value as { x: unknown; y: unknown; z: unknown };
  if ([point.x, point.y, point.z].every((entry) => typeof entry === 'number')) return [point.x, point.y, point.z];
  return value;
}

/**
 * Fills an unset brush Mode with its declared default so empty and Additive
 * compare as the same in a standalone script.
 *
 * @param value Unknown JSON value.
 * @param fallback Declared Mode default.
 * @returns Value, or a solid with Mode filled in.
 */
function solidScriptAuditMode(value: unknown, fallback: string): unknown {
  if (!value || typeof value !== 'object' || !('kind' in value)) return value;
  const shape = value as { kind?: unknown; mode?: unknown };
  if (shape.kind !== 'solid') return value;
  return { ...shape, mode: shape.mode ?? fallback };
}

/**
 * Returns a value with its own keys in name order, so two equals stay equal
 * when a field such as Mode is filled in or left out.
 *
 * @param value Unknown JSON value.
 * @returns Value, or a plain object with sorted keys.
 */
function solidScriptAuditKeyed(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, (value as Record<string, unknown>)[key]]),
  );
}

/**
 * Summarizes a run so an empty choice can be compared to its declared default.
 *
 * @param run Result.
 * @param fallback Declared Mode default, when the command has one.
 * @returns Stable text.
 */
function solidScriptAuditRunSummary(run: SolidScriptRun, fallback: string): string {
  return JSON.stringify(
    {
      error: run.error?.text ?? '',
      messages: run.messages,
      shapes: run.shapes,
      variables: run.variables.map((entry) => ({ name: entry.name, value: entry.value })),
    },
    (_key, value) => solidScriptAuditKeyed(solidScriptAuditMode(solidScriptAuditPoint(value), fallback)),
  );
}

/**
 * Runs a command with extra values on the audited line.
 *
 * @param command Command.
 * @param values Values over the audit line.
 * @returns Run result.
 */
function solidScriptAuditDefaultRun(command: SolidScriptCommand, values: Record<string, string>): SolidScriptRun {
  const script = solidScriptAuditScript(command, values);
  return solidScriptProgramRun(solidScriptDocumentCreate(script.lines));
}

/**
 * Compares an empty choice field to the same field set to its declared default.
 *
 * @param command Command.
 * @param parameter Choice field.
 * @returns Problem, or empty.
 */
function solidScriptAuditDefaultProblem(command: SolidScriptCommand, parameter: SolidScriptCommandParameter): string {
  const fallback = parameter.default;
  if (fallback === '') return `${command.id}.${parameter.key} has no declared default`;
  const empty = solidScriptAuditDefaultRun(command, solidScriptAuditFieldValues(parameter, ''));
  const filled = solidScriptAuditDefaultRun(command, solidScriptAuditFieldValues(parameter, fallback));
  const mode = command.parameters.find((entry) => entry.key === 'mode')?.default ?? '';
  const left = solidScriptAuditRunSummary(empty, mode);
  const right = solidScriptAuditRunSummary(filled, mode);
  if (left === right) return '';
  return `${command.id}.${parameter.key}: empty and '${fallback}' differed`;
}

describe('an empty choice field does what its declared default does', () => {
  const choices = solidScriptCommands.flatMap((command) =>
    command.parameters
      .filter((parameter) => parameter.words && parameter.words.length > 0)
      .map((parameter) => [command.id, parameter.key, command, parameter] as const),
  );

  it.each(choices)('%s.%s', (_id, _key, command, parameter) => {
    expect(solidScriptAuditDefaultProblem(command, parameter)).toBe('');
  });
});
