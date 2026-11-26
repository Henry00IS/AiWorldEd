import { PATH_ASSET_DEFAULT, pathAssetDecode, type PathAsset, type PathAssetPoint } from '@/path/model/path_asset.js';
import { pathAssetScriptPath } from '@/path/model/path_asset_script.js';
import { solidScriptVectorTextItems, solidScriptVectorTextPoints } from './solid_script_vector_text.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import type { SolidScriptPathElement } from './solid_script_value.js';

/**
 * Reads a PathAsset from Solid Script point-list syntax such as "[-2, 0, 1.5],
 * [-2, 0, -1.5], [2, 0, -1.5], [2, 0, 1.5]", optionally ending with "Closed".
 *
 * @param text Path text.
 * @returns PathAsset, or null when empty or invalid.
 */
export function solidScriptPathAssetFromText(text: string): PathAsset | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const parts = solidScriptVectorTextItems(trimmed);
  const closed = parts[parts.length - 1]?.toLowerCase() === 'closed';
  if (closed) parts.pop();
  const points: PathAssetPoint[] | null = solidScriptVectorTextPoints(parts);
  if (!points || points.length < (closed ? 3 : 2)) return null;
  return {
    points,
    segments: points.slice(1).map(() => ({ kind: 'Straight' })),
    closed,
  };
}

/**
 * Reads a path the inspector stored on a generator: the encoded path drawn in
 * the scene, or a Solid Script point list such as a Default.
 *
 * @param text Stored path value.
 * @returns PathAsset, or null when empty or invalid.
 */
export function solidScriptPathAssetFromStored(text: string): PathAsset | null {
  const trimmed = text.trim();
  return trimmed.startsWith('{') ? pathAssetDecode(trimmed) : solidScriptPathAssetFromText(trimmed);
}

/**
 * Reads a Path input: the path drawn in the scene, or a two metre line when
 * there is no path.
 *
 * @param run Running Input line.
 * @param asset Path read from the stored value or the Default, or null.
 * @returns Path element.
 */
export function solidScriptInputPath(run: SolidScriptBlockRun, asset: PathAsset | null): SolidScriptPathElement {
  const [made] = run.pathsMake([{ points: [], closed: false }]);
  if (!made) throw new Error('the Path input could not be read');
  made.path = pathAssetScriptPath(asset ?? PATH_ASSET_DEFAULT);
  return made;
}
