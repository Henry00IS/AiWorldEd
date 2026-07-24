import { createDefaultCoordinateSpace } from './coordinate_space_presets.js';
import type { GameProfile, ViewSettings } from './settings_types.js';

/** Default game profile display name. */
export const DEFAULT_GAME_PROFILE_NAME = 'Default';

/**
 * Creates a fresh default game profile with metric meters and Godot axes.
 * @param id Stable unique identifier for the profile.
 * @param name Optional display name.
 * @returns New game profile object.
 */
export function createDefaultGameProfile(
  id: string,
  name: string = DEFAULT_GAME_PROFILE_NAME
): GameProfile {
  return {
    id,
    name,
    unitSystem: 'metric',
    metricUnit: 'meter',
    imperialUnit: 'foot',
    coordinateSpace: createDefaultCoordinateSpace()
  };
}

/**
 * Returns default View tab settings.
 * @returns Fresh view settings snapshot.
 */
export function createDefaultViewSettings(): ViewSettings {
  return {
    theme: 'dark',
    brightness: 100,
    materialBrowserIconSizePercent: 100,
    rendererFontSize: 13,
    viewportPaneCount: 4
  };
}
