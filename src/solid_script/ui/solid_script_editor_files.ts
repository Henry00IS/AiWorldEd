import { downloadBlob, pickFileWithInput } from '@/io/dialog/manager_file_dialog.js';
import { projectFolderCurrent } from '@/project/fs/project_folder_current.js';
import { showMessageBox } from '@/ui/dialog/dialog_message_box.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  SOLID_SCRIPT_FILE_EXTENSION,
  solidScriptFileDecode,
  solidScriptFileEncode,
  type SolidScriptFileContents,
} from '@/solid_script/file/solid_script_file.js';
import {
  solidScriptProjectFileName,
  solidScriptProjectList,
  solidScriptProjectLoad,
  solidScriptProjectSave,
} from '@/solid_script/file/solid_script_file_project.js';
import {
  solidScriptFileDisplayName,
  solidScriptFileLoadAsk,
  solidScriptFileSaveAsk,
} from './solid_script_file_dialog.js';

/** Result of saving or loading, for the status bar. */
export interface SolidScriptEditorFileResult {
  /** Script name afterwards. */
  name: string;
  /** Status text. */
  message: string;
}

/**
 * Lists the scripts of the open project.
 *
 * @returns File names, or null without a project folder.
 */
async function solidScriptEditorFilesList(): Promise<string[] | null> {
  const folder = projectFolderCurrent();
  if (!folder) return null;
  try {
    return await solidScriptProjectList(folder);
  } catch {
    return [];
  }
}

/**
 * Asks where to save a script and saves it, confirming before replacing one.
 *
 * @param host Element dialogs mount in.
 * @param document Script.
 * @param name Suggested name.
 * @returns Result, or null when cancelled.
 */
export async function solidScriptEditorSave(
  host: HTMLElement,
  document: SolidScriptDocument,
  name: string,
): Promise<SolidScriptEditorFileResult | null> {
  const files = await solidScriptEditorFilesList();
  const choice = await solidScriptFileSaveAsk(host, files, name);
  if (choice?.kind === 'download') {
    const fileName = solidScriptProjectFileName(choice.name || name || 'Script');
    downloadBlob(await solidScriptFileEncode(document, solidScriptFileDisplayName(fileName)), fileName);
    return { name: solidScriptFileDisplayName(fileName), message: `Downloaded ${fileName}` };
  }
  const folder = projectFolderCurrent();
  if (choice?.kind !== 'project' || !folder) return null;
  const fileName = solidScriptProjectFileName(choice.name);
  if (files?.includes(fileName) && !(await solidScriptEditorReplaceAsk(host, fileName))) return null;
  await solidScriptProjectSave(folder, choice.name, document);
  return { name: solidScriptFileDisplayName(fileName), message: `Saved AiWorldEd/Scripts/${fileName}` };
}

/**
 * Asks before replacing a saved script.
 *
 * @param host Element dialogs mount in.
 * @param fileName File name.
 * @returns True to replace.
 */
function solidScriptEditorReplaceAsk(host: HTMLElement, fileName: string): Promise<boolean> {
  return showMessageBox({
    host,
    title: 'Replace Script',
    message: `${fileName} already exists. Replace it?`,
    confirmLabel: 'Replace',
  });
}

/**
 * Asks which script to load and reads it.
 *
 * @param host Element dialogs mount in.
 * @returns Script, or null when cancelled.
 */
export async function solidScriptEditorLoad(host: HTMLElement): Promise<SolidScriptFileContents | null> {
  const choice = await solidScriptFileLoadAsk(host, await solidScriptEditorFilesList());
  const folder = projectFolderCurrent();
  if (choice?.kind === 'project' && folder) return solidScriptProjectLoad(folder, choice.name);
  if (choice?.kind !== 'disk') return null;
  const file = await pickFileWithInput(`.${SOLID_SCRIPT_FILE_EXTENSION}`);
  if (!file) return null;
  const contents = await solidScriptFileDecode(file);
  return { ...contents, name: contents.name || solidScriptFileDisplayName(file.name) };
}
