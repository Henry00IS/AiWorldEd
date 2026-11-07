import { curveFileNameOf, curveFileRead, curveFileWrite, CURVE_FILE_EXTENSION } from '@/curve/model/curve_file.js';
import type { Curve } from '@/curve/model/curve_model.js';
import { CURVE_PROJECT_FOLDER, curveProjectAccess } from './curve_project_access.js';

/** Result of loading a curve: the curve, or a message why not. */
export type CurveFileLoadResult = { curve: Curve; name: string } | { error: string };

/**
 * Saves a curve: into the project's curves folder when the project is writable,
 * else as a browser download.
 *
 * @param curve Curve.
 * @param name Display name.
 * @param documentRef Document used for the download link.
 * @returns Message describing where it went.
 */
export async function curveFileSave(curve: Curve, name: string, documentRef: Document = document): Promise<string> {
  const fileName = curveFileNameOf(name);
  const text = curveFileWrite(curve, name.trim() || 'curve');
  const access = curveProjectAccess();
  if (access?.writable()) {
    const path = `${CURVE_PROJECT_FOLDER}/${fileName}`;
    await access.write(path, text);
    return `Saved ${path}`;
  }
  curveFileDownload(fileName, text, documentRef);
  return `Downloaded ${fileName}`;
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
 * Reads a curve file of the open project.
 *
 * @param path Project path.
 * @returns Curve or error.
 */
export async function curveFileFromProject(path: string): Promise<CurveFileLoadResult> {
  const access = curveProjectAccess();
  if (!access) return { error: 'No project is open.' };
  try {
    return curveFileRead(await access.read(path));
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
    input.accept = `.${CURVE_FILE_EXTENSION},application/json`;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      resolve(file ? curveFileFromBlob(file) : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
