import { curveFromData, curveToData, type CurveData } from './curve_codec.js';
import type { Curve } from './curve_model.js';

/** File extension of curve files, without the dot. */
export const CURVE_FILE_EXTENSION = 'aicurve';

/**
 * Extensions curves were saved with by older versions; they still open
 * unchanged (a .json file only when its contents are a curve file).
 */
export const CURVE_FILE_LEGACY_EXTENSIONS: readonly string[] = ['curve', 'json'];

/** File input filter for opening curves (new and legacy). */
export const CURVE_FILE_OPEN_ACCEPT = [CURVE_FILE_EXTENSION, ...CURVE_FILE_LEGACY_EXTENSIONS]
  .map((extension) => `.${extension}`)
  .join(',');

/** Format tag written into every curve file. */
export const CURVE_FILE_FORMAT = 'aiworlded-curve';

/** Curve file version this editor writes and reads. */
export const CURVE_FILE_VERSION = 1;

/** Largest curve file the editor reads, in bytes. */
export const CURVE_FILE_MAX_BYTES = 256 * 1024;

/** Contents of a curve file. */
export interface CurveFileData {
  /** Always {@link CURVE_FILE_FORMAT}. */
  format: string;
  /** File version. */
  version: number;
  /** Display name. */
  name: string;
  /** The curve. */
  curve: CurveData;
}

/** A curve read from a file, or why it could not be read. */
export type CurveFileReadResult = { curve: Curve; name: string } | { error: string };

/**
 * Writes a curve file.
 *
 * @param curve Curve.
 * @param name Display name.
 * @returns File text.
 */
export function curveFileWrite(curve: Curve, name: string): string {
  const data: CurveFileData = {
    format: CURVE_FILE_FORMAT,
    version: CURVE_FILE_VERSION,
    name,
    curve: curveToData(curve),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

/**
 * Reads a curve file.
 *
 * @param text File text.
 * @returns Curve and name, or an error message.
 */
export function curveFileRead(text: string): CurveFileReadResult {
  if (text.length > CURVE_FILE_MAX_BYTES) return { error: 'The curve file is too large.' };
  let data: Partial<CurveFileData>;
  try {
    data = JSON.parse(text) as Partial<CurveFileData>;
  } catch {
    return { error: 'The curve file is not valid JSON.' };
  }
  if (data?.format !== CURVE_FILE_FORMAT) return { error: 'This is not a curve file.' };
  if (typeof data.version !== 'number' || data.version > CURVE_FILE_VERSION)
    return { error: 'This curve file was written by a newer version of the editor.' };
  const curve = curveFromData(data.curve);
  if (!curve) return { error: 'The curve file holds no valid curve.' };
  return { curve, name: typeof data.name === 'string' ? data.name : '' };
}

/**
 * Returns whether a file name is a curve file.
 *
 * @param name File name or path.
 * @returns True for .aicurve and legacy .curve.
 */
export function curveFileNameIs(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(`.${CURVE_FILE_EXTENSION}`) || lower.endsWith('.curve');
}

/**
 * Returns whether a file may hold a curve: a curve file, or a legacy .json file
 * (its contents decide).
 *
 * @param name File name or path.
 * @returns True when worth reading as a curve.
 */
export function curveFileNameReadable(name: string): boolean {
  return curveFileNameIs(name) || name.toLowerCase().endsWith('.json');
}

/**
 * Returns a curve file name without its extension (.aicurve, legacy .curve or
 * .json), whatever their length.
 *
 * @param name File name.
 * @returns Name without the extension.
 */
export function curveFileStem(name: string): string {
  return name.replace(/\.(?:aicurve|curve|json)$/i, '');
}

/**
 * Tells from its text whether a file is a curve file, without parsing it.
 *
 * @param text File text (its start is enough).
 * @returns True when it carries the curve format tag.
 */
export function curveFileTextIs(text: string): boolean {
  return /^\uFEFF?\s*\{\s*"format"\s*:\s*"aiworlded-curve"/.test(text.slice(0, 256));
}

/**
 * Turns a display name into a safe file name with the curve extension.
 *
 * @param name Display name.
 * @returns File name.
 */
export function curveFileNameOf(name: string): string {
  const stem =
    name
      .trim()
      .replace(/[^A-Za-z0-9 _-]+/g, '')
      .replace(/\s+/g, '_') || 'curve';
  return `${stem.slice(0, 64)}.${CURVE_FILE_EXTENSION}`;
}
