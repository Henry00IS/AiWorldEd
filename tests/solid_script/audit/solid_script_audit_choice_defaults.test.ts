import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptAuditDefaultProblem } from './solid_script_audit_default_run.js';

/**
 * Tells whether an empty choice keeps what the brush already has instead of
 * using a default: an optional field with no declared default, such as
 * Transform UVs Textures.
 *
 * @param parameter Field.
 * @returns True when empty means keep.
 */
function solidScriptAuditKeepsWhenEmpty(parameter: SolidScriptCommandParameter): boolean {
  return parameter.optional === true && parameter.default === '';
}

describe('an empty choice field does what its declared default does', () => {
  const choices = solidScriptCommands.flatMap((command) =>
    command.parameters
      .filter((parameter) => parameter.words && parameter.words.length > 0)
      .filter((parameter) => !solidScriptAuditKeepsWhenEmpty(parameter))
      .map((parameter) => [command.id, parameter.key, command, parameter] as const),
  );

  it.each(choices)('%s.%s', (_id, _key, command, parameter) => {
    expect(solidScriptAuditDefaultProblem(command, parameter)).toBe('');
  });
});
