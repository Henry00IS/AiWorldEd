import { describe, expect, it } from 'vitest';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { SOLID_SCRIPT_AUDIT_COMMANDS } from './solid_script_audit_lines.js';

/**
 * Values a field is shown with and read back from, beyond its own default and
 * words.
 */
const VALUES = ['', '7', '[A]', '[=[A] + 1]', 'a, b', '$[x$] "q"', '1, 2, 3'];

/**
 * Reads a field back after showing it with a value.
 *
 * @param parameter Field.
 * @param value Stored value.
 * @returns Value the field gives back unedited.
 */
const reread = (parameter: Parameters<typeof solidScriptConfiguratorFieldBuild>[0], value: string): string =>
  solidScriptConfiguratorFieldBuild(parameter, value, () => {}).read();

describe('the configurator gives every field value back unchanged when it is opened and closed unedited', () => {
  it.each(SOLID_SCRIPT_AUDIT_COMMANDS)('%s', (_id, command) => {
    const lost: string[] = [];
    for (const parameter of command.parameters) {
      const own = [parameter.default, ...(parameter.words ?? []).map((word) => word.word)];
      for (const value of [...own, ...VALUES]) {
        const back = reread(parameter, value);
        if (back !== value && reread(parameter, back) !== back)
          lost.push(`${parameter.key} ${JSON.stringify(value)} -> ${JSON.stringify(back)} (unstable)`);
        else if (back !== value && own.includes(value))
          lost.push(`${parameter.key} ${JSON.stringify(value)} -> ${JSON.stringify(back)}`);
        else if (back !== value && parameter.type !== 'boolean')
          lost.push(`${parameter.key} ${JSON.stringify(value)} -> ${JSON.stringify(back)}`);
      }
    }
    expect(lost).toEqual([]);
  });
});
