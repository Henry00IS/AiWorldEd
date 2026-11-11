import packageMetadata from '../package.json';

/** Display name shown in the desktop window chrome and release messaging. */
export const APPLICATION_DISPLAY_NAME = 'AI World Editor';

/** Version string embedded in package.json and desktop release builds. */
export const APPLICATION_VERSION = packageMetadata.version;

/** Inputs used to build the editor window title. */
export interface WindowTitleInput {
  /** Active save file name, with extension; ignored when empty. */
  fileName?: string | null;
  /** Joined room name; takes precedence over the file name when set. */
  roomName?: string | null;
  /** When true, the installed version is appended (desktop builds only). */
  includeVersion?: boolean;
  /** Installed application version; defaults to {@link APPLICATION_VERSION}. */
  version?: string;
}

/**
 * Builds the editor window title.
 *
 * Browser builds use "AI World Editor", or "<name> - AI World Editor" when a
 * file or room is open. Desktop builds append the installed version.
 *
 * @param input File name, room name, and whether to include the version.
 * @returns Title such as "start.aiworld - AI World Editor" or, on desktop,
 *   "Night Shift - AI World Editor 1.0.42".
 */
export function buildWindowTitle(input: WindowTitleInput = {}): string {
  const roomName = windowTitlePart(input.roomName);
  const fileName = windowTitlePart(input.fileName);
  const head = roomName ?? fileName;
  const base = head === null ? APPLICATION_DISPLAY_NAME : `${head} - ${APPLICATION_DISPLAY_NAME}`;
  if (input.includeVersion !== true) return base;
  const version = windowTitlePart(input.version) ?? windowTitlePart(APPLICATION_VERSION);
  return version === null ? base : `${base} ${version}`;
}

/**
 * Builds the desktop-only window title including the installed version.
 *
 * @param version Installed application version from package.json or the desktop
 *   shell.
 * @returns Title such as "AI World Editor 1.0.42".
 */
export function buildDesktopWindowTitle(version: string = APPLICATION_VERSION): string {
  return buildWindowTitle({ includeVersion: true, version });
}

/**
 * Returns a trimmed title part, or null when it is missing or blank.
 *
 * @param value Raw title part.
 * @returns Trimmed text, or null.
 */
function windowTitlePart(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}
