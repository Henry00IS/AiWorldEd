import { afterEach, describe, expect, it } from 'vitest';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { SolidScriptEditorFavorites } from '@/solid_script/ui/solid_script_editor_favorites.js';
import { SolidScriptEditorPalette } from '@/solid_script/ui/solid_script_editor_palette.js';
import { SOLID_SCRIPT_EDITOR_FAVORITES_KEY } from '@/solid_script/ui/solid_script_editor_splitters.js';

/**
 * Builds a palette on a storage, in the page.
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
 * Sends a drag event with a data transfer the palette can write and read.
 *
 * @param element Target.
 * @param type Event type.
 * @param data Shared drag data.
 * @param relatedTarget Element the pointer moves to, for enter and leave.
 * @returns The event, to read whether it was taken.
 */
function drag(element: Element, type: string, data: Record<string, string>, relatedTarget: EventTarget | null = null) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, relatedTarget });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      get types() {
        return Object.keys(data);
      },
      files: [],
      getData: (kind: string) => data[kind] ?? '',
      setData: (kind: string, value: string) => void (data[kind] = value),
      dropEffect: 'none',
      effectAllowed: 'all',
    },
  });
  element.dispatchEvent(event);
  return event;
}

/**
 * A command entry outside Favorites.
 *
 * @param palette Palette.
 * @param id Command id.
 * @returns Entry.
 */
function entry(palette: SolidScriptEditorPalette, id: string): HTMLElement {
  const favorites = group(palette);
  const item = [...palette.element.querySelectorAll<HTMLElement>(`[data-command="${id}"]`)].find(
    (candidate) => !favorites.contains(candidate),
  );
  if (!item) throw new Error(`Expected ${id}`);
  return item;
}

/**
 * The Favorites group.
 *
 * @param palette Palette.
 * @returns Group element.
 */
function group(palette: SolidScriptEditorPalette): HTMLElement {
  const favorites = palette.element.querySelector<HTMLElement>('.solid-script-editor-palette-favorites');
  if (!favorites) throw new Error('Expected the Favorites group');
  return favorites;
}

afterEach(() => document.body.replaceChildren());

describe('SolidScript palette: dropping onto Favorites', () => {
  it('adds a command dropped onto the shown Favorites group, outlining it only while over it', () => {
    const storage = new MemorySettingsStorage();
    const palette = paletteOn(storage);
    const data: Record<string, string> = {};
    drag(entry(palette, 'sphere'), 'dragstart', data);
    expect(group(palette).style.outline).toBe('');
    drag(group(palette), 'dragenter', data, entry(palette, 'sphere'));
    expect(group(palette).style.outline).toContain('dashed');
    expect(drag(group(palette), 'dragover', data).defaultPrevented).toBe(true);
    drag(group(palette), 'drop', data);
    drag(entry(palette, 'sphere'), 'dragend', data);
    expect(group(palette).style.outline).toBe('');
    expect(palette.favoritesVisible()).toContain('sphere');
    expect(JSON.parse(storage.getItem(SOLID_SCRIPT_EDITOR_FAVORITES_KEY) ?? '[]')).toContain('sphere');
  });

  it('hides the outline when the drag leaves the group or is cancelled', () => {
    const palette = paletteOn(new MemorySettingsStorage());
    const data: Record<string, string> = {};
    drag(entry(palette, 'sphere'), 'dragstart', data);
    drag(group(palette), 'dragenter', data, document.body);
    const inner = group(palette).querySelector('[data-command]')!;
    drag(inner, 'dragenter', data, group(palette));
    drag(group(palette), 'dragleave', data, inner);
    expect(group(palette).style.outline).toContain('dashed');
    drag(inner, 'dragleave', data, document.body);
    expect(group(palette).style.outline).toBe('');
    drag(group(palette), 'dragenter', data, document.body);
    drag(entry(palette, 'sphere'), 'dragend', data);
    expect(group(palette).style.outline).toBe('');
    expect(palette.favoritesVisible()).not.toContain('sphere');
  });

  it('does not take a command that is already a favorite', () => {
    const palette = paletteOn(new MemorySettingsStorage());
    const before = palette.favoritesVisible();
    const data: Record<string, string> = {};
    drag(entry(palette, 'note'), 'dragstart', data);
    drag(group(palette), 'dragenter', data, document.body);
    expect(group(palette).style.outline).toBe('');
    expect(drag(group(palette), 'dragover', data).defaultPrevented).toBe(false);
    drag(group(palette), 'drop', data);
    expect(palette.favoritesVisible()).toEqual(before);
  });

  it('offers no drop target while searching or when Favorites is empty', () => {
    const storage = new MemorySettingsStorage();
    storage.setItem(SOLID_SCRIPT_EDITOR_FAVORITES_KEY, '[]');
    const palette = paletteOn(storage);
    expect(group(palette).hidden).toBe(true);
    const data: Record<string, string> = {};
    drag(entry(palette, 'sphere'), 'dragstart', data);
    expect(group(palette).hidden).toBe(true);
    expect(drag(group(palette), 'dragover', data).defaultPrevented).toBe(false);
    drag(group(palette), 'drop', data);
    expect(palette.favoritesVisible()).toEqual([]);
    drag(entry(palette, 'sphere'), 'dragend', data);

    const searching = paletteOn(new MemorySettingsStorage());
    searching.search.value = 'sphere';
    searching.search.dispatchEvent(new Event('input'));
    const more: Record<string, string> = {};
    drag(entry(searching, 'sphere'), 'dragstart', more);
    expect(group(searching).hidden).toBe(true);
    expect(drag(group(searching), 'dragover', more).defaultPrevented).toBe(false);
    drag(entry(searching, 'sphere'), 'dragend', more);
    searching.search.value = '';
    searching.search.dispatchEvent(new Event('input'));
    expect(searching.favoritesVisible()).not.toContain('sphere');
  });
});
