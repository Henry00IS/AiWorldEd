import { projectFolderCurrent } from '@/project/fs/project_folder_current.js';
import { PANEL_PROJECT_PATH_DRAG_TYPE } from '@/project/ui/panel_project_drag.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_FILE_EXTENSION } from '@/solid_script/file/solid_script_file.js';
import { solidScriptFileOpen, solidScriptProjectRead } from '@/solid_script/file/solid_script_file_project.js';

/** A script read from a drop, or why none was. */
export type SolidScriptFileDropResult = { document: SolidScriptDocument } | { error: string };

/** Message for drops of other files. */
const SOLID_SCRIPT_FILE_DROP_ONLY = `Only .${SOLID_SCRIPT_FILE_EXTENSION} files fit here.`;

/**
 * Returns whether a drag may carry a script file: a project browser file or a
 * file from the desktop.
 *
 * @param transfer Drag data.
 * @returns True when the drop is worth trying.
 */
export function solidScriptFileDropAccepts(transfer: DataTransfer | null): boolean {
  const types = transfer ? [...transfer.types] : [];
  return types.includes(PANEL_PROJECT_PATH_DRAG_TYPE) || types.includes('Files');
}

/**
 * Returns whether a file name is a script file.
 *
 * @param name File name or path.
 * @returns True for .aiscript files.
 */
export function solidScriptFileNameIs(name: string): boolean {
  return name.toLowerCase().endsWith(`.${SOLID_SCRIPT_FILE_EXTENSION}`);
}

/**
 * Reads the script a drop carries.
 *
 * @param transfer Drag data.
 * @returns Script or error, or null when the drop carried nothing.
 */
export async function solidScriptFileDropRead(transfer: DataTransfer): Promise<SolidScriptFileDropResult | null> {
  const path = transfer.getData(PANEL_PROJECT_PATH_DRAG_TYPE);
  const file = [...(transfer.files ?? [])][0];
  if (!path && !file) return null;
  const name = path || file?.name || '';
  if (!solidScriptFileNameIs(name)) return { error: SOLID_SCRIPT_FILE_DROP_ONLY };
  try {
    return { document: await solidScriptFileDropDocument(path, file) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : `Could not read ${name}.` };
  }
}

/**
 * Reads a dropped project file or desktop file.
 *
 * @param path Project path, or empty for a desktop file.
 * @param file Desktop file.
 * @returns Script.
 */
async function solidScriptFileDropDocument(path: string, file: File | undefined): Promise<SolidScriptDocument> {
  if (path) {
    const fileSystem = projectFolderCurrent();
    if (!fileSystem) throw new Error('Open the project folder to use its scripts.');
    return solidScriptProjectRead(fileSystem, path);
  }
  if (!file) throw new Error('Nothing was dropped.');
  return solidScriptFileOpen(file);
}

/**
 * Outlines a drop target while a drag it takes is over it, the same way for
 * every drop target of the script editor.
 *
 * @param element Drop target.
 * @param on True shows the outline, false hides it.
 * @param outline Outline colour.
 */
export function solidScriptDropOutline(element: HTMLElement, on: boolean, outline: string): void {
  element.style.outline = on ? `2px dashed ${outline}` : '';
}

/**
 * Lets an element take dropped script files, outlining it while a drag that may
 * carry one is over it.
 *
 * @param element Drop target.
 * @param outline Outline colour while hovered.
 * @param onResult Receives the dropped script or the reason there is none.
 */
export function solidScriptFileDropBind(
  element: HTMLElement,
  outline: string,
  onResult: (result: SolidScriptFileDropResult) => void,
): void {
  let depth = 0;
  const highlight = (on: boolean): void => solidScriptDropOutline(element, on, outline);
  element.addEventListener('dragenter', (event) => {
    if (solidScriptFileDropOver(event)) highlight((depth += 1) > 0);
  });
  element.addEventListener('dragover', solidScriptFileDropOver);
  element.addEventListener('dragleave', () => highlight((depth = Math.max(0, depth - 1)) > 0));
  element.addEventListener('drop', (event) => {
    depth = 0;
    highlight(false);
    if (!solidScriptFileDropOver(event) || !event.dataTransfer) return;
    event.stopPropagation();
    void solidScriptFileDropRead(event.dataTransfer).then((result) => result && onResult(result));
  });
}

/**
 * Accepts a drag that may carry a script file.
 *
 * @param event Drag event.
 * @returns True when the drag is accepted.
 */
function solidScriptFileDropOver(event: DragEvent): boolean {
  if (!solidScriptFileDropAccepts(event.dataTransfer)) return false;
  event.preventDefault();
  if (event.dataTransfer && event.type === 'dragover') event.dataTransfer.dropEffect = 'copy';
  return true;
}
