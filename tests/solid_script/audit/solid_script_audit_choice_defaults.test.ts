import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptAuditDefaultProblem } from './solid_script_audit_default_run.js';

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
