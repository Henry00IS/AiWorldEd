import { DISPLAY_NAME_LENGTH_MAXIMUM } from '@/collaboration/shared/room_name_policy.js';
import { runtimeEnvironmentDebugIs, type RuntimeEnvironmentInput } from '@/updater/runtime_environment.js';

/**
 * Relay URL used by local debug sessions (the dev relay; see
 * {@link runtimeEnvironmentDetect}).
 */
export const CONFIG_COLLABORATION_URL_DEVELOPMENT = 'wss://aiworlded.00labs.net/wsdev';
/** Relay URL used by the published site and the desktop app (the live relay). */
export const CONFIG_COLLABORATION_URL_PRODUCTION = 'wss://aiworlded.00labs.net/ws';
/** Local storage key of the relay URL override. */
export const CONFIG_COLLABORATION_URL_KEY = 'aiworlded.collaboration.serverUrl';
/** Local storage key of the display name. */
export const CONFIG_COLLABORATION_NAME_KEY = 'aiworlded.collaboration.displayName';

/** Minimal storage surface (window.localStorage in the editor). */
export interface ConfigCollaborationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Returns the default relay URL for a build.
 *
 * @param development True for development builds.
 * @returns Relay URL.
 */
export function configCollaborationUrlDefault(development: boolean): string {
  return development ? CONFIG_COLLABORATION_URL_DEVELOPMENT : CONFIG_COLLABORATION_URL_PRODUCTION;
}

/**
 * Returns whether a value is a usable WebSocket URL.
 *
 * @param value Candidate URL.
 * @returns True for ws:// or wss:// URLs.
 */
export function configCollaborationUrlValid(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
}

/**
 * Returns the relay URL: a valid stored override, else the build default.
 *
 * @param storage Settings storage.
 * @param development True for development builds.
 * @returns Relay URL.
 */
export function configCollaborationUrlGet(storage: ConfigCollaborationStorage | null, development: boolean): string {
  const stored = storage?.getItem(CONFIG_COLLABORATION_URL_KEY) ?? '';
  return configCollaborationUrlValid(stored) ? stored : configCollaborationUrlDefault(development);
}

/**
 * Stores a relay URL override; an empty value restores the default.
 *
 * @param storage Settings storage.
 * @param value URL or empty string.
 * @returns True when stored or cleared.
 */
export function configCollaborationUrlSet(storage: ConfigCollaborationStorage, value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') {
    storage.removeItem(CONFIG_COLLABORATION_URL_KEY);
    return true;
  }
  if (!configCollaborationUrlValid(trimmed)) return false;
  storage.setItem(CONFIG_COLLABORATION_URL_KEY, trimmed);
  return true;
}

/**
 * Returns the stored display name, cut to the display name limit (names stored
 * by older versions may be longer).
 *
 * @param storage Settings storage.
 * @returns Name, or an empty string.
 */
export function configCollaborationNameGet(storage: ConfigCollaborationStorage | null): string {
  const stored = storage?.getItem(CONFIG_COLLABORATION_NAME_KEY) ?? '';
  return Array.from(stored.trim()).slice(0, DISPLAY_NAME_LENGTH_MAXIMUM).join('').trim();
}

/**
 * Stores the display name.
 *
 * @param storage Settings storage.
 * @param name Display name.
 */
export function configCollaborationNameSet(storage: ConfigCollaborationStorage, name: string): void {
  storage.setItem(CONFIG_COLLABORATION_NAME_KEY, name);
}

/**
 * Returns the browser storage when available.
 *
 * @returns Local storage, or null.
 */
export function configCollaborationStorage(): ConfigCollaborationStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Returns whether the dev relay is the default: only for a local debug session.
 * The published site and the desktop app (`views://`) use the live relay.
 *
 * @param input Page facts; defaults to the running page.
 * @returns True when {@link CONFIG_COLLABORATION_URL_DEVELOPMENT} is the
 *   default.
 */
export function configCollaborationDevelopmentDefault(input?: RuntimeEnvironmentInput): boolean {
  return runtimeEnvironmentDebugIs(input);
}
