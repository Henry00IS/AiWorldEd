import { curveDecode } from '@/curve/model/curve_codec.js';
import { pathAssetDecode } from '@/path/model/path_asset.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptFieldUnescape } from '@/solid_script/language/solid_script_field.js';
import type { SolidScriptBlock, SolidScriptDocument } from './solid_script_document.js';
import {
  solidScriptDocumentResources,
  solidScriptDocumentResourcesWith,
  solidScriptResourceCurve,
  solidScriptResourceNameFree,
  type SolidScriptResource,
} from './solid_script_resource.js';
import { solidScriptResourceNameOfFile } from './solid_script_resource_file.js';

/** A field that older scripts may hold an inline curve or path in. */
type SolidScriptJsonField = readonly [key: string, name: string, kind: 'Curve' | 'Path'];

/**
 * Moves the curves and paths older scripts wrote inline as encoded text into
 * resources, and points their fields at them, such as a Column's Profile
 * becoming [$Resources.Profile]. Scripts without such text come back
 * unchanged.
 *
 * @param document Script.
 * @returns Script.
 */
export function solidScriptDocumentJsonMigrate(document: SolidScriptDocument): SolidScriptDocument {
  const resources = [...solidScriptDocumentResources(document)];
  let moved = false;
  const blocks = document.blocks.map((block) => {
    const values = solidScriptJsonMigrateValues(block, resources);
    if (values === block.values) return block;
    moved = true;
    return { ...block, values };
  });
  return moved ? solidScriptDocumentResourcesWith({ ...document, blocks }, resources) : document;
}

/**
 * Moves the inline curves and paths of one line into resources.
 *
 * @param block Line.
 * @param resources Resources so far; new ones are added.
 * @returns Values, the same object when nothing moved.
 */
function solidScriptJsonMigrateValues(
  block: SolidScriptBlock,
  resources: SolidScriptResource[],
): SolidScriptBlock['values'] {
  let values = block.values;
  for (const [key, name, kind] of solidScriptJsonMigrateFields(block)) {
    const text = values[key];
    const free = solidScriptResourceNameFree(resources, name);
    const resource = text === undefined ? null : solidScriptJsonMigrateResource(text, kind, free);
    if (!resource) continue;
    resources.push(resource);
    values = { ...values, [key]: `[$Resources.${resource.name}]` };
  }
  return values;
}

/**
 * Lists the fields of a line that may hold an inline curve or path: an Input's
 * Curve or Path Default, and every curve field.
 *
 * @param block Line.
 * @returns Fields with the name a moved value gets.
 */
function solidScriptJsonMigrateFields(block: SolidScriptBlock): SolidScriptJsonField[] {
  if (block.command === 'input') {
    const type = (block.values['type'] ?? '').trim();
    const name = solidScriptResourceNameOfFile(block.values['name'] || type);
    return type === 'Curve' || type === 'Path' ? [['default', name, type]] : [];
  }
  const parameters = solidScriptCommandFind(block.command)?.parameters ?? [];
  return parameters
    .filter((parameter) => parameter.curve !== undefined)
    .map((parameter) => [parameter.key, solidScriptResourceNameOfFile(parameter.label), 'Curve'] as const);
}

/**
 * Reads an inline curve or path into a resource.
 *
 * @param text Field text.
 * @param kind Curve or Path.
 * @param name Resource name.
 * @returns Resource, or null when the text holds none.
 */
function solidScriptJsonMigrateResource(
  text: string,
  kind: 'Curve' | 'Path',
  name: string,
): SolidScriptResource | null {
  const raw = solidScriptFieldUnescape(text).trim();
  if (!raw.startsWith('{')) return null;
  if (kind === 'Path') {
    const path = pathAssetDecode(raw);
    return path ? { name, kind: 'Path', path } : null;
  }
  const curve = curveDecode(raw);
  return curve ? solidScriptResourceCurve(name, curve) : null;
}
