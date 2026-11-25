import { curveDecode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { CURVE_PRESETS_TURNERY } from '@/curve/model/curve_preset_turnery.js';
import { solidScriptFieldSplit } from './solid_script_field.js';

/** Catalog of built-in curve presets resolved by name or id in Solid Script. */
const SOLID_SCRIPT_CURVE_PRESETS = [...CURVE_PRESETS_ARCHITECTURE, ...CURVE_PRESETS_TURNERY, ...CURVE_PRESETS_EXTENDED];

/**
 * Parses a Solid Script 2D point list such as "[0, 1], [0.5, 0.5], [1, 0]" into
 * polyline points.
 *
 * @param text Field text.
 * @returns Polyline points, or null when not a valid curve point list.
 */
function solidScriptCurvePointsParse(text: string): [number, number][] | null {
  let body = text.trim();
  if (body.startsWith('[[') && body.endsWith(']]')) body = body.slice(1, -1).trim();
  if (!body.startsWith('[')) return null;
  const parts = solidScriptFieldSplit(body, ',');
  if (parts.length < 2) return null;
  const points: [number, number][] = [];
  for (const part of parts) {
    const item = part.trim();
    if (!item.startsWith('[') || !item.endsWith(']')) return null;
    const nums = item
      .slice(1, -1)
      .split(',')
      .map((entry) => (entry.trim() === '' ? NaN : Number(entry)));
    if (nums.length !== 2 || !nums.every(Number.isFinite)) return null;
    const x = nums[0]!;
    if (x < 0 || x > 1) return null;
    points.push([x, nums[1]!]);
  }
  return points;
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
 * such as "Classic Column", a Solid Script 2D point list "[0, 1], [1, 0]", or
 * encoded curve JSON from the inspector CurveField.
 *
 * @param text Stored or typed curve text.
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
  if (trimmed.startsWith('{')) return curveDecode(trimmed);
  return (
    solidScriptCurvePresetRead(trimmed) ??
    (() => {
      const points = solidScriptCurvePointsParse(trimmed);
      return points ? curveFromPolyline(points) : null;
    })()
  );
}
