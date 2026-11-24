import { afterEach, describe, expect, it } from 'vitest';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorRowBuild } from '@/solid_script/ui/solid_script_editor_row.js';
import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  SOLID_SCRIPT_EDITOR_VIEW_DEFAULT,
  SOLID_SCRIPT_EDITOR_VIEW_KEY,
  solidScriptEditorViewRead,
  solidScriptEditorViewWrite,
} from '@/solid_script/ui/solid_script_editor_view.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { chip, editorFixture, find } from './solid_script_editor_fixture.js';

const HANDLERS = {
  key: () => {},
  configure: () => {},
  jump: () => {},
  focus: () => {},
  press: () => {},
  release: () => {},
  breakpoint: () => {},
};

describe('SolidScript editor view', () => {
  it('keeps the switches, falling back to the defaults with icons off', () => {
    const storage = new MemorySettingsStorage();
    expect(solidScriptEditorViewRead(storage)).toEqual(SOLID_SCRIPT_EDITOR_VIEW_DEFAULT);
    expect(SOLID_SCRIPT_EDITOR_VIEW_DEFAULT).toEqual({
      highlight: true,
      guides: true,
      brackets: true,
      icons: false,
      squiggles: true,
      endNames: true,
    });
    solidScriptEditorViewWrite({ ...SOLID_SCRIPT_EDITOR_VIEW_DEFAULT, icons: true }, storage);
    expect(solidScriptEditorViewRead(storage).icons).toBe(true);
    storage.setItem(SOLID_SCRIPT_EDITOR_VIEW_KEY, '{broken');
    expect(solidScriptEditorViewRead(storage)).toEqual(SOLID_SCRIPT_EDITOR_VIEW_DEFAULT);
  });

  it('draws a line with indent guides, its icon, colours and squiggles as switched', () => {
    const [block] = solidScriptDocumentCreate([
      { command: 'variable', values: { name: 'Turn', value: '[=Max([$Local.Anglex], 2)]' } },
    ]).blocks;
    const build = (icons: boolean, failed: boolean) =>
      solidScriptEditorRowBuild(
        block!,
        {
          line: 0,
          depth: 2,
          closes: '',
          opener: -1,
          openerCommand: '',
          off: false,
          view: { ...SOLID_SCRIPT_EDITOR_VIEW_DEFAULT, icons },
          unknown: new Set(['$local.anglex']),
          error: new Set(failed ? ['$local.anglex'] : []),
          catalog: SOLID_SCRIPT_COMMAND_CATALOG,
          switches: true,
        },
        HANDLERS,
      );
    const row = build(true, false);
    const chip = row.querySelector<HTMLElement>('[data-command]')!;
    expect(chip.className).toContain('guides');
    expect(chip.style.backgroundSize).toBe('40px 100%');
    expect(chip.querySelector('svg')).not.toBeNull();
    const span = (from: HTMLElement, text: string) =>
      [...from.querySelectorAll('span span')].find((entry) => entry.textContent === text)!;
    expect(span(row, 'Max').className).toContain('token-function');
    expect(span(row, '$Local.Anglex').className).toContain('squiggle');
    expect(span(build(false, true), '$Local.Anglex').className).toContain('squiggle-error');
    expect(build(false, false).querySelector('svg')).toBeNull();
  });

  it('gives an End line the icon of the block it closes and jumps to that block on double-click', () => {
    const [end] = solidScriptDocumentCreate([{ command: 'end' }]).blocks;
    const jumps: number[] = [];
    const row = (openerCommand: string) =>
      solidScriptEditorRowBuild(
        end!,
        {
          line: 5,
          depth: 0,
          closes: 'Transform',
          opener: 2,
          openerCommand,
          off: false,
          view: { ...SOLID_SCRIPT_EDITOR_VIEW_DEFAULT, icons: true },
          unknown: new Set(),
          error: new Set(),
          catalog: SOLID_SCRIPT_COMMAND_CATALOG,
          switches: true,
        },
        { ...HANDLERS, jump: (line) => jumps.push(line), configure: () => jumps.push(-1) },
      );
    const icon = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-command] > span')!;
    const translate = row('transform');
    expect(icon(translate).innerHTML).toBe(icon(row('transform')).innerHTML);
    expect(icon(translate).innerHTML).not.toBe(icon(row('hull')).innerHTML);
    expect(icon(translate).style.color).not.toBe(icon(row('hull')).style.color);
    translate.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(jumps).toEqual([2]);
  });

  it('shows End alone with Block Names On End off, keeping the script and the switch', () => {
    const { script } = editorFixture([{ command: 'transform' }, { command: 'cube' }, { command: 'end' }]);
    const before = JSON.stringify(script());
    expect(chip(2).textContent).toBe('End Transform');
    find<HTMLButtonElement>('[role="tab"][data-tab="settings"]').click();
    const box = [...document.querySelectorAll<HTMLLabelElement>('[data-solid-script-settings] label')]
      .find((row) => row.textContent === 'Block Names On End')
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(box?.checked).toBe(true);
    box!.checked = false;
    box!.dispatchEvent(new Event('change'));
    expect(chip(2).textContent).toBe('End');
    expect(JSON.stringify(script())).toBe(before);
    expect(solidScriptEditorViewRead().endNames).toBe(false);
    box!.checked = true;
    box!.dispatchEvent(new Event('change'));
    expect(chip(2).textContent).toBe('End Transform');
  });
});

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
  localStorage.clear();
});
