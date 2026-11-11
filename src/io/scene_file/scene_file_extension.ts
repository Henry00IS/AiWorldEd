/** Extension of level files, without the dot. */
export const SCENE_FILE_EXTENSION = 'aiworld';

/** Extension older levels were saved with; they still open unchanged. */
export const SCENE_FILE_LEGACY_EXTENSION = 'json';

/** Picker and file input filter for opening levels (new and legacy). */
export const SCENE_FILE_OPEN_ACCEPT = `.${SCENE_FILE_EXTENSION},.${SCENE_FILE_LEGACY_EXTENSION}`;

/** Description shown in file pickers. */
export const SCENE_FILE_DESCRIPTION = 'AiWorldEd Level';

/**
 * Tells whether a file name uses the legacy level extension.
 *
 * @param name File name or path.
 * @returns True for .json.
 */
export function sceneFileNameLegacy(name: string): boolean {
  return name.toLowerCase().endsWith(`.${SCENE_FILE_LEGACY_EXTENSION}`);
}

/**
 * Tells whether a file name uses the level extension.
 *
 * @param name File name or path.
 * @returns True for .aiworld.
 */
export function sceneFileNameIs(name: string): boolean {
  return name.toLowerCase().endsWith(`.${SCENE_FILE_EXTENSION}`);
}

/**
 * Gives a file name the level extension, replacing a legacy .json one, for new
 * saves.
 *
 * @param name File name.
 * @returns Name ending in .aiworld.
 */
export function sceneFileNameWithExtension(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(`.${SCENE_FILE_EXTENSION}`)) return name;
  const stem = sceneFileNameLegacy(name) ? name.slice(0, -(SCENE_FILE_LEGACY_EXTENSION.length + 1)) : name;
  return `${stem || 'scene'}.${SCENE_FILE_EXTENSION}`;
}
