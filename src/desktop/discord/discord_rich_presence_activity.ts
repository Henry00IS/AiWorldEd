import { APPLICATION_DISPLAY_NAME } from '@/application_identity.js';
import { DISCORD_RICH_PRESENCE_LARGE_IMAGE_KEY } from './discord_rich_presence_constants.js';

/** Editor state used to build a Discord Rich Presence activity. */
export interface DiscordRichPresenceEditorState {
  enabled: boolean;
  hideProjectName: boolean;
  projectName: string | null;
  levelName: string | null;
  brushCount: number;
}

/** Discord SET_ACTIVITY body sent to the local IPC socket. */
export interface DiscordActivity {
  details: string;
  state: string;
  timestamps: { start: number };
  assets: { large_image: string; large_text: string };
}

/**
 * Builds a Discord activity from editor state, or null when presence is off.
 *
 * @param state Current editor presence state.
 * @param startTimestamp Session start time in milliseconds since the Unix
 *   epoch.
 * @returns Activity, or null when presence is disabled.
 */
export function discordRichPresenceActivityBuild(
  state: DiscordRichPresenceEditorState,
  startTimestamp: number,
): DiscordActivity | null {
  if (!state.enabled) return null;
  return {
    details: discordRichPresenceDetails(state),
    state: discordRichPresenceStateText(state.brushCount),
    timestamps: { start: startTimestamp },
    assets: {
      large_image: DISCORD_RICH_PRESENCE_LARGE_IMAGE_KEY,
      large_text: APPLICATION_DISPLAY_NAME,
    },
  };
}

/**
 * Returns the details line for an activity.
 *
 * @param state Current editor presence state.
 * @returns Project or level name, or the application name when hidden.
 */
export function discordRichPresenceDetails(state: DiscordRichPresenceEditorState): string {
  if (state.hideProjectName) return APPLICATION_DISPLAY_NAME;
  return discordRichPresenceLevelName(state.levelName) ?? discordRichPresenceTrimmed(state.projectName) ?? 'Untitled';
}

/**
 * Returns the state line for a brush count.
 *
 * @param brushCount Number of brushes in the open scene.
 * @returns Status text.
 */
export function discordRichPresenceStateText(brushCount: number): string {
  if (brushCount <= 0) return 'Editing';
  if (brushCount === 1) return 'Editing 1 Brush';
  return `Editing ${brushCount} Brushes`;
}

/**
 * Returns a display name from a level file name, without its last extension.
 *
 * @param levelName File name or path, or null when untitled.
 * @returns Display name, or null when missing or blank.
 */
export function discordRichPresenceLevelName(levelName: string | null | undefined): string | null {
  const base = discordRichPresenceFileName(levelName);
  if (base === null) return null;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return base;
  return discordRichPresenceTrimmed(base.slice(0, dot));
}

/**
 * Returns the last path segment of a file name or path.
 *
 * @param pathOrName File name or path.
 * @returns File name, or null when missing or blank.
 */
export function discordRichPresenceFileName(pathOrName: string | null | undefined): string | null {
  const raw = discordRichPresenceTrimmed(pathOrName);
  if (raw === null) return null;
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? raw;
  return discordRichPresenceTrimmed(base);
}

/**
 * Returns trimmed text, or null when the value is missing or blank.
 *
 * @param value Raw text.
 * @returns Trimmed text, or null.
 */
export function discordRichPresenceTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}
