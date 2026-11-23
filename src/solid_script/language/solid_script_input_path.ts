import { PATH_ASSET_DEFAULT, pathAssetDecode } from '@/path/model/path_asset.js';
import { pathAssetScriptPath } from '@/path/model/path_asset_script.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import type { SolidScriptPathElement } from './solid_script_value.js';

/**
 * Reads a Path input: the path drawn in the scene, or a two metre line when the
 * text holds no path.
 *
 * @param run Running Input line.
 * @param text Stored path text.
 * @returns Path element.
 */
export function solidScriptInputPath(run: SolidScriptBlockRun, text: string): SolidScriptPathElement {
  const [made] = run.pathsMake([{ points: [], closed: false }]);
  if (!made) throw new Error('the Path input could not be read');
  made.path = pathAssetScriptPath(pathAssetDecode(text) ?? PATH_ASSET_DEFAULT);
  return made;
}
