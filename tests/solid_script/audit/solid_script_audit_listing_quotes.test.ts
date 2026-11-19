import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand, SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptListingPart } from '@/solid_script/commands/solid_script_command_listing.js';
import { solidScriptAuditFieldValues } from './solid_script_audit_lines.js';

/**
 * Returns a sample value for a field, unique enough not to hide inside a label.
 *
 * @param command Command.
 * @param parameter Field.
 * @returns Sample text, or empty when the field has no typable sample.
 */
function solidScriptAuditListingSample(command: SolidScriptCommand, parameter: SolidScriptCommandParameter): string {
  if (parameter.words && parameter.words.length > 0) {
    const other = parameter.words.find((entry) => entry.word !== parameter.default);
    return (other ?? parameter.words[0])?.word ?? '';
  }
  if (parameter.type === 'boolean') return 'Yes';
  if (parameter.type === 'number' || parameter.type === 'count') return '7.25';
  if (parameter.type === 'vector3' || parameter.type === 'points3') return '2, 3, 4';
  if (parameter.type === 'vector2' || parameter.type === 'points2') return '2, 3';
  return `Zz${command.id}${parameter.key}`;
}

/**
 * Tells whether a listing part shows a sample as a quoted or bracketed value.
 *
 * @param part Listing piece.
 * @param sample User value.
 * @returns True when the sample is formatted.
 */
function solidScriptAuditListingQuoted(part: SolidScriptListingPart, sample: string): boolean {
  if (part.kind === 'value' || part.kind === 'note') return part.text.includes(`'${sample}'`);
  return part.kind === 'variable' && (part.text === `[${sample}]` || part.text === sample);
}

/**
 * Returns a problem when a sample appears in the listing without quotes.
 *
 * @param command Command.
 * @param parameter Field.
 * @param sample User value.
 * @param values Line values.
 * @returns Problem, or empty.
 */
function solidScriptAuditListingProblem(
  command: SolidScriptCommand,
  parameter: SolidScriptCommandParameter,
  sample: string,
  values: Record<string, string>,
): string {
  if (sample === '') return '';
  const parts = command.listing(values);
  const seen = parts.filter((part) => part.text.includes(sample));
  if (seen.length === 0) return '';
  if (seen.some((part) => solidScriptAuditListingQuoted(part, sample))) return '';
  const shown = parts.map((part) => part.text).join('');
  return `${command.id}.${parameter.key} shows ${sample} unquoted in "${shown}"`;
}

describe('every user value in a line summary is quoted', () => {
  it.each(solidScriptCommands.map((command) => [command.id, command] as const))('%s', (_id, command) => {
    const problems: string[] = [];
    for (const parameter of command.parameters) {
      const sample = solidScriptAuditListingSample(command, parameter);
      const values = { ...command.valuesDefault(), ...solidScriptAuditFieldValues(parameter, sample) };
      const problem = solidScriptAuditListingProblem(command, parameter, sample, values);
      if (problem) problems.push(problem);
    }
    expect(problems).toEqual([]);
  });
});
