import { PROJECT_EDITOR_DIRECTORY, projectEditorFolderPrepare } from '@/project/fs/project_editor_folder.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_FILE_EXTENSION, solidScriptFileDecode, solidScriptFileEncode } from './solid_script_file.js';

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
 * Saves a script into the project under its name, replacing a script of the
 * same name.
 *
 * @param fileSystem Project folder.
 * @param document Script.
 * @returns File name written.
 */
export async function solidScriptProjectSave(
  fileSystem: ProjectFileSystem,
  document: SolidScriptDocument,
): Promise<string> {
  if (!fileSystem.writable) throw new Error('The project folder is read-only.');
  const fileName = solidScriptProjectFileName(document.name);
  await projectEditorFolderPrepare(fileSystem);
  const name = solidScriptProjectNameOf(fileName);
  await fileSystem.fileWrite(
    `${SOLID_SCRIPT_PROJECT_DIRECTORY}/${fileName}`,
    await solidScriptFileEncode({ ...document, name }),
  );
  return fileName;
}

/**
 * Loads a script saved in the scripts folder.
 *
 * @param fileSystem Project folder.
 * @param fileName File name inside the scripts folder.
 * @returns Script.
 */
export async function solidScriptProjectLoad(
  fileSystem: ProjectFileSystem,
  fileName: string,
): Promise<SolidScriptDocument> {
  return solidScriptProjectRead(fileSystem, `${SOLID_SCRIPT_PROJECT_DIRECTORY}/${fileName}`);
}

/**
 * Reads a script file anywhere in the project; a script without a name is named
 * after its file.
 *
 * @param fileSystem Project folder.
 * @param path Project path of the file.
 * @returns Script.
 */
export async function solidScriptProjectRead(
  fileSystem: ProjectFileSystem,
  path: string,
): Promise<SolidScriptDocument> {
  const document = await solidScriptFileDecode(await fileSystem.fileRead(path));
  return document.name ? document : { ...document, name: solidScriptProjectNameOf(path) };
}

/**
 * Reads a script file from the desktop; a script without a name is named after
 * its file.
 *
 * @param file File.
 * @returns Script.
 */
export async function solidScriptFileOpen(file: File): Promise<SolidScriptDocument> {
  const document = await solidScriptFileDecode(file);
  return document.name ? document : { ...document, name: solidScriptProjectNameOf(file.name) };
}

/**
 * Returns the script name a file name or path stands for.
 *
 * @param path File name or path.
 * @returns Name without folders and extension.
 */
export function solidScriptProjectNameOf(path: string): string {
  const fileName = path.split('/').pop() ?? path;
  return fileName.replace(new RegExp(`\\.${SOLID_SCRIPT_FILE_EXTENSION}$`, 'i'), '');
}
