import { curveFileNameOf, curveFileRead, curveFileWrite, CURVE_FILE_OPEN_ACCEPT } from '@/curve/model/curve_file.js';
import type { Curve } from '@/curve/model/curve_model.js';
import {
  curveLibraryPathRead,
  curveLibrarySourceLabel,
  type CurveLibrarySource,
} from '@/curve/library/curve_library.js';
import { curveLibrarySave, type CurveLibraryConfirm } from '@/curve/library/curve_library_actions.js';
import { curveProjectAccess } from './curve_project_access.js';

/** Name a curve gets when none was typed. */
export const CURVE_FILE_DEFAULT_NAME = 'Profile';

/** Result of loading a curve: the curve, or a message why not. */
export type CurveFileLoadResult = { curve: Curve; name: string } | { error: string };

/**
 * Saves a curve: into a curve location (asking Yes/No before replacing a curve
 * of the same name), or as a browser download without one.
 *
 * @param curve Curve.
 * @param name Display name; empty gives "Profile".
 * @param target Location, or null to download.
 * @param confirm Yes/No question for overwriting.
 * @param documentRef Document used for the download link.
 * @returns Message describing where it went.
 */
export async function curveFileSave(
  curve: Curve,
  name: string,
  target: CurveLibrarySource | null,
  confirm: CurveLibraryConfirm,
  documentRef: Document = document,
): Promise<string> {
  const title = name.trim() || CURVE_FILE_DEFAULT_NAME;
  const fileName = curveFileNameOf(title);
  const text = curveFileWrite(curve, title);
  if (target === null) {
    curveFileDownload(fileName, text, documentRef);
    return `Downloaded ${fileName}`;
  }
  const where = curveLibrarySourceLabel(target.id);
  if (!(await curveLibrarySave(target, fileName, text, confirm))) return `Kept the existing ${fileName} in ${where}`;
  return `Saved ${fileName} to ${where}`;
}

/**
 * Offers text as a file download.
 *
 * @param fileName File name.
 * @param text File content.
 * @param documentRef Document that hosts the link.
 */
function curveFileDownload(fileName: string, text: string, documentRef: Document): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = fileName;
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Reads a curve from a dropped or picked file.
 *
 * @param file File.
 * @returns Curve or error.
 */
export async function curveFileFromBlob(file: Blob): Promise<CurveFileLoadResult> {
  return curveFileRead(await file.text());
}

/**
 * Reads a curve file of the open project, or a room's Remote or Local curve by
 * its virtual path.
 *
 * @param path Project or virtual curve path.
 * @returns Curve or error.
 */
export async function curveFileFromProject(path: string): Promise<CurveFileLoadResult> {
  const access = curveProjectAccess();
  const read = curveLibraryPathRead(path) ?? access?.read(path);
  if (!read) return { error: 'No project is open.' };
  try {
    return curveFileRead(await read);
  } catch {
    return { error: `Could not read ${path}.` };
  }
}

/**
 * Lets the user pick a curve file from disk.
 *
 * @param documentRef Document that hosts the picker.
 * @returns Curve or error, or null when the user cancelled.
 */
export function curveFilePick(documentRef: Document = document): Promise<CurveFileLoadResult | null> {
  return new Promise((resolve) => {
    const input = documentRef.createElement('input');
    input.type = 'file';
    input.accept = CURVE_FILE_OPEN_ACCEPT;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      resolve(file ? curveFileFromBlob(file) : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
