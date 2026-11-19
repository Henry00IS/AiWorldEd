import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  solidScriptParameterPlaceholder,
  solidScriptParameterPlaceholderValue,
} from '@/solid_script/commands/solid_script_parameter_default.js';

describe('placeholders are only typeable values, never a description of empty', () => {
  it('shows no placeholder that cannot be typed into the field as-is', () => {
    const hits: string[] = [];
    for (const command of solidScriptCommands) {
      for (const parameter of command.parameters) {
        const declared = parameter.placeholder ?? '';
        const shown = solidScriptParameterPlaceholder(parameter);
        if (declared !== '' && !solidScriptParameterPlaceholderValue(parameter, declared))
          hits.push(`${command.id}.${parameter.key} declares "${declared}"`);
        if (shown !== '' && !solidScriptParameterPlaceholderValue(parameter, shown))
          hits.push(`${command.id}.${parameter.key} shows "${shown}"`);
      }
    }
    expect(hits).toEqual([]);
  });
});
