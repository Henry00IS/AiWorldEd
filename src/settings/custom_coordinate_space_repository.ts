import {
  cloneCoordinateSpace,
  parseCoordinateSpaceDefinition
} from './coordinate_space_presets.js';
import type { CoordinateSpaceDefinition } from './coordinate_space_types.js';
import type { SettingsStorage } from './settings_storage.js';

/** Storage key for user-authored coordinate space presets. */
export const CUSTOM_COORDINATE_SPACE_STORAGE_KEY =
  'aiworlded.coordinate_space.custom_presets';

/**
 * Loads and saves custom coordinate space presets as a JSON array.
 */
export class CustomCoordinateSpaceRepository {
  private readonly storage: SettingsStorage;

  /**
   * Creates a repository bound to settings storage.
   * @param storage Key-value storage backend.
   */
  constructor(storage: SettingsStorage) {
    this.storage = storage;
  }

  /**
   * Loads all custom presets from storage.
   * @returns Cloned custom preset list (empty when missing/invalid).
   */
  loadAll(): CoordinateSpaceDefinition[] {
    const raw = this.storage.getItem(CUSTOM_COORDINATE_SPACE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return this.parsePresetList(raw);
  }

  /**
   * Persists the full custom preset list.
   * @param presets Custom presets to save.
   */
  saveAll(presets: CoordinateSpaceDefinition[]): void {
    const document = presets.map((preset) => cloneCoordinateSpace(preset));
    this.storage.setItem(
      CUSTOM_COORDINATE_SPACE_STORAGE_KEY,
      JSON.stringify(document)
    );
  }

  /**
   * Parses a JSON array of coordinate space definitions.
   * @param raw JSON text.
   * @returns Valid presets only.
   */
  private parsePresetList(raw: string): CoordinateSpaceDefinition[] {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((entry) => this.tryParsePreset(entry))
        .filter((entry): entry is CoordinateSpaceDefinition => entry !== null);
    } catch {
      return [];
    }
  }

  /**
   * Attempts to parse one preset entry.
   * @param entry Candidate JSON value.
   * @returns Definition or null when invalid.
   */
  private tryParsePreset(entry: unknown): CoordinateSpaceDefinition | null {
    try {
      const space = parseCoordinateSpaceDefinition(entry);
      space.isCustom = true;
      return space;
    } catch {
      return null;
    }
  }
}
