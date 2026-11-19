import { LocalSettingsStorage, type SettingsStorage } from '@/settings/storage/settings_storage.js';

/** How fast Debug steps through a script on its own. */
export type SolidScriptEditorDebugSpeed = 'Slow' | 'Normal' | 'Fast' | 'Fastest';

/** Storage key of the Debug speed. */
export const SOLID_SCRIPT_EDITOR_DEBUG_SPEED_KEY = 'aiworlded.solidScriptEditor.debugSpeed';

/** The speed Debug starts with: one step every 0.4 seconds. */
export const SOLID_SCRIPT_EDITOR_DEBUG_SPEED_DEFAULT: SolidScriptEditorDebugSpeed = 'Normal';

/** Each speed with the time between steps in ms and the words that explain it. */
export const SOLID_SCRIPT_EDITOR_DEBUG_SPEEDS: readonly (readonly [SolidScriptEditorDebugSpeed, number, string])[] = [
  ['Slow', 1000, 'Slow: one solid per second'],
  ['Normal', 400, 'Normal: about two solids per second'],
  ['Fast', 150, 'Fast: about seven solids per second'],
  ['Fastest', 40, 'Fastest: about 25 solids per second'],
];

/**
 * Returns the time between Debug steps of a speed.
 *
 * @param speed Speed.
 * @returns Milliseconds between steps.
 */
export function solidScriptEditorDebugSpeedMs(speed: SolidScriptEditorDebugSpeed): number {
  return (
    SOLID_SCRIPT_EDITOR_DEBUG_SPEEDS.find(([name]) => name === speed)?.[1] ??
    solidScriptEditorDebugSpeedMs(SOLID_SCRIPT_EDITOR_DEBUG_SPEED_DEFAULT)
  );
}

/**
 * Reads the Debug speed kept on this computer.
 *
 * @param storage Where it is kept.
 * @returns Speed; Normal when none or an unknown one is kept.
 */
export function solidScriptEditorDebugSpeedRead(
  storage: SettingsStorage = new LocalSettingsStorage(),
): SolidScriptEditorDebugSpeed {
  const stored = storage.getItem(SOLID_SCRIPT_EDITOR_DEBUG_SPEED_KEY);
  return (
    SOLID_SCRIPT_EDITOR_DEBUG_SPEEDS.find(([name]) => name === stored)?.[0] ?? SOLID_SCRIPT_EDITOR_DEBUG_SPEED_DEFAULT
  );
}

/**
 * Keeps the Debug speed on this computer.
 *
 * @param speed Speed.
 * @param storage Where it is kept.
 */
export function solidScriptEditorDebugSpeedWrite(
  speed: SolidScriptEditorDebugSpeed,
  storage: SettingsStorage = new LocalSettingsStorage(),
): void {
  storage.setItem(SOLID_SCRIPT_EDITOR_DEBUG_SPEED_KEY, speed);
}
