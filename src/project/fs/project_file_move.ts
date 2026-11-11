import type { ProjectFileSystem } from './project_file_system.js';

/**
 * Moves a project file by writing the copy before removing the original, so a
 * failure part way leaves at least one of them.
 *
 * @param fileSystem Project folder.
 * @param from Current project-relative path.
 * @param to New project-relative path.
 */
export async function projectFileMove(fileSystem: ProjectFileSystem, from: string, to: string): Promise<void> {
  if (from === to) return;
  const file = await fileSystem.fileRead(from);
  await fileSystem.fileWrite(to, file);
  await fileSystem.fileRemove(from);
}
