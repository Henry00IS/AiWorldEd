import type { ZipReader } from '@/io/zip/zip_reader.js';
import type { ZipWriter } from '@/io/zip/zip_writer.js';
import {
  solidScriptResourcesNormalize,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';

/** Folder of a script file that holds its resources. */
export const SOLID_SCRIPT_FILE_RESOURCES = 'resources/';

/** File ending and type of each resource kind inside a script file. */
const SOLID_SCRIPT_FILE_RESOURCE_TYPES: Readonly<Record<SolidScriptResource['kind'], readonly [string, string]>> = {
  Texture: ['texture.json', 'application/x-aiworlded-texture'],
  Curve: ['curve.json', 'application/x-aiworlded-curve'],
  Path: ['path.json', 'application/x-aiworlded-path'],
};

/** A resource listed in script.json: where its file is and what it holds. */
export interface SolidScriptFileResource {
  /** Zip entry path, under resources/. */
  path: string;
  /** MIME type. */
  type: string;
  /** Name the script reads it by. */
  name: string;
  /** Texture, Curve or Path. */
  kind: SolidScriptResource['kind'];
}

/**
 * Writes each resource as its own file under resources/ and lists them for
 * script.json.
 *
 * @param writer Zip being written.
 * @param resources Resources of the script.
 * @returns List for script.json.
 */
export async function solidScriptFileResourcesWrite(
  writer: ZipWriter,
  resources: readonly SolidScriptResource[],
): Promise<SolidScriptFileResource[]> {
  const listed: SolidScriptFileResource[] = [];
  for (const resource of resources) {
    const [ending, type] = SOLID_SCRIPT_FILE_RESOURCE_TYPES[resource.kind];
    const path = `${SOLID_SCRIPT_FILE_RESOURCES}${resource.name}.${ending}`;
    await writer.addText(path, JSON.stringify(resource, null, 2));
    listed.push({ path, type, name: resource.name, kind: resource.kind });
  }
  return listed;
}

/**
 * Reads the resources a script file lists from their files under resources/; a
 * listed file that is missing or broken is left out.
 *
 * @param zip Script file.
 * @param listed Resources listed in script.json.
 * @returns Resources.
 */
export async function solidScriptFileResourcesRead(zip: ZipReader, listed: unknown): Promise<SolidScriptResource[]> {
  const read: unknown[] = [];
  for (const entry of Array.isArray(listed) ? listed : []) {
    const path = (entry as { path?: unknown } | null)?.path;
    if (typeof path !== 'string' || !path.startsWith(SOLID_SCRIPT_FILE_RESOURCES)) continue;
    const file = zip.entry(path);
    if (!file) continue;
    try {
      read.push(JSON.parse(await (await zip.read(file)).text()));
    } catch {
      continue;
    }
  }
  return solidScriptResourcesNormalize(read);
}
