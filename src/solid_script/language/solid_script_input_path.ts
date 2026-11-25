import { PATH_ASSET_DEFAULT, pathAssetDecode, type PathAsset, type PathAssetPoint } from '@/path/model/path_asset.js';
import { pathAssetScriptPath } from '@/path/model/path_asset_script.js';
import { solidScriptFieldSplit } from './solid_script_field.js';
import { solidScriptFieldVectorRead } from './solid_script_formula_list_literal.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import type { SolidScriptPathElement } from './solid_script_value.js';

/**
 * Parses one Solid Script point token ("[x, y, z]" or "[x, y]") into a 3D path
 * point.
 *
 * @param token Bracketed point text.
 * @returns 3D point, or null when invalid.
 */
function solidScriptPathPointParse(token: string): PathAssetPoint | null {
  const trimmed = token.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1);
  const vec3 = solidScriptFieldVectorRead(inner);
  if (vec3) return [vec3[0]!, vec3[1]!, vec3[2]!];
  const parts = inner.split(',').map((part) => (part.trim() === '' ? NaN : Number(part)));
  if (parts.length === 2 && parts.every(Number.isFinite)) return [parts[0]!, parts[1]!, 0];
  return null;
}

/**
 * Reads a PathAsset from Solid Script point-list syntax such as "[-2, 0, 1.5],
 * [-2, 0, -1.5], [2, 0, -1.5], [2, 0, 1.5]" (optionally ending with "Closed"),
 * or from encoded path JSON used by the inspector PathField.
 *
 * @param text Path text.
 * @returns PathAsset, or null when empty or invalid.
 */
export function solidScriptPathAssetFromText(text: string): PathAsset | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (trimmed.startsWith('{')) return pathAssetDecode(trimmed);
  const body = trimmed.startsWith('[[') && trimmed.endsWith(']]') ? trimmed.slice(1, -1).trim() : trimmed;
  const parts = solidScriptFieldSplit(body, ',').map((part) => part.trim());
  let closed = false;
  if (parts.length > 0 && parts[parts.length - 1]!.toLowerCase() === 'closed') {
    closed = true;
    parts.pop();
  }
  const minPoints = closed ? 3 : 2;
  if (parts.length < minPoints) return null;
  const points: PathAssetPoint[] = [];
  for (const part of parts) {
    const point = solidScriptPathPointParse(part);
    if (!point) return null;
    points.push(point);
  }
  return {
    points,
    segments: points.slice(1).map(() => ({ kind: 'Straight' })),
    closed,
  };
}

/**
 * Reads a Path input: the path drawn in the scene, a Solid Script point list,
 * or a two metre line when the text holds no path.
 *
 * @param run Running Input line.
 * @param text Stored path text.
 * @returns Path element.
 */
export function solidScriptInputPath(run: SolidScriptBlockRun, text: string): SolidScriptPathElement {
  const [made] = run.pathsMake([{ points: [], closed: false }]);
  if (!made) throw new Error('the Path input could not be read');
  made.path = pathAssetScriptPath(solidScriptPathAssetFromText(text) ?? PATH_ASSET_DEFAULT);
  return made;
}
