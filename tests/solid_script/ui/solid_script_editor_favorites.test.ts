import { afterEach, describe, expect, it } from 'vitest';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { SolidScriptEditorFavorites } from '@/solid_script/ui/solid_script_editor_favorites.js';
import { SOLID_SCRIPT_EDITOR_FAVORITES_DEFAULT } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SolidScriptEditorPalette } from '@/solid_script/ui/solid_script_editor_palette.js';
import { SOLID_SCRIPT_EDITOR_FAVORITES_KEY } from '@/solid_script/ui/solid_script_editor_splitters.js';

/**
 * Builds a palette on a storage, in the page so its menu can open.
 *
 * @param storage Storage of the favorites.
 * @returns Palette.
 */
function paletteOn(storage: MemorySettingsStorage): SolidScriptEditorPalette {
  const palette = new SolidScriptEditorPalette(
    () => undefined,
    () => undefined,
    new SolidScriptEditorFavorites(storage),
  );
  document.body.append(palette.element);
  return palette;
}

/**
 * Right-clicks a command of the palette and picks a menu entry.
 *
 * @param palette Palette.
 * @param id Command id.
 * @param label Menu entry expected.
 * @param inFavorites True to click the copy under Favorites.
 */
function menuPick(palette: SolidScriptEditorPalette, id: string, label: string, inFavorites = false): void {
  const items = [...palette.element.querySelectorAll<HTMLElement>(`[data-command="${id}"]`)];
  const favorites = palette.element.querySelector('.solid-script-editor-palette-favorites');
  const item = items.find((candidate) => favorites?.contains(candidate) === inFavorites);
  if (!item) throw new Error(`Expected ${id}${inFavorites ? ' under Favorites' : ''}`);
  item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  const entry = [...document.querySelectorAll<HTMLElement>('[role="menuitem"], button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!entry) throw new Error(`Expected the ${label} menu entry`);
  entry.click();
}

/**
 * Types into the palette search.
 *
 * @param palette Palette.
 * @param text Search text.
 */
function searchType(palette: SolidScriptEditorPalette, text: string): void {
  palette.search.value = text;
  palette.search.dispatchEvent(new Event('input'));
}

/**
 * Reads the Favorites group.
 *
 * @param palette Palette.
 * @returns The group element.
 */
function group(palette: SolidScriptEditorPalette): HTMLElement {
  return palette.element.querySelector<HTMLElement>('.solid-script-editor-palette-favorites')!;
}

afterEach(() => document.body.replaceChildren());

describe('Palette Favorites', () => {
  it('starts with Echo, Input, Note and Set, first and in name order', () => {
    const palette = paletteOn(new MemorySettingsStorage());
    expect(SOLID_SCRIPT_EDITOR_FAVORITES_DEFAULT).toEqual(['note', 'echo', 'variable', 'input']);
    expect(palette.favoritesVisible()).toEqual(['echo', 'input', 'note', 'variable']);
    expect(palette.element.querySelector('.solid-script-editor-palette-list')?.firstElementChild).toBe(group(palette));
    expect(group(palette).firstElementChild?.textContent).toBe('Favorites');
  });

  it('adds and removes with the right-click menu, from any group, and keeps name order', () => {
    const storage = new MemorySettingsStorage();
    const palette = paletteOn(storage);
    menuPick(palette, 'cube', 'Add to Favorites');
    expect(palette.favoritesVisible()).toEqual(['cube', 'echo', 'input', 'note', 'variable']);
    menuPick(palette, 'note', 'Remove from Favorites', true);
    menuPick(palette, 'echo', 'Remove from Favorites');
    expect(palette.favoritesVisible()).toEqual(['cube', 'input', 'variable']);
    expect(JSON.parse(storage.getItem(SOLID_SCRIPT_EDITOR_FAVORITES_KEY) ?? '[]')).toEqual([
      'variable',
      'input',
      'cube',
    ]);
  });

  it('remembers the ids and loads them again, dropping commands that no longer exist', () => {
    const storage = new MemorySettingsStorage();
    menuPick(paletteOn(storage), 'sphere', 'Add to Favorites');
    document.body.replaceChildren();
    expect(paletteOn(storage).favoritesVisible()).toEqual(['echo', 'input', 'note', 'variable', 'sphere']);
    storage.setItem(SOLID_SCRIPT_EDITOR_FAVORITES_KEY, JSON.stringify(['gone_command', 'cube', 7, 'cube']));
    expect(new SolidScriptEditorFavorites(storage).read()).toEqual(['cube']);
    expect(paletteOn(storage).favoritesVisible()).toEqual(['cube']);
  });

  it('hides Favorites while searching, so results show in their own groups only', () => {
    const palette = paletteOn(new MemorySettingsStorage());
    searchType(palette, 'echo');
    expect(group(palette).hidden).toBe(true);
    expect(palette.favoritesVisible()).toEqual([]);
    expect(palette.visible()).toEqual(['echo']);
    searchType(palette, '');
    expect(group(palette).hidden).toBe(false);
  });

  it('hides the whole group, caption too, when empty, keeps it empty, and brings it back with a favorite', () => {
    const storage = new MemorySettingsStorage();
    const palette = paletteOn(storage);
    for (const id of ['echo', 'input', 'note', 'variable']) menuPick(palette, id, 'Remove from Favorites', true);
    expect(group(palette).hidden).toBe(true);
    expect(group(palette).textContent).toBe('');
    document.body.replaceChildren();
    const reloaded = paletteOn(storage);
    expect(reloaded.favoritesVisible()).toEqual([]);
    expect(group(reloaded).hidden).toBe(true);
    searchType(reloaded, 'x');
    searchType(reloaded, '');
    expect(group(reloaded).hidden).toBe(true);
    menuPick(reloaded, 'cube', 'Add to Favorites');
    expect(group(reloaded).hidden).toBe(false);
    expect(group(reloaded).firstElementChild?.textContent).toBe('Favorites');
    expect(reloaded.favoritesVisible()).toEqual(['cube']);
  });
});
