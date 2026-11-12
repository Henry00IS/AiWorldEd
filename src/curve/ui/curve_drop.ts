import { curveFileNameReadable } from '@/curve/model/curve_file.js';
import { curveFileFromBlob, curveFileFromProject, type CurveFileLoadResult } from './curve_file_io.js';
import { PANEL_PROJECT_PATH_DRAG_TYPE } from '@/project/ui/panel_project_drag.js';
import { CURVE_UI_COLORS } from './curve_ui_style.js';
import { curveDragGet, curveDragHas } from './curve_drag.js';
import { curveFileRead } from '@/curve/model/curve_file.js';

/** Why a drop was refused. */
const CURVE_DROP_ONLY = 'Only .aicurve files fit here.';

/**
 * Returns whether a drag carries something a curve field can take: a project
 * file path, files from the operating system, or a dragged curve.
 *
 * @param transfer Drag data.
 * @returns True when the drop is worth offering.
 */
export function curveDropAccepts(transfer: DataTransfer | null): boolean {
  const types = transfer ? [...transfer.types] : [];
  return types.includes(PANEL_PROJECT_PATH_DRAG_TYPE) || types.includes('Files') || curveDragHas(transfer);
}

/**
 * Reads the curve a drop carries.
 *
 * @param transfer Drop data.
 * @returns Curve or error, or null when the drop holds no curve file.
 */
export async function curveDropRead(transfer: DataTransfer): Promise<CurveFileLoadResult | null> {
  const dragged = curveDragGet(transfer);
  if (dragged) return curveFileRead(dragged.text);
  const path = transfer.getData(PANEL_PROJECT_PATH_DRAG_TYPE);
  if (path) return curveFileNameReadable(path) ? curveFileFromProject(path) : { error: CURVE_DROP_ONLY };
  const file = [...(transfer.files ?? [])][0];
  if (!file) return null;
  return curveFileNameReadable(file.name) ? curveFileFromBlob(file) : { error: CURVE_DROP_ONLY };
}

/**
 * Makes an element accept dropped curve files, outlining it while a drag is
 * over it.
 *
 * @param element Drop target.
 * @param onResult Receives the loaded curve or an error.
 */
export function curveDropBind(element: HTMLElement, onResult: (result: CurveFileLoadResult) => void): void {
  let depth = 0;
  const highlight = (on: boolean) => (element.style.outline = on ? `2px dashed ${CURVE_UI_COLORS.drop}` : '');
  element.addEventListener('dragenter', (event) => {
    if (!curveDropAccepts(event.dataTransfer)) return;
    event.preventDefault();
    depth += 1;
    highlight(true);
  });
  element.addEventListener('dragover', curveDropOver);
  element.addEventListener('dragleave', () => highlight((depth = Math.max(0, depth - 1)) > 0));
  element.addEventListener('drop', (event) => {
    depth = 0;
    highlight(false);
    curveDropHandle(event, onResult);
  });
}

/**
 * Keeps a curve drag droppable while it moves over the target.
 *
 * @param event Drag event.
 */
function curveDropOver(event: DragEvent): void {
  if (!curveDropAccepts(event.dataTransfer)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

/**
 * Takes a drop and loads the curve it carries.
 *
 * @param event Drop event.
 * @param onResult Receives the loaded curve or an error.
 */
function curveDropHandle(event: DragEvent, onResult: (result: CurveFileLoadResult) => void): void {
  if (!event.dataTransfer || !curveDropAccepts(event.dataTransfer)) return;
  event.preventDefault();
  event.stopPropagation();
  void curveDropRead(event.dataTransfer).then((result) => result && onResult(result));
}
