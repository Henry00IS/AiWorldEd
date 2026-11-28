import { describe, expect, it } from 'vitest';
import { solidScriptCommandLabelCompare } from '@/solid_script/commands/solid_script_command_catalog_base.js';
import { SOLID_SCRIPT_EXAMPLE_GROUPS, SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';

describe('SolidScript examples order', () => {
  it('lists the examples of every group by display name, in group order', () => {
    const listed = SOLID_SCRIPT_EXAMPLE_GROUPS.flatMap((group) =>
      SOLID_SCRIPT_EXAMPLES.filter((example) => example.group === group),
    );
    expect(SOLID_SCRIPT_EXAMPLES.map((example) => example.id)).toEqual(listed.map((example) => example.id));
    for (const group of SOLID_SCRIPT_EXAMPLE_GROUPS) {
      const names = listed.filter((example) => example.group === group).map((example) => example.name);
      expect(names, group).toEqual([...names].sort(solidScriptCommandLabelCompare));
    }
  });
});
