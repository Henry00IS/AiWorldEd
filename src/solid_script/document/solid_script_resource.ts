import { curveFromData, curveToData, type CurveData } from '@/curve/model/curve_codec.js';
import type { Curve } from '@/curve/model/curve_model.js';
import { pathAssetFromData, type PathAsset } from '@/path/model/path_asset.js';
import type { SolidScriptDocument } from './solid_script_document.js';

/** Kinds of resource a script holds. */
export const SOLID_SCRIPT_RESOURCE_KINDS = ['Texture', 'Curve', 'Path'] as const;

/** Kind of one resource. */
export type SolidScriptResourceKind = (typeof SOLID_SCRIPT_RESOURCE_KINDS)[number];

/** A texture the script keeps a copy of, by the id of its embedded image. */
export interface SolidScriptResourceTexture {
  name: string;
  kind: 'Texture';
  /**
   * Id of the embedded image (embedded:<hash>.<ext>); its bytes travel with the
   * script.
   */
  textureId: string;
}

/** A curve the script uses. */
export interface SolidScriptResourceCurve {
  name: string;
  kind: 'Curve';
  /** Points, segments and markers of the curve. */
  curve: CurveData;
}

/** A path the script uses. */
export interface SolidScriptResourcePath {
  name: string;
  kind: 'Path';
  /** Points and segments of the path. */
  path: PathAsset;
}

/**
 * A named texture, curve or path kept with a script, which the script reads as
 * $Resources.Name and the user edits in the Resources tab.
 */
export type SolidScriptResource = SolidScriptResourceTexture | SolidScriptResourceCurve | SolidScriptResourcePath;

/** Prefix scripts read resources with, folded. */
export const SOLID_SCRIPT_RESOURCE_PREFIX = '$resource.';

/**
 * Tells whether a resource name is one a script can write after $Resources.: a
 * letter or underscore, then letters, digits or underscores.
 *
 * @param name Name.
 * @returns True when valid.
 */
export function solidScriptResourceNameValid(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/**
 * Finds a resource by name, ignoring case.
 *
 * @param resources Resources.
 * @param name Name.
 * @returns Resource, or undefined.
 */
export function solidScriptResourceFind(
  resources: readonly SolidScriptResource[] | undefined,
  name: string,
): SolidScriptResource | undefined {
  const key = name.toLowerCase();
  return resources?.find((resource) => resource.name.toLowerCase() === key);
}

/**
 * Gives a free name for a new resource, such as Curve2 when Curve is taken.
 *
 * @param resources Resources.
 * @param base Wanted name.
 * @returns Name no other resource has.
 */
export function solidScriptResourceNameFree(resources: readonly SolidScriptResource[], base: string): string {
  const clean = base.replace(/[^A-Za-z0-9_]/g, '').replace(/^(\d)/, '_$1') || 'Resource';
  if (!solidScriptResourceFind(resources, clean)) return clean;
  let index = 2;
  while (solidScriptResourceFind(resources, `${clean}${index}`)) index += 1;
  return `${clean}${index}`;
}

/**
 * Makes a curve resource.
 *
 * @param name Name.
 * @param curve Curve.
 * @returns Resource.
 */
export function solidScriptResourceCurve(name: string, curve: Curve): SolidScriptResourceCurve {
  return { name, kind: 'Curve', curve: curveToData(curve) };
}

/**
 * Reads the curve of a curve resource.
 *
 * @param resource Resource.
 * @returns Curve, or null when the stored data holds none.
 */
export function solidScriptResourceCurveRead(resource: SolidScriptResourceCurve): Curve | null {
  return curveFromData(resource.curve);
}

/**
 * Reads the resources stored with a script, dropping broken entries and
 * repeated names.
 *
 * @param input Stored resources.
 * @returns Resources.
 */
export function solidScriptResourcesNormalize(input: unknown): SolidScriptResource[] {
  const found: SolidScriptResource[] = [];
  for (const entry of Array.isArray(input) ? input : []) {
    const resource = solidScriptResourceNormalize(entry);
    if (resource && !solidScriptResourceFind(found, resource.name)) found.push(resource);
  }
  return found;
}

/**
 * Reads one stored resource.
 *
 * @param input Stored resource.
 * @returns Resource, or null when broken.
 */
function solidScriptResourceNormalize(input: unknown): SolidScriptResource | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as { name?: unknown; kind?: unknown; textureId?: unknown; curve?: unknown; path?: unknown };
  if (typeof record.name !== 'string' || !solidScriptResourceNameValid(record.name)) return null;
  const name = record.name;
  if (record.kind === 'Texture' && typeof record.textureId === 'string')
    return { name, kind: 'Texture', textureId: record.textureId };
  if (record.kind === 'Curve') {
    const curve = curveFromData(record.curve);
    return curve ? solidScriptResourceCurve(name, curve) : null;
  }
  if (record.kind === 'Path') {
    const path = pathAssetFromData(record.path);
    return path ? { name, kind: 'Path', path } : null;
  }
  return null;
}

/**
 * Lists the resources of a script.
 *
 * @param document Script.
 * @returns Resources, none when it has none.
 */
export function solidScriptDocumentResources(document: SolidScriptDocument): readonly SolidScriptResource[] {
  return document.resources ?? [];
}

/**
 * Gives a script new resources; none are left out, so scripts without resources
 * stay as they were.
 *
 * @param document Script.
 * @param resources Resources.
 * @returns Script.
 */
export function solidScriptDocumentResourcesWith(
  document: SolidScriptDocument,
  resources: readonly SolidScriptResource[],
): SolidScriptDocument {
  const { resources: _old, ...rest } = document;
  return resources.length > 0 ? { ...rest, resources: [...resources] } : rest;
}
