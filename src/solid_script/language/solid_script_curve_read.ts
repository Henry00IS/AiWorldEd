import { curveDecode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { CURVE_PRESETS_TURNERY } from '@/curve/model/curve_preset_turnery.js';
import { solidScriptVectorTextItems, solidScriptVectorTextPoints } from './solid_script_vector_text.js';

/** Catalog of built-in curve presets resolved by name or id in Solid Script. */
const SOLID_SCRIPT_CURVE_PRESETS = [...CURVE_PRESETS_ARCHITECTURE, ...CURVE_PRESETS_TURNERY, ...CURVE_PRESETS_EXTENDED];

/**
 * Reads a curve written as points in brackets, such as [0, 1], [0.5, 0.5], [1,
 * 0]: X from 0 to 1 along the curve and Y its height. A Z is left out, as on
 * every flat point.
 *
 * @param text Field text.
 * @returns Polyline points, or null when the text is no such list.
 */
function solidScriptCurvePointsParse(text: string): [number, number][] | null {
  if (!text.trim().startsWith('[')) return null;
  const points = solidScriptVectorTextPoints(solidScriptVectorTextItems(text));
  if (!points || points.length < 2 || points.some(([x]) => x < 0 || x > 1)) return null;
  return points.map(([x, y]) => [x, y]);
}

/**
 * Finds a built-in curve preset by label or id, ignoring case and spacing.
 *
 * @param text Preset label or id.
 * @returns Built curve without locked preset heights, or null.
 */
function solidScriptCurvePresetRead(text: string): Curve | null {
  const key = text.trim().toLowerCase();
  if (key === '') return null;
  const preset = SOLID_SCRIPT_CURVE_PRESETS.find(
    (entry) => entry.label.toLowerCase() === key || entry.id.toLowerCase() === key,
  );
  if (!preset) return null;
  const { height: _height, ...plain } = preset;
  return curvePresetBuild(plain);
}

/**
 * Reads a curve from Solid Script text: a number for a flat line, a preset name
 * such as "Classic Column", or points in brackets such as "[0, 1], [1, 0]".
 *
 * @param text Typed curve text.
 * @returns Curve, or null when empty or invalid.
 */
export function solidScriptCurveFromText(text: string): Curve | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const number = Number(trimmed);
  if (Number.isFinite(number))
    return curveFromPolyline([
      [0, number],
      [1, number],
    ]);
  return (
    solidScriptCurvePresetRead(trimmed) ??
    (() => {
      const points = solidScriptCurvePointsParse(trimmed);
      return points ? curveFromPolyline(points) : null;
    })()
  );
}

/**
 * Reads a curve the inspector stored on a generator or a modifier: the encoded
 * curve its curve editor writes, or Solid Script text such as a Default.
 *
 * @param text Stored curve value.
 * @returns Curve, or null when empty or invalid.
 */
export function solidScriptCurveFromStored(text: string): Curve | null {
  const trimmed = text.trim();
  return trimmed.startsWith('{') ? curveDecode(trimmed) : solidScriptCurveFromText(trimmed);
}
