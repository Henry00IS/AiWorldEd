import { curveDragHas } from '@/curve/ui/curve_drag.js';
import { curveDropRead } from '@/curve/ui/curve_drop.js';
import { projectFileRead } from '@/project/project_file_access.js';
import { PANEL_PROJECT_PATH_DRAG_TYPE } from '@/project/ui/panel_project_drag.js';
import {
  solidScriptResourceCurve,
  solidScriptResourceNameFree,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';
import {
  solidScriptResourceFromFile,
  type SolidScriptResourceFileRead,
} from '@/solid_script/document/solid_script_resource_file.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { TEXTURE_BROWSER_DRAG_TYPE, textureBrowserDragHas } from '@/texture/ui/browser/texture_browser_drag.js';

/** What a drop onto the Resources tab carries, taken before the drop ends. */
interface SolidScriptResourceDropped {
  /** Curve dragged from a generator or the chat, still to be read. */
  curve: Promise<Awaited<ReturnType<typeof curveDropRead>>> | null;
  /** Files: dropped from the desktop, or the project or texture browser's file. */
  files: Promise<(File | null)[]>;
}

/**
 * Tells whether a drag carries something the Resources tab takes: a file from
 * the project, the texture browser or the desktop, or a curve.
 *
 * @param transfer Drag data.
 * @returns True when it does.
 */
export function solidScriptResourceDropAccepts(transfer: DataTransfer | null): boolean {
  const types = transfer ? [...transfer.types] : [];
  return (
    types.includes(PANEL_PROJECT_PATH_DRAG_TYPE) ||
    types.includes('Files') ||
    textureBrowserDragHas(transfer) ||
    curveDragHas(transfer)
  );
}

/**
 * Makes resources from what was dropped, each named freely after its file.
 *
 * @param transfer Drop data.
 * @param taken Resources the script already has.
 * @returns Resources, or problems, in drop order.
 */
export async function solidScriptResourceDropRead(
  transfer: DataTransfer,
  taken: readonly SolidScriptResource[],
): Promise<SolidScriptResourceFileRead[]> {
  const dropped = solidScriptResourceDropTake(transfer);
  if (dropped.curve) {
    const read = await dropped.curve;
    if (!read) return [];
    return [
      'error' in read
        ? read
        : solidScriptResourceCurve(solidScriptResourceNameFree(taken, read.name || 'Curve'), read.curve),
    ];
  }
  const made: SolidScriptResourceFileRead[] = [];
  for (const file of await dropped.files) {
    if (!file) continue;
    const resources = made.filter((entry): entry is SolidScriptResource => !('error' in entry));
    made.push(await solidScriptResourceFromFile(file, [...taken, ...resources]));
  }
  return made;
}

/**
 * Takes what a drop carries while its data can still be read.
 *
 * @param transfer Drop data.
 * @returns What it carries.
 */
function solidScriptResourceDropTake(transfer: DataTransfer): SolidScriptResourceDropped {
  if (curveDragHas(transfer)) return { curve: curveDropRead(transfer), files: Promise.resolve([]) };
  const texture = transfer.getData(TEXTURE_BROWSER_DRAG_TYPE);
  if (texture !== '') {
    const entry = getTextureMapCache().getLibrary()?.getEntryById(texture) ?? null;
    return { curve: null, files: Promise.resolve([entry?.sourceFile ?? null]) };
  }
  const path = transfer.getData(PANEL_PROJECT_PATH_DRAG_TYPE);
  if (path !== '') return { curve: null, files: Promise.all([projectFileRead(path)]) };
  return { curve: null, files: Promise.resolve([...(transfer.files ?? [])]) };
}
