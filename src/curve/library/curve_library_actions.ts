import {
  CurveLibraryExistsError,
  curveLibraryDisplayName,
  curveLibrarySourceLabel,
  type CurveLibrarySource,
} from '@/curve/library/curve_library.js';
import { curveFileRead } from '@/curve/model/curve_file.js';

/** Asks the user a Yes/No question; resolves true for Yes. */
export type CurveLibraryConfirm = (title: string, message: string) => Promise<boolean>;

/** Title of the overwrite question. */
export const CURVE_LIBRARY_OVERWRITE_TITLE = 'Overwrite Curve?';

/**
 * Returns the overwrite question for a curve that already exists.
 *
 * @param source Target source.
 * @param fileName File name.
 * @returns Message.
 */
export function curveLibraryOverwriteMessage(source: CurveLibrarySource, fileName: string): string {
  return `"${curveLibraryDisplayName(fileName)}" already exists in ${curveLibrarySourceLabel(source.id)}. Overwrite it?`;
}

/**
 * Saves a curve into a source; when the name is taken, asks Yes/No before
 * replacing it.
 *
 * @param source Target source.
 * @param fileName File name.
 * @param text File text.
 * @param confirm Yes/No question.
 * @returns True when saved, false when the user kept the existing file.
 */
export async function curveLibrarySave(
  source: CurveLibrarySource,
  fileName: string,
  text: string,
  confirm: CurveLibraryConfirm,
): Promise<boolean> {
  try {
    await source.write(fileName, text, false);
    return true;
  } catch (error) {
    if (!(error instanceof CurveLibraryExistsError)) throw error;
  }
  if (!(await confirm(CURVE_LIBRARY_OVERWRITE_TITLE, curveLibraryOverwriteMessage(source, fileName)))) return false;
  await source.write(fileName, text, true);
  return true;
}

/**
 * Copies a curve between sources (such as Remote and Local), asking Yes/No
 * before replacing one of the same name.
 *
 * @param from Source to read.
 * @param to Source to write.
 * @param fileName File name.
 * @param confirm Yes/No question.
 * @returns True when copied, false when the user kept the existing file.
 */
export async function curveLibraryCopy(
  from: CurveLibrarySource,
  to: CurveLibrarySource,
  fileName: string,
  confirm: CurveLibraryConfirm,
): Promise<boolean> {
  if (!to.writable()) throw new Error(to.readOnlyReason?.() ?? `${curveLibrarySourceLabel(to.id)} is read-only.`);
  const text = await from.read(fileName);
  const parsed = curveFileRead(text);
  if ('error' in parsed) throw new Error(parsed.error);
  return curveLibrarySave(to, fileName, text, confirm);
}
