import blenderProfileDocument from './defaults/game_profile_blender.json';
import godotProfileDocument from './defaults/game_profile_godot.json';
import unityProfileDocument from './defaults/game_profile_unity.json';
import unrealProfileDocument from './defaults/game_profile_unreal.json';
import { parseGameProfileJson } from './game_profile_json.js';
import { createDefaultGameProfile } from '@/settings/store/settings_defaults.js';
import type { GameProfile } from '@/settings/store/settings_types.js';

/** Version of the bundled game-profile set used for storage migration. */
export const BUNDLED_GAME_PROFILE_DEFAULTS_VERSION = 1;

const BUNDLED_PROFILE_DOCUMENTS: readonly unknown[] = Object.freeze([
  blenderProfileDocument,
  unityProfileDocument,
  godotProfileDocument,
  unrealProfileDocument,
]);

/**
 * Creates independent copies of all bundled game profiles.
 *
 * @returns Bundled profiles in display order.
 */
export function createBundledGameProfiles(): GameProfile[] {
  return BUNDLED_PROFILE_DOCUMENTS.map((document) => parseBundledProfileDocument(document));
}

/**
 * Creates the complete profile list used by a new installation or profile
 * reset.
 *
 * @param defaultProfileId Identifier for the fresh Default profile.
 * @returns Default profile followed by bundled profiles.
 */
export function createSeededGameProfiles(defaultProfileId: string): GameProfile[] {
  return [createDefaultGameProfile(defaultProfileId), ...createBundledGameProfiles()];
}

/**
 * Parses one bundled JSON document into a mutable profile object.
 *
 * @param document Bundled JSON module value.
 * @returns Parsed game profile.
 */
function parseBundledProfileDocument(document: unknown): GameProfile {
  return parseGameProfileJson(JSON.stringify(document));
}
