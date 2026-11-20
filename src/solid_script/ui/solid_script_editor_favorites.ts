import { LocalSettingsStorage, type SettingsStorage } from '@/settings/storage/settings_storage.js';
import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommandCatalog } from '@/solid_script/commands/solid_script_command_catalog_base.js';
import { SOLID_SCRIPT_EDITOR_FAVORITES_KEY } from './solid_script_editor_splitters.js';

/**
 * Remembers the commands the user keeps in the palette's Favorites between
 * sessions, as command ids, one list per catalog. Ids of commands that no
 * longer exist are dropped quietly; an empty list stays empty.
 */
export class SolidScriptEditorFavorites {
  /**
   * Creates the memory of the favorites.
   *
   * @param storage Storage; the browser's local storage when left out.
   * @param catalog Commands the favorites are picked from.
   */
  constructor(
    private readonly storage: SettingsStorage = new LocalSettingsStorage(),
    private readonly catalog: SolidScriptCommandCatalog = SOLID_SCRIPT_COMMAND_CATALOG,
  ) {}

  /**
   * Returns the storage key of the catalog's favorites.
   *
   * @returns Key.
   */
  private key(): string {
    return this.catalog === SOLID_SCRIPT_COMMAND_CATALOG
      ? SOLID_SCRIPT_EDITOR_FAVORITES_KEY
      : `${SOLID_SCRIPT_EDITOR_FAVORITES_KEY}.${this.catalog.name}`;
  }

  /**
   * Reads the favorite command ids.
   *
   * @returns Ids of existing commands, each once; the defaults when none were
   *   ever stored or the stored value is broken.
   */
  read(): string[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.storage.getItem(this.key()) ?? 'null');
    } catch {
      parsed = null;
    }
    const ids = Array.isArray(parsed) ? parsed : this.catalog.favoritesDefault;
    const known = ids.filter((id): id is string => typeof id === 'string' && this.catalog.find(id) !== undefined);
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
    this.storage.setItem(this.key(), JSON.stringify(next));
    return next;
  }
}
