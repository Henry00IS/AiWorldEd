import { base64BytesDecode, base64BytesEncode } from '@/utils/utils_base64.js';
import { PAINT_DAB_STRIDE, type PaintStroke, type PaintStrokeMode } from './paint_stroke.js';

/**
 * Bytes stored per dab: three float32 coordinates and six int8 direction
 * components.
 */
const PAINT_DAB_BYTES = 19;

/** Saved form of one stroke inside a brush's `paint` record. */
export interface PaintStrokeSerialized {
  order: number;
  mode: PaintStrokeMode;
  shape: string;
  stencilTextureId?: string;
  stencilScale?: number;
  stampTextureId?: string;
  color: string;
  opacity: number;
  hardness: number;
  radius: number;
  dabs: string;
}

/**
 * Encodes a stroke for saving and syncing.
 *
 * @param stroke Stroke record.
 * @returns Serialized stroke.
 */
export function paintStrokeEncode(stroke: PaintStroke): PaintStrokeSerialized {
  const serialized: PaintStrokeSerialized = {
    order: stroke.order,
    mode: stroke.mode,
    shape: stroke.shape,
    color: paintStrokeColorText(stroke.color),
    opacity: stroke.opacity,
    hardness: stroke.hardness,
    radius: stroke.radius,
    dabs: base64BytesEncode(paintDabsPack(stroke.dabs)),
  };
  if (stroke.stencilTextureId !== '') {
    serialized.stencilTextureId = stroke.stencilTextureId;
    serialized.stencilScale = stroke.stencilScale;
  }
  if (stroke.stampTextureId !== '') serialized.stampTextureId = stroke.stampTextureId;
  return serialized;
}

/**
 * Decodes one saved stroke, rejecting malformed data.
 *
 * @param id Stroke id (the record key).
 * @param value Saved value.
 * @returns Stroke, or null when the value is not a valid stroke.
 */
export function paintStrokeDecode(id: string, value: unknown): PaintStroke | null {
  if (!paintStrokeSerializedIs(value) || id === '') return null;
  const dabs = paintDabsUnpackText(value.dabs);
  if (dabs === null || dabs.length === 0) return null;
  return {
    id,
    order: value.order,
    mode: value.mode,
    shape: value.shape,
    stencilTextureId: typeof value.stencilTextureId === 'string' ? value.stencilTextureId : '',
    stencilScale: paintStrokeStencilScale(value.stencilScale),
    stampTextureId: typeof value.stampTextureId === 'string' ? value.stampTextureId : '',
    color: paintStrokeColorParse(value.color),
    opacity: paintStrokeUnit(value.opacity),
    hardness: paintStrokeUnit(value.hardness),
    radius: Math.max(1e-4, value.radius),
    dabs,
  };
}

/**
 * Rounds dabs to exactly what saving keeps, so a live stroke, a reloaded stroke
 * and a remote copy rasterize identically.
 *
 * @param dabs Packed dabs at full precision.
 * @returns Packed dabs at saved precision.
 */
export function paintDabsQuantize(dabs: Float32Array): Float32Array {
  return paintDabsUnpack(paintDabsPack(dabs));
}

/**
 * Checks the shape of a saved stroke.
 *
 * @param value Candidate.
 * @returns True when every required field has the right type.
 */
function paintStrokeSerializedIs(value: unknown): value is PaintStrokeSerialized {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const numbersValid = ['order', 'opacity', 'hardness', 'radius'].every((key) => Number.isFinite(record[key]));
  const modeValid = record['mode'] === 'paint' || record['mode'] === 'erase';
  const textValid = ['shape', 'color', 'dabs'].every((key) => typeof record[key] === 'string');
  return numbersValid && modeValid && textValid;
}

/**
 * Packs dabs into bytes.
 *
 * @param dabs Packed float dabs.
 * @returns Little-endian bytes, {@link PAINT_DAB_BYTES} per dab.
 */
function paintDabsPack(dabs: Float32Array): Uint8Array {
  const count = Math.floor(dabs.length / PAINT_DAB_STRIDE);
  const bytes = new Uint8Array(count * PAINT_DAB_BYTES);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < count; index++) {
    paintDabPackOne(dabs, index, view);
  }
  return bytes;
}

/**
 * Packs one dab.
 *
 * @param dabs Packed float dabs.
 * @param index Dab index.
 * @param view Output view.
 */
function paintDabPackOne(dabs: Float32Array, index: number, view: DataView): void {
  const source = index * PAINT_DAB_STRIDE;
  const target = index * PAINT_DAB_BYTES;
  for (let axis = 0; axis < 3; axis++) view.setFloat32(target + axis * 4, dabs[source + axis] ?? 0, true);
  for (let axis = 0; axis < 6; axis++)
    view.setInt8(target + 12 + axis, paintDirectionQuantize(dabs[source + 3 + axis] ?? 0));
  view.setUint8(target + 18, paintDabVariant(dabs[source + 9] ?? 0));
}

/**
 * Clamps a dab variant to a byte.
 *
 * @param value Variant.
 * @returns Integer 0..255.
 */
export function paintDabVariant(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Quantizes one unit-vector component to int8.
 *
 * @param value Component in -1..1.
 * @returns Int8 value.
 */
function paintDirectionQuantize(value: number): number {
  return Math.max(-127, Math.min(127, Math.round(value * 127)));
}

/**
 * Unpacks base64 dab text.
 *
 * @param text Base64 text.
 * @returns Dabs, or null when the text is not a whole number of dabs.
 */
function paintDabsUnpackText(text: string): Float32Array | null {
  try {
    const bytes = base64BytesDecode(text);
    if (bytes.length % PAINT_DAB_BYTES !== 0) return null;
    return paintDabsUnpack(bytes);
  } catch {
    return null;
  }
}

/**
 * Unpacks dab bytes into floats with unit directions.
 *
 * @param bytes Packed bytes.
 * @returns Packed float dabs.
 */
function paintDabsUnpack(bytes: Uint8Array): Float32Array {
  const count = Math.floor(bytes.length / PAINT_DAB_BYTES);
  const dabs = new Float32Array(count * PAINT_DAB_STRIDE);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < count; index++) {
    const source = index * PAINT_DAB_BYTES;
    const target = index * PAINT_DAB_STRIDE;
    for (let axis = 0; axis < 3; axis++) dabs[target + axis] = view.getFloat32(source + axis * 4, true);
    paintDirectionUnpack(view, source + 12, dabs, target + 3, [0, 0, 1]);
    paintDirectionUnpack(view, source + 15, dabs, target + 6, [0, 1, 0]);
    dabs[target + 9] = view.getUint8(source + 18);
  }
  return dabs;
}

/**
 * Unpacks and normalizes one int8 direction.
 *
 * @param view Byte view.
 * @param offset Byte offset of the three components.
 * @param output Float output.
 * @param target Float offset.
 * @param fallback Direction used when the stored one has no length.
 */
function paintDirectionUnpack(
  view: DataView,
  offset: number,
  output: Float32Array,
  target: number,
  fallback: readonly [number, number, number],
): void {
  const x = view.getInt8(offset);
  const y = view.getInt8(offset + 1);
  const z = view.getInt8(offset + 2);
  const length = Math.hypot(x, y, z);
  const unit = length > 0 ? [x / length, y / length, z / length] : fallback;
  output.set(unit, target);
}

/**
 * Formats a color as #rrggbb.
 *
 * @param color 0xRRGGBB.
 * @returns Hex text.
 */
export function paintStrokeColorText(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

/**
 * Parses #rrggbb text.
 *
 * @param text Hex text.
 * @returns 0xRRGGBB, or white when invalid.
 */
export function paintStrokeColorParse(text: string): number {
  const match = /^#([0-9a-fA-F]{6})$/.exec(text);
  return match ? parseInt(match[1] ?? 'ffffff', 16) : 0xffffff;
}

/**
 * Clamps a value to 0..1.
 *
 * @param value Number.
 * @returns Clamped value.
 */
function paintStrokeUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Reads a stencil repeat size.
 *
 * @param value Saved value.
 * @returns Positive size, 1 when missing or invalid.
 */
function paintStrokeStencilScale(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 1e-3 ? value : 1;
}
