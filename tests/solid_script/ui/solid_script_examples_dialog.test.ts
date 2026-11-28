import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommandLabelCompare } from '@/solid_script/commands/solid_script_command_catalog_base.js';
import { SOLID_SCRIPT_EXAMPLE_GROUPS, SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';
import { solidScriptExamplesAsk } from '@/solid_script/ui/solid_script_examples_dialog.js';

afterEach(() => document.body.replaceChildren());

describe('Examples window', () => {
  it('counts the lines that do something, leaving out notes and blank lines', () => {
    void solidScriptExamplesAsk(document.body);
    const example = SOLID_SCRIPT_EXAMPLES.find((each) => each.name === 'Path Stairs')!;
    document.querySelector<HTMLElement>(`[data-solid-script-example="${example.id}"]`)?.click();
    const counted = example.lines.filter((line) => line.command !== 'note' && line.command !== 'blank').length;
    expect(counted).toBeLessThan(example.lines.length);
    const text = document.querySelector('[data-solid-script-examples]')?.textContent ?? '';
    expect(text).toContain(` ${counted} lines.`);
    expect(text).not.toContain(` ${example.lines.length} lines.`);
  });

  it('lists the examples of every group by display name, in group order', () => {
    void solidScriptExamplesAsk(document.body);
    const shown: string[] = [];
    const names = new Map<string, string[]>(SOLID_SCRIPT_EXAMPLE_GROUPS.map((group) => [group, []]));
    let group: string | undefined;
    for (const row of document.querySelectorAll<HTMLElement>('[data-solid-script-examples] [role="listbox"] > *')) {
      const id = row.dataset['solidScriptExample'];
      if (id === undefined) {
        group = row.textContent ?? undefined;
        shown.push(group ?? '');
        continue;
      }
      expect(group, id).toBeDefined();
      names.get(group!)?.push(row.textContent ?? '');
    }
    expect(shown).toEqual([...SOLID_SCRIPT_EXAMPLE_GROUPS]);
    for (const groupName of SOLID_SCRIPT_EXAMPLE_GROUPS) {
      const listed = names.get(groupName) ?? [];
      const expected = SOLID_SCRIPT_EXAMPLES.filter((example) => example.group === groupName).map(
        (example) => example.name,
      );
      expect(listed, groupName).toEqual(expected);
      expect(listed, groupName).toEqual([...listed].sort(solidScriptCommandLabelCompare));
    }
  });
});
