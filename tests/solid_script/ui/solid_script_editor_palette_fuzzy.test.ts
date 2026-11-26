import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptFormulaCatalog } from '@/solid_script/commands/solid_script_formula_commands.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';
import { SolidScriptEditorFavorites } from '@/solid_script/ui/solid_script_editor_favorites.js';
import {
  SOLID_SCRIPT_EDITOR_PALETTE_SCRIPT,
  SolidScriptEditorPalette,
} from '@/solid_script/ui/solid_script_editor_palette.js';

/**
 * Builds the script palette, keeping the ids of commands it inserts.
 *
 * @param inserted Receives each inserted command id.
 * @returns Palette.
 */
function paletteOn(inserted: string[] = []): SolidScriptEditorPalette {
  return new SolidScriptEditorPalette(
    (id) => inserted.push(id),
    () => undefined,
  );
}

/**
 * Types a search into the palette.
 *
 * @param palette Palette.
 * @param text Search text.
 */
function type(palette: SolidScriptEditorPalette, text: string): void {
  palette.search.value = text;
  palette.search.dispatchEvent(new Event('input'));
}

/**
 * Reads the list sections a person can see, top to bottom, leaving out
 * Favorites.
 *
 * @param palette Palette.
 * @returns Each caption with the command ids under it.
 */
function sections(palette: SolidScriptEditorPalette): { caption: string; ids: string[] }[] {
  const list = palette.element.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.paletteList}`);
  const result: { caption: string; ids: string[] }[] = [];
  for (const child of list?.children ?? []) {
    const element = child as HTMLElement;
    if (element.hidden || element.className.includes('favorites')) continue;
    if (element.className.includes('caption')) result.push({ caption: element.textContent ?? '', ids: [] });
    else if (element.dataset['command']) result.at(-1)?.ids.push(element.dataset['command']);
  }
  return result;
}

/**
 * Reads the command ids of the list items a person can see, top to bottom.
 *
 * @param palette Palette.
 * @returns Ids in the order the page shows them.
 */
function onScreen(palette: SolidScriptEditorPalette): string[] {
  return sections(palette).flatMap((section) => section.ids);
}

/**
 * Reads the id of the highlighted command.
 *
 * @param palette Palette.
 * @returns Id, or null when nothing is highlighted.
 */
function highlighted(palette: SolidScriptEditorPalette): string | null {
  const item = palette.element.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.paletteHighlighted}`);
  return item?.dataset['command'] ?? null;
}

/**
 * Reads the captions a person can see, top to bottom.
 *
 * @param palette Palette.
 * @returns Category names.
 */
function captions(palette: SolidScriptEditorPalette): string[] {
  return sections(palette).map((section) => section.caption);
}

describe('SolidScript palette fuzzy search', () => {
  it.each(['set', 'Set', 'SET', '  set  '])('puts the Set command first and highlights it for %j', (text) => {
    const palette = paletteOn();
    type(palette, text);
    expect(palette.visible()[0]).toBe('variable');
    expect(onScreen(palette)[0]).toBe('variable');
    expect(highlighted(palette)).toBe('variable');
    expect(SOLID_SCRIPT_COMMAND_CATALOG.find('variable')?.label).toBe('Set');
  });

  it('lists the exact name, then names that start with it, then the rest, inside each group', () => {
    const palette = paletteOn();
    type(palette, 'set');
    const label = (id: string): string => SOLID_SCRIPT_COMMAND_CATALOG.find(id)?.label ?? '';
    expect(label(onScreen(palette)[0] ?? '')).toBe('Set');
    for (const section of sections(palette)) {
      const starts = section.ids.map((id) => label(id).toLowerCase().startsWith('set'));
      const firstOther = starts.indexOf(false);
      if (firstOther >= 0) expect(starts.slice(firstOther).some(Boolean), section.caption).toBe(false);
    }
  });

  it('shows the group of the best match first', () => {
    const palette = paletteOn();
    type(palette, 'set');
    expect(captions(palette)[0]).toBe('Logic');
  });

  it.each([
    ['foreach', 'for_each'],
    ['for each', 'for_each'],
    ['fe', 'for_each'],
    ['fch', 'for_each'],
    ['blh', 'blastHole'],
    ['mfs', 'mesh_from_solids'],
    ['meshfrom', 'mesh_from_solids'],
    ['blasthole', 'blastHole'],
  ])('finds %j as %s, first and highlighted', (text, id) => {
    const palette = paletteOn();
    type(palette, text);
    expect(palette.visible()[0]).toBe(id);
    expect(onScreen(palette)[0]).toBe(id);
    expect(highlighted(palette)).toBe(id);
  });

  it('puts every command first when its full name is typed, in either palette', () => {
    const formula = solidScriptFormulaCatalog();
    const palettes = [
      paletteOn(),
      new SolidScriptEditorPalette(
        () => undefined,
        () => undefined,
        new SolidScriptEditorFavorites(undefined, formula),
        { ...SOLID_SCRIPT_EDITOR_PALETTE_SCRIPT, catalog: formula, target: 'the formula' },
      ),
    ];
    const catalogs = [SOLID_SCRIPT_COMMAND_CATALOG, formula];
    palettes.forEach((palette, which) => {
      const catalog = catalogs[which];
      const commands = (catalog?.categories ?? []).flatMap((category) => catalog?.ofCategory(category) ?? []);
      expect(commands.length).toBeGreaterThan(100);
      for (const command of commands) {
        type(palette, command.label);
        const first =
          SOLID_SCRIPT_COMMAND_CATALOG.find(palette.visible()[0] ?? '') ?? catalog?.find(palette.visible()[0] ?? '');
        expect(first?.label.toLowerCase(), command.id).toBe(command.label.toLowerCase());
        expect(onScreen(palette)[0], command.id).toBe(palette.visible()[0]);
      }
    });
  });

  it('keeps the display order and the page order the same while typing letter by letter', () => {
    const palette = paletteOn();
    for (const text of [
      'f',
      'fo',
      'for',
      'fore',
      'forea',
      'foreac',
      'foreach',
      'foreac',
      'fore',
      'for',
      'fo',
      'f',
      '',
    ]) {
      type(palette, text);
      expect(onScreen(palette), text).toEqual(palette.visible());
    }
  });

  it('brings back the catalog order, every caption and no notice when the search is cleared', () => {
    const palette = paletteOn();
    const before = onScreen(palette);
    const captionsBefore = captions(palette);
    type(palette, 'set');
    expect(onScreen(palette)).not.toEqual(before);
    type(palette, '');
    expect(onScreen(palette)).toEqual(before);
    expect(captions(palette)).toEqual(captionsBefore);
    expect(highlighted(palette)).toBeNull();
  });

  it('clears the search and the order with Escape', () => {
    const palette = paletteOn();
    const before = onScreen(palette);
    type(palette, 'blh');
    palette.search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(palette.search.value).toBe('');
    expect(onScreen(palette)).toEqual(before);
  });

  it('inserts the best match with Enter and moves down the ranking with the arrow keys', () => {
    const inserted: string[] = [];
    const palette = paletteOn(inserted);
    type(palette, 'set');
    palette.search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(inserted).toEqual(['variable']);
    palette.search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(highlighted(palette)).toBe(palette.visible()[1]);
    palette.search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(highlighted(palette)).toBe('variable');
  });

  it('shows the notice and no caption when nothing fits', () => {
    const palette = paletteOn();
    type(palette, 'qqqqzzzzxxxx');
    expect(palette.visible()).toEqual([]);
    expect(captions(palette)).toEqual([]);
    expect(palette.element.textContent).toContain('No command matches');
    type(palette, 'echo');
    expect(palette.element.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.paletteEmpty}`)?.hasAttribute('hidden')).toBe(
      true,
    );
  });

  it('keeps finding a word of the description, as before', () => {
    const palette = paletteOn();
    type(palette, 'round');
    expect(palette.visible().length).toBeGreaterThan(0);
    type(palette, 'cut');
    expect(palette.visible().length).toBeGreaterThan(0);
  });

  it('leaves out names that only hold the typed letters scattered while a closer one exists', () => {
    const palette = paletteOn();
    type(palette, 'echo');
    expect(palette.visible()).toEqual(['echo']);
  });

  it('copes with odd searches: one letter, punctuation, unicode, a very long text', () => {
    const palette = paletteOn();
    for (const text of ['f', '$', '.', '()', 'é', '日本', '😀', 'x'.repeat(20000), '   ', 'a b c d e f g h']) {
      expect(() => type(palette, text), text.slice(0, 10)).not.toThrow();
      expect(onScreen(palette), text.slice(0, 10)).toEqual(palette.visible());
    }
    type(palette, 'x'.repeat(20000));
    expect(palette.visible()).toEqual([]);
  });

  it('hides Favorites while searching and keeps them first when the search is cleared', () => {
    const palette = paletteOn();
    type(palette, 'set');
    expect(palette.favoritesVisible()).toEqual([]);
    type(palette, '');
    const first = palette.element.querySelector<HTMLElement>(
      `.${SOLID_SCRIPT_EDITOR_CLASSES.paletteList}`,
    )?.firstElementChild;
    expect(first?.className).toContain('favorites');
  });
});
