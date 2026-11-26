import { curveEncode } from '@/curve/model/curve_codec.js';
import { PATH_ASSET_DEFAULT, pathAssetEncode } from '@/path/model/path_asset.js';
import { pathReferenceEncode } from '@/path/model/path_reference.js';
import { solidScriptCurveFromText } from './solid_script_curve_read.js';
import type { SolidScriptInput } from './solid_script_input.js';
import { solidScriptPathAssetFromText } from './solid_script_input_path.js';

/**
 * Resolves an Input's runtime inspector value from any stored override or its
 * Solid Script default, converting Path and Curve script syntax into the
 * internal encoding expected by the inspector widgets and scene path linker.
 *
 * @param input Input declaration.
 * @param stored Stored inspector value, or undefined when unset.
 * @returns Value for the inspector or runtime linker.
 */
export function solidScriptInputEffectiveValue(input: SolidScriptInput, stored: string | undefined): string {
  if (stored !== undefined) return stored;
  if (input.fromResource) return input.fallback;
  if (input.type === 'Path') {
    const asset = solidScriptPathAssetFromText(input.fallback) ?? PATH_ASSET_DEFAULT;
    return input.follows !== '' ? pathReferenceEncode(input.follows, asset) : pathAssetEncode(asset);
  }
  if (input.type === 'Curve') {
    const curve = solidScriptCurveFromText(input.fallback);
    return curve ? curveEncode(curve) : input.fallback;
  }
  return input.fallback;
}
