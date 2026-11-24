import { afterEach, describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';
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
});
