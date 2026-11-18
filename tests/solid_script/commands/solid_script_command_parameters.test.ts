import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';

/** Keys of the fields that write what a line makes or finds into a variable. */
const SOLID_SCRIPT_TEST_WRITTEN_KEYS = new Set(['into', 'top', 'sides', 'inner', 'ring', 'normals', 'result']);

describe('SolidScript fields naming a variable the line writes', () => {
  it('marks every Into-like field so it offers the variables of the script', () => {
    const written = solidScriptCommands.flatMap((command) =>
      command.parameters
        .filter(
          (parameter) =>
            SOLID_SCRIPT_TEST_WRITTEN_KEYS.has(parameter.key) && ['name', 'target'].includes(parameter.type),
        )
        .map((parameter) => ({ field: `${command.id}.${parameter.key}`, writes: parameter.writes?.offers })),
    );
    expect(written.length).toBeGreaterThan(SOLID_SCRIPT_TEST_WRITTEN_KEYS.size);
    for (const { field, writes } of written) expect(writes, field).toBe('name');
  });

  it('marks the Set Variable field for whole paths, and the loop names for plain names', () => {
    const writes = (command: string, key: string) =>
      solidScriptCommands.find((entry) => entry.id === command)?.parameters.find((parameter) => parameter.key === key)
        ?.writes?.offers;
    expect(writes('variable', 'name')).toBe('path');
    expect(writes('repeat', 'variable')).toBe('name');
    expect(writes('for_each', 'variable')).toBe('name');
    expect(writes('for_each', 'key')).toBe('name');
  });
});
