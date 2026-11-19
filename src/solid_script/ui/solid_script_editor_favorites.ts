import { LocalSettingsStorage, type SettingsStorage } from '@/settings/storage/settings_storage.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_COMMAND_INPUT } from '@/solid_script/language/solid_script_input.js';
import { SOLID_SCRIPT_EDITOR_FAVORITES_KEY } from './solid_script_editor_splitters.js';

/** Favorite command ids before the user changes them: Note, Echo, Set and Input. */
export const SOLID_SCRIPT_EDITOR_FAVORITES_DEFAULT: readonly string[] = [
  'note',
  'echo',
  'variable',
  SOLID_SCRIPT_COMMAND_INPUT,
];

/**
 * Remembers the commands the user keeps in the palette's Favorites between
 * sessions, as command ids. Ids of commands that no longer exist are dropped
 * quietly; an empty list stays empty.
 */
export class SolidScriptEditorFavorites {
  /**
   * Creates the memory of the favorites.
   *
   * @param storage Storage; the browser's local storage when left out.
   */
  constructor(private readonly storage: SettingsStorage = new LocalSettingsStorage()) {}

  /**
   * Reads the favorite command ids.
   *
   * @returns Ids of existing commands, each once; the defaults when none were
   *   ever stored or the stored value is broken.
   */
  read(): string[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.storage.getItem(SOLID_SCRIPT_EDITOR_FAVORITES_KEY) ?? 'null');
    } catch {
      parsed = null;
    }
    const ids = Array.isArray(parsed) ? parsed : SOLID_SCRIPT_EDITOR_FAVORITES_DEFAULT;
    const known = ids.filter((id): id is string => typeof id === 'string' && solidScriptCommandFind(id) !== undefined);
    return [...new Set(known)];
  }

  /**
   * Adds a command to the favorites, or removes it when it is one.
   *
   * @param id Command id.
   * @returns The favorite ids after the change.
   */
  toggle(id: string): string[] {
    const ids = this.read();
    const next = ids.includes(id) ? ids.filter((known) => known !== id) : [...ids, id];
    this.storage.setItem(SOLID_SCRIPT_EDITOR_FAVORITES_KEY, JSON.stringify(next));
    return next;
  }
}
