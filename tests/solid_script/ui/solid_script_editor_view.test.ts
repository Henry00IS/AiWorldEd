import { describe, expect, it } from 'vitest';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorRowBuild } from '@/solid_script/ui/solid_script_editor_row.js';
import {
  SOLID_SCRIPT_EDITOR_VIEW_DEFAULT,
  SOLID_SCRIPT_EDITOR_VIEW_KEY,
  solidScriptEditorViewRead,
  solidScriptEditorViewWrite,
} from '@/solid_script/ui/solid_script_editor_view.js';

const HANDLERS = {
  key: () => {},
  configure: () => {},
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
    });
    solidScriptEditorViewWrite({ ...SOLID_SCRIPT_EDITOR_VIEW_DEFAULT, icons: true }, storage);
    expect(solidScriptEditorViewRead(storage).icons).toBe(true);
    storage.setItem(SOLID_SCRIPT_EDITOR_VIEW_KEY, '{broken');
    expect(solidScriptEditorViewRead(storage)).toEqual(SOLID_SCRIPT_EDITOR_VIEW_DEFAULT);
  });

  it('draws a line with indent guides, its icon, colours and squiggles as switched', () => {
    const [block] = solidScriptDocumentCreate([
      { command: 'variable', values: { name: 'Turn', value: '[=Max([Local.Anglex], 2)]' } },
    ]).blocks;
    const build = (icons: boolean, failed: boolean) =>
      solidScriptEditorRowBuild(
        block!,
        {
          line: 0,
          depth: 2,
          closes: '',
          off: false,
          view: { ...SOLID_SCRIPT_EDITOR_VIEW_DEFAULT, icons },
          unknown: new Set(['local.anglex']),
          error: new Set(failed ? ['local.anglex'] : []),
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
    expect(span(row, 'Local.Anglex').className).toContain('squiggle');
    expect(span(build(false, true), 'Local.Anglex').className).toContain('squiggle-error');
    expect(build(false, false).querySelector('svg')).toBeNull();
  });
});
