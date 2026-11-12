import type { SceneJSON } from '@/io/scene/io_types.js';
import { projectPathStem } from '@/project/fs/project_path.js';

/** Scene key used while the scene was not opened from the project. */
export const PROJECT_AUTOSAVE_UNTITLED = 'untitled';

/** Format marker written into every saved level state. */
export const PROJECT_AUTOSAVE_FORMAT = 'aiworlded-autosave';

/** Contents of a saved level state (an autosave or a snapshot). */
export interface ProjectAutosaveDocument {
  format: typeof PROJECT_AUTOSAVE_FORMAT;
  version: 1;
  scene: string;
  sourcePath: string | null;
  savedAt: number;
  objectCount: number;
  data: SceneJSON;
}

/**
 * Turns the scene's project path into a flat, safe file name stem
 * ("maps/start.aiworld" and "maps/start.json" become "maps__start").
 *
 * @param sourcePath Scene path in the project, or null when untitled.
 * @returns Scene key.
 */
export function projectAutosaveKey(sourcePath: string | null): string {
  if (sourcePath === null) return PROJECT_AUTOSAVE_UNTITLED;
  const parts = sourcePath.split('/');
  parts[parts.length - 1] = projectPathStem(parts[parts.length - 1] ?? '');
  return projectAutosaveKeyClean(parts.join('__')) || PROJECT_AUTOSAVE_UNTITLED;
}

/**
 * Turns any text into a safe file name stem of at most 120 characters.
 *
 * @param text Text.
 * @returns File name stem; empty for empty text.
 */
export function projectAutosaveKeyClean(text: string): string {
  return text
    .replace(/[^A-Za-z0-9._ -]+/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 120);
}

/**
 * Parses and checks a saved level state.
 *
 * @param text File contents.
 * @returns Document, or null when the file is not a valid level state.
 */
export function projectAutosaveParse(text: string): ProjectAutosaveDocument | null {
  try {
    const value = JSON.parse(text) as Partial<ProjectAutosaveDocument> | null;
    if (!value || value.format !== PROJECT_AUTOSAVE_FORMAT || typeof value.savedAt !== 'number') return null;
    const data = value.data as Partial<SceneJSON> | undefined;
    if (!data || typeof data.version !== 'number' || !Array.isArray(data.objects)) return null;
    return value as ProjectAutosaveDocument;
  } catch {
    return null;
  }
}
