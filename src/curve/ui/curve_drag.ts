import { curveFileNameOf, CURVE_FILE_MAX_BYTES } from '@/curve/model/curve_file.js';

/** MIME type of a curve dragged from a curve field or a chat curve card. */
export const CURVE_DRAG_TYPE = 'application/x-aiworlded-curve';

/** A dragged curve: its display name and its .curve file text. */
export interface CurveDragData {
  name: string;
  text: string;
}

/**
 * Puts a curve on a drag so curve fields can load it and the chat can send it
 * as a .aicurve file.
 *
 * @param transfer Drag data.
 * @param data Curve name and file text.
 */
export function curveDragSet(transfer: DataTransfer, data: CurveDragData): void {
  transfer.setData(CURVE_DRAG_TYPE, JSON.stringify(data));
  transfer.setData('text/plain', curveFileNameOf(data.name));
  transfer.effectAllowed = 'copy';
}

/**
 * Returns whether a drag carries a curve, readable during dragover too.
 *
 * @param transfer Drag data.
 * @returns True when a curve is dragged.
 */
export function curveDragHas(transfer: DataTransfer | null): boolean {
  return transfer ? [...transfer.types].includes(CURVE_DRAG_TYPE) : false;
}

/**
 * Reads a dragged curve.
 *
 * @param transfer Drop data.
 * @returns Curve name and text, or null when the drag holds none.
 */
export function curveDragGet(transfer: DataTransfer): CurveDragData | null {
  const raw = transfer.getData(CURVE_DRAG_TYPE);
  if (!raw || raw.length > CURVE_FILE_MAX_BYTES * 2) return null;
  try {
    const data = JSON.parse(raw) as Partial<CurveDragData>;
    return typeof data.name === 'string' && typeof data.text === 'string' ? { name: data.name, text: data.text } : null;
  } catch {
    return null;
  }
}

/**
 * Turns a dragged curve into a .aicurve file.
 *
 * @param data Curve name and text.
 * @returns File.
 */
export function curveDragFile(data: CurveDragData): File {
  const name = data.name.replace(/\.(?:aicurve|curve)$/i, '');
  return new File([data.text], curveFileNameOf(name), { type: 'application/json' });
}
