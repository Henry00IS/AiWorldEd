import { curveEncode } from '@/curve/model/curve_codec.js';
import { pathAssetEncode } from '@/path/model/path_asset.js';
import {
  solidScriptResourceCurveRead,
  solidScriptResourceFind,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';
import type { SolidScriptInput } from './solid_script_input.js';

/** An Input Default that names one resource, such as [$Resource.Arch]. */
const SOLID_SCRIPT_INPUT_RESOURCE = /^\[\$Resource\.([A-Za-z_]\w*)\]$/i;

/**
 * Finds the resource an Input Default names.
 *
 * @param text Default text.
 * @returns Resource name, or null when the Default names none.
 */
export function solidScriptInputResourceName(text: string): string | null {
  return SOLID_SCRIPT_INPUT_RESOURCE.exec(text.trim())?.[1] ?? null;
}

/**
 * Gives an Input whose Default names a resource of its type the value of that
 * resource as the inspector stores values, so the inspector shows it.
 *
 * @param input Input.
 * @param resources Resources of the script.
 * @returns Input, its Default filled in when it names a resource.
 */
export function solidScriptInputResourceResolved(
  input: SolidScriptInput,
  resources: readonly SolidScriptResource[],
): SolidScriptInput {
  const name = solidScriptInputResourceName(input.fallback);
  const resource = name === null ? null : solidScriptResourceFind(resources, name);
  if (!resource || resource.kind !== input.type) return input;
  return { ...input, fallback: solidScriptInputResourceText(resource) };
}

/**
 * Writes a resource as the inspector stores the value of an Input.
 *
 * @param resource Resource.
 * @returns Text.
 */
function solidScriptInputResourceText(resource: SolidScriptResource): string {
  if (resource.kind === 'Texture') return resource.textureId;
  if (resource.kind === 'Path') return pathAssetEncode(resource.path);
  const curve = solidScriptResourceCurveRead(resource);
  return curve ? curveEncode(curve) : '1';
}
