import { createDefaultGameProfile } from './settings_defaults.js';
import {
  buildGameProfileFileName,
  parseGameProfileJson,
  serializeGameProfileToJson
} from './game_profile_json.js';
import type { GameProfile } from './settings_types.js';
import type { SettingsStorage } from './settings_storage.js';

/** Storage key prefix for individual game profile JSON documents. */
export const GAME_PROFILE_STORAGE_PREFIX = 'aiworlded.game_profile.';

/** Storage key for the ordered profile id index and active selection. */
export const GAME_PROFILE_INDEX_KEY = 'aiworlded.game_profiles.index';

/**
 * Index document listing profile ids and the active profile.
 */
interface GameProfileIndexDocument {
  activeGameProfileId: string | null;
  profileIds: string[];
}

/**
 * Loads and saves one JSON document per game profile via settings storage.
 */
export class GameProfileRepository {
  private readonly storage: SettingsStorage;

  /**
   * Creates a repository bound to a settings storage backend.
   * @param storage Key-value storage implementation.
   */
  constructor(storage: SettingsStorage) {
    this.storage = storage;
  }

  /**
   * Loads all profiles and the active profile id from storage.
   * Seeds a default profile when storage is empty.
   * @returns Profiles and active id.
   */
  loadAll(): { profiles: GameProfile[]; activeGameProfileId: string | null } {
    const index = this.readIndex();
    const profiles = this.loadProfilesFromIndex(index);
    if (profiles.length === 0) {
      return this.seedDefaultProfile();
    }
    const activeGameProfileId = this.resolveActiveId(index, profiles);
    return { profiles, activeGameProfileId };
  }

  /**
   * Persists the full profile list and active selection.
   * Writes one JSON blob per profile and refreshes the index.
   * @param profiles Profiles to save.
   * @param activeGameProfileId Active profile id.
   */
  saveAll(profiles: GameProfile[], activeGameProfileId: string | null): void {
    const previousIds = this.readIndex().profileIds;
    this.writeIndex(profiles, activeGameProfileId);
    profiles.forEach((profile) => this.saveProfile(profile));
    this.removeOrphanedProfiles(previousIds, profiles);
  }

  /**
   * Saves a single profile as its own JSON document.
   * @param profile Profile to persist.
   */
  saveProfile(profile: GameProfile): void {
    const key = this.buildProfileKey(profile.id);
    this.storage.setItem(key, serializeGameProfileToJson(profile));
  }

  /**
   * Returns the JSON file contents for a profile.
   * @param profile Profile to export.
   * @returns Pretty-printed JSON string.
   */
  getProfileJsonFileContents(profile: GameProfile): string {
    return serializeGameProfileToJson(profile);
  }

  /**
   * Returns the suggested `.json` filename for a profile.
   * @param profile Profile to name.
   * @returns Filename ending in `.json`.
   */
  getProfileFileName(profile: GameProfile): string {
    return buildGameProfileFileName(profile.name);
  }

  /**
   * Parses a profile from JSON file text.
   * @param jsonText File contents.
   * @returns Parsed profile.
   */
  parseProfileFile(jsonText: string): GameProfile {
    return parseGameProfileJson(jsonText);
  }

  /**
   * Builds the storage key for a profile id.
   * @param profileId Profile identifier.
   * @returns Storage key.
   */
  buildProfileKey(profileId: string): string {
    return `${GAME_PROFILE_STORAGE_PREFIX}${profileId}`;
  }

  /**
   * Reads the profile index document from storage.
   * @returns Index with empty lists when missing or invalid.
   */
  private readIndex(): GameProfileIndexDocument {
    const raw = this.storage.getItem(GAME_PROFILE_INDEX_KEY);
    if (!raw) {
      return { activeGameProfileId: null, profileIds: [] };
    }
    return this.parseIndexDocument(raw);
  }

  /**
   * Parses an index JSON string with safe fallbacks.
   * @param raw JSON text.
   * @returns Normalized index document.
   */
  private parseIndexDocument(raw: string): GameProfileIndexDocument {
    try {
      const parsed = JSON.parse(raw) as Partial<GameProfileIndexDocument>;
      const profileIds = Array.isArray(parsed.profileIds)
        ? parsed.profileIds.filter((id) => typeof id === 'string')
        : [];
      const active =
        typeof parsed.activeGameProfileId === 'string'
          ? parsed.activeGameProfileId
          : null;
      return { activeGameProfileId: active, profileIds };
    } catch {
      return { activeGameProfileId: null, profileIds: [] };
    }
  }

  /**
   * Loads profile documents referenced by the index.
   * @param index Profile index.
   * @returns Successfully loaded profiles in index order.
   */
  private loadProfilesFromIndex(index: GameProfileIndexDocument): GameProfile[] {
    const profiles: GameProfile[] = [];
    index.profileIds.forEach((profileId) => {
      const profile = this.tryLoadProfile(profileId);
      if (profile) {
        profiles.push(profile);
      }
    });
    return profiles;
  }

  /**
   * Attempts to load one profile JSON document.
   * @param profileId Profile identifier.
   * @returns Profile or null when missing/invalid.
   */
  private tryLoadProfile(profileId: string): GameProfile | null {
    const raw = this.storage.getItem(this.buildProfileKey(profileId));
    if (!raw) {
      return null;
    }
    try {
      return parseGameProfileJson(raw);
    } catch {
      return null;
    }
  }

  /**
   * Writes the index document for the current profile list.
   * @param profiles Profiles being saved.
   * @param activeGameProfileId Active profile id.
   */
  private writeIndex(
    profiles: GameProfile[],
    activeGameProfileId: string | null
  ): void {
    const document: GameProfileIndexDocument = {
      activeGameProfileId,
      profileIds: profiles.map((profile) => profile.id)
    };
    this.storage.setItem(GAME_PROFILE_INDEX_KEY, JSON.stringify(document));
  }

  /**
   * Removes storage keys for profiles no longer in the list.
   * @param previousIds Prior index ids.
   * @param profiles Current profiles.
   */
  private removeOrphanedProfiles(
    previousIds: string[],
    profiles: GameProfile[]
  ): void {
    const keep = new Set(profiles.map((profile) => profile.id));
    previousIds.forEach((profileId) => {
      if (!keep.has(profileId)) {
        this.storage.removeItem(this.buildProfileKey(profileId));
      }
    });
  }

  /**
   * Creates and persists a default profile when storage is empty.
   * @returns Seeded profiles and active id.
   */
  private seedDefaultProfile(): {
    profiles: GameProfile[];
    activeGameProfileId: string | null;
  } {
    const profile = createDefaultGameProfile(createProfileId());
    this.saveAll([profile], profile.id);
    return { profiles: [profile], activeGameProfileId: profile.id };
  }

  /**
   * Picks a valid active id from the index or the first profile.
   * @param index Loaded index.
   * @param profiles Loaded profiles.
   * @returns Active profile id.
   */
  private resolveActiveId(
    index: GameProfileIndexDocument,
    profiles: GameProfile[]
  ): string | null {
    if (
      index.activeGameProfileId &&
      profiles.some((profile) => profile.id === index.activeGameProfileId)
    ) {
      return index.activeGameProfileId;
    }
    return profiles[0]?.id ?? null;
  }
}

/**
 * Creates a unique profile identifier.
 * @returns New profile id string.
 */
export function createProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `profile_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}
