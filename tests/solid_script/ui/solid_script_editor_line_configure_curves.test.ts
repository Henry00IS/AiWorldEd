import { afterEach, describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate, type SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentResources } from '@/solid_script/document/solid_script_resource.js';
import { SolidScriptEditorLineConfigure } from '@/solid_script/ui/solid_script_editor_line_configure.js';

afterEach(() => document.body.replaceChildren());

/**
 * Opens the options of the first line of a script and keeps what is stored.
 *
 * @returns Stored scripts, and the script as it starts.
 */
function configure(): SolidScriptDocument[] {
  const commits: SolidScriptDocument[] = [solidScriptDocumentCreate([{ command: 'column', values: {} }])];
  new SolidScriptEditorLineConfigure({
    catalog: SOLID_SCRIPT_COMMAND_CATALOG,
    document: () => commits.at(-1)!,
    commit: (next) => commits.push(next),
    notice: () => undefined,
    names: () => [],
    inputs: () => [],
    fills: () => [],
    mount: () => document.body,
    parent: () => null,
  }).configure(0);
  return commits;
}

/**
 * Presses a button of the open window.
 *
 * @param text Button text.
 */
function press(text: string): void {
  [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === text)!
    .click();
}

describe('options of a line with a curve field', () => {
  it('store a New Curve with the script and the field naming it', () => {
    const commits = configure();
    const select = document.body.querySelector<HTMLSelectElement>('select[aria-label="Profile resource"]')!;
    select.value = '+';
    select.dispatchEvent(new Event('change'));
    press('OK');
    const stored = commits.at(-1)!;
    expect(solidScriptDocumentResources(stored).map((resource) => resource.name)).toEqual(['Profile']);
    expect(stored.blocks[0]!.values['profile']).toBe('[$Resources.Profile]');
  });

  it('store nothing on Cancel', () => {
    const commits = configure();
    const select = document.body.querySelector<HTMLSelectElement>('select[aria-label="Profile resource"]')!;
    select.value = '+';
    select.dispatchEvent(new Event('change'));
    press('Cancel');
    expect(commits).toHaveLength(1);
  });
});
