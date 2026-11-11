import type { ProjectFileSystem } from './project_file_system.js';

/**
 * The editor's folder inside a project. Everything worth committing (saved
 * curves) sits in it directly; machine-local state sits in ".Local", which an
 * automatic .gitignore keeps out of version control:
 *
 *     AiWorldEd/
 *       .gitignore          ignores .Local/
 *       Curves/
 *       .Local/
 *         History/          Level History of the levels and rooms
 *           index.json      every save: kind, star, time, level or room
 *           <day>/          <save>.json state and <save>.webp thumbnail
 *         TextureCache/     embedded textures of saved states
 */
export const PROJECT_EDITOR_DIRECTORY = 'AiWorldEd';

/** Curves saved from the curve editor. */
export const PROJECT_EDITOR_CURVES_DIRECTORY = `${PROJECT_EDITOR_DIRECTORY}/Curves`;

/** Name of the machine-local folder (git-ignored). */
export const PROJECT_EDITOR_LOCAL_NAME = '.Local';

/** Machine-local editor state, never committed. */
export const PROJECT_EDITOR_LOCAL_DIRECTORY = `${PROJECT_EDITOR_DIRECTORY}/${PROJECT_EDITOR_LOCAL_NAME}`;

/** Level History: the saves of the project's levels and rooms. */
export const PROJECT_EDITOR_HISTORY_DIRECTORY = `${PROJECT_EDITOR_LOCAL_DIRECTORY}/History`;

/** Embedded textures that saved states use. */
export const PROJECT_EDITOR_TEXTURE_CACHE_DIRECTORY = `${PROJECT_EDITOR_LOCAL_DIRECTORY}/TextureCache`;

/** The editor folder's own ignore file. */
export const PROJECT_EDITOR_GITIGNORE = `${PROJECT_EDITOR_DIRECTORY}/.gitignore`;

/** Line that keeps the machine-local folder out of git. */
export const PROJECT_EDITOR_GITIGNORE_LINE = `${PROJECT_EDITOR_LOCAL_NAME}/`;

/** Folders whose .gitignore was checked this session. */
const projectEditorFolderPrepared = new WeakSet<ProjectFileSystem>();

/**
 * Makes sure the editor folder ignores ".Local/" before anything is written
 * into it: creates AiWorldEd/.gitignore when missing and appends the line to an
 * existing file that lacks it (never rewriting the user's other lines). Checked
 * once per open folder; failures are left to the write that follows.
 *
 * @param fileSystem Project folder.
 */
export async function projectEditorFolderPrepare(fileSystem: ProjectFileSystem): Promise<void> {
  if (projectEditorFolderPrepared.has(fileSystem) || !fileSystem.writable) return;
  projectEditorFolderPrepared.add(fileSystem);
  try {
    const existing = await projectEditorGitignoreRead(fileSystem);
    const next = projectEditorGitignoreMerge(existing);
    if (next !== existing) await fileSystem.fileWrite(PROJECT_EDITOR_GITIGNORE, next);
  } catch {
    projectEditorFolderPrepared.delete(fileSystem);
  }
}

/**
 * Returns the .gitignore text with the ".Local/" line present.
 *
 * @param existing Current contents, or null when there is no file.
 * @returns Contents to keep (the same string when nothing is missing).
 */
export function projectEditorGitignoreMerge(existing: string | null): string {
  if (existing === null) return `${PROJECT_EDITOR_GITIGNORE_LINE}\n`;
  const ignored = existing.split(/\r?\n/).some((line) => projectEditorGitignoreCovers(line.trim()));
  if (ignored) return existing;
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  return `${existing}${separator}${PROJECT_EDITOR_GITIGNORE_LINE}\n`;
}

/**
 * Tells whether one .gitignore line already ignores ".Local".
 *
 * @param line Trimmed line.
 * @returns True for ".Local", ".Local/", "/.Local" and "/.Local/".
 */
function projectEditorGitignoreCovers(line: string): boolean {
  return line.replace(/^\//, '').replace(/\/$/, '') === PROJECT_EDITOR_LOCAL_NAME;
}

/**
 * Reads the editor folder's .gitignore.
 *
 * @param fileSystem Project folder.
 * @returns Contents, or null when the file does not exist.
 */
async function projectEditorGitignoreRead(fileSystem: ProjectFileSystem): Promise<string | null> {
  const entries = await fileSystem.directoryList(PROJECT_EDITOR_DIRECTORY, () => false);
  if (!entries.some((entry) => entry.kind === 'file' && entry.name === '.gitignore')) return null;
  return (await fileSystem.fileRead(PROJECT_EDITOR_GITIGNORE)).text();
}
