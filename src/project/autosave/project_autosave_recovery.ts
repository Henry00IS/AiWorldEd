import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectPathJoin } from '@/project/fs/project_path.js';
import {
  PROJECT_AUTOSAVE_DIRECTORY,
  PROJECT_AUTOSAVE_SUFFIX,
  projectAutosaveKey,
  projectAutosaveParse,
  projectAutosavePath,
  type ProjectAutosaveDocument,
} from './project_autosave_files.js';

/**
 * Reads the autosave of one scene.
 *
 * @param fileSystem Project file system.
 * @param sourcePath Scene path in the project, or null when untitled.
 * @returns Autosave, or null when none or invalid.
 */
export async function projectAutosaveRead(
  fileSystem: ProjectFileSystem,
  sourcePath: string | null,
): Promise<ProjectAutosaveDocument | null> {
  try {
    const file = await fileSystem.fileRead(projectAutosavePath(projectAutosaveKey(sourcePath)));
    return projectAutosaveParse(await file.text());
  } catch {
    return null;
  }
}

/**
 * Finds the most recently written autosave of any scene.
 *
 * @param fileSystem Project file system.
 * @returns Newest valid autosave, or null.
 */
export async function projectAutosaveNewest(fileSystem: ProjectFileSystem): Promise<ProjectAutosaveDocument | null> {
  const entries = await fileSystem.directoryList(PROJECT_AUTOSAVE_DIRECTORY, () => true).catch(() => []);
  const candidates = entries
    .filter((entry) => entry.kind === 'file' && entry.name.endsWith(PROJECT_AUTOSAVE_SUFFIX))
    .sort((left, right) => (right.lastModified ?? 0) - (left.lastModified ?? 0));
  for (const entry of candidates) {
    try {
      const file = await fileSystem.fileRead(projectPathJoin(PROJECT_AUTOSAVE_DIRECTORY, entry.name));
      const document = projectAutosaveParse(await file.text());
      if (document !== null) return document;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Tells whether an autosave holds work newer than the scene file on disk.
 *
 * @param document Autosave.
 * @param sceneModified Scene file modification time, or null when untitled.
 * @returns True when recovery should be offered.
 */
export function projectAutosaveNewer(document: ProjectAutosaveDocument, sceneModified: number | null): boolean {
  return sceneModified === null || document.savedAt > sceneModified + 1000;
}
