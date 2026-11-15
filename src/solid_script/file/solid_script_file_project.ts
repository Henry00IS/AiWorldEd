import { PROJECT_EDITOR_DIRECTORY, projectEditorFolderPrepare } from '@/project/fs/project_editor_folder.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  SOLID_SCRIPT_FILE_EXTENSION,
  solidScriptFileDecode,
  solidScriptFileEncode,
  type SolidScriptFileContents,
} from './solid_script_file.js';

/** Folder of saved scripts inside a project. */
export const SOLID_SCRIPT_PROJECT_DIRECTORY = `${PROJECT_EDITOR_DIRECTORY}/Scripts`;

/**
 * Returns the file name a script is saved as.
 *
 * @param name Script name, with or without the extension.
 * @returns File name with the extension.
 */
export function solidScriptProjectFileName(name: string): string {
  const base = name
    .trim()
    .replace(new RegExp(`\\.${SOLID_SCRIPT_FILE_EXTENSION}$`, 'i'), '')
    .replace(/\s*\/\s*/g, ' - ')
    .replace(/[\\:*?"<>|]/g, '-')
    .replace(/^\.+/, '')
    .trim();
  if (!base || base === '-') throw new Error('Give the script a name.');
  return `${base}.${SOLID_SCRIPT_FILE_EXTENSION}`;
}

/**
 * Lists the saved scripts of a project.
 *
 * @param fileSystem Project folder.
 * @returns File names, sorted.
 */
export async function solidScriptProjectList(fileSystem: ProjectFileSystem): Promise<string[]> {
  const entries = await fileSystem.directoryList(SOLID_SCRIPT_PROJECT_DIRECTORY, () => false);
  return entries
    .filter((entry) => entry.kind === 'file' && entry.name.toLowerCase().endsWith(`.${SOLID_SCRIPT_FILE_EXTENSION}`))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Saves a script into the project, replacing a script of the same name.
 *
 * @param fileSystem Project folder.
 * @param name Script name.
 * @param document Script.
 * @returns File name written.
 */
export async function solidScriptProjectSave(
  fileSystem: ProjectFileSystem,
  name: string,
  document: SolidScriptDocument,
): Promise<string> {
  if (!fileSystem.writable) throw new Error('The project folder is read-only.');
  const fileName = solidScriptProjectFileName(name);
  await projectEditorFolderPrepare(fileSystem);
  const label = fileName.slice(0, -(SOLID_SCRIPT_FILE_EXTENSION.length + 1));
  await fileSystem.fileWrite(
    `${SOLID_SCRIPT_PROJECT_DIRECTORY}/${fileName}`,
    await solidScriptFileEncode(document, label),
  );
  return fileName;
}

/**
 * Loads a saved script.
 *
 * @param fileSystem Project folder.
 * @param fileName File name inside the scripts folder.
 * @returns Script and its stored name.
 */
export async function solidScriptProjectLoad(
  fileSystem: ProjectFileSystem,
  fileName: string,
): Promise<SolidScriptFileContents> {
  return solidScriptFileDecode(await fileSystem.fileRead(`${SOLID_SCRIPT_PROJECT_DIRECTORY}/${fileName}`));
}
