import type { ZipReader } from '@/io/zip/zip_reader.js';
import type { ZipWriter } from '@/io/zip/zip_writer.js';
import {
  solidScriptResourcesNormalize,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';
import {
  solidScriptResourceTextureBlob,
  solidScriptResourceTextureEmbed,
} from '@/solid_script/document/solid_script_resource_texture.js';
import { textureEmbeddedIdParse } from '@/texture/embedded/texture_embedded_id.js';

/** Folder of a script file that holds its resources. */
export const SOLID_SCRIPT_FILE_RESOURCES = 'resources/';

/** File ending and type of each resource kind inside a script file. */
const SOLID_SCRIPT_FILE_RESOURCE_TYPES: Readonly<Record<SolidScriptResource['kind'], readonly [string, string]>> = {
  Texture: ['texture.json', 'application/x-aiworlded-texture'],
  Curve: ['curve.json', 'application/x-aiworlded-curve'],
  Path: ['path.json', 'application/x-aiworlded-path'],
  Text: ['txt', 'text/plain'],
};

/** A resource listed in script.json: where its file is and what it holds. */
export interface SolidScriptFileResource {
  /** Zip entry path, under resources/. */
  path: string;
  /** MIME type. */
  type: string;
  /** Name the script reads it by. */
  name: string;
  /** Texture, Curve, Path or Text. */
  kind: SolidScriptResource['kind'];
  /** Zip entry path of a texture's image, under resources/. */
  image?: string;
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
  for (const resource of resources) listed.push(await solidScriptFileResourceWrite(writer, resource));
  return listed;
}

/**
 * Writes one resource as its own file under resources/.
 *
 * @param writer Zip being written.
 * @param resource Resource.
 * @returns List entry for script.json.
 */
async function solidScriptFileResourceWrite(
  writer: ZipWriter,
  resource: SolidScriptResource,
): Promise<SolidScriptFileResource> {
  const [ending, type] = SOLID_SCRIPT_FILE_RESOURCE_TYPES[resource.kind];
  const path = `${SOLID_SCRIPT_FILE_RESOURCES}${resource.name}.${ending}`;
  await writer.addText(path, resource.kind === 'Text' ? resource.text : JSON.stringify(resource, null, 2));
  const image =
    resource.kind === 'Texture' ? await solidScriptFileImageWrite(writer, resource.name, resource.textureId) : null;
  return { path, type, name: resource.name, kind: resource.kind, ...(image ? { image } : {}) };
}

/**
 * Writes the image of a texture resource next to it, so the script carries its
 * own copy.
 *
 * @param writer Zip being written.
 * @param name Resource name.
 * @param id Texture id.
 * @returns Zip entry path, or null when the image is not at hand.
 */
async function solidScriptFileImageWrite(writer: ZipWriter, name: string, id: string): Promise<string | null> {
  const blob = solidScriptResourceTextureBlob(id);
  if (!blob) return null;
  const path = `${SOLID_SCRIPT_FILE_RESOURCES}${name}.${textureEmbeddedIdParse(id)?.extension ?? 'png'}`;
  await writer.addBlob(path, blob);
  return path;
}

/**
 * Reads the image of a texture resource back into the texture library, and
 * gives the resource the id of those bytes.
 *
 * @param zip Script file.
 * @param entry Listed resource.
 * @param resource Resource read from its file.
 * @returns Resource.
 */
async function solidScriptFileImageRead(zip: ZipReader, entry: unknown, resource: unknown): Promise<unknown> {
  const image = (entry as { image?: unknown }).image;
  const file = typeof image === 'string' && image.startsWith(SOLID_SCRIPT_FILE_RESOURCES) ? zip.entry(image) : null;
  if (!file || typeof resource !== 'object' || resource === null) return resource;
  const name = String((resource as { name?: unknown }).name ?? 'Texture');
  const textureId = await solidScriptResourceTextureEmbed(await zip.read(file), name);
  return textureId === null ? resource : { ...resource, textureId };
}

/**
 * Tells whether a listed resource is a text file, saved as raw words rather
 * than JSON.
 *
 * @param entry Listed resource.
 * @param path Zip entry path.
 * @returns True for a Text resource.
 */
function solidScriptFileResourceIsText(entry: unknown, path: string): boolean {
  return (entry as { kind?: unknown }).kind === 'Text' || path.toLowerCase().endsWith('.txt');
}

/**
 * Reads one listed resource from its file under resources/.
 *
 * @param zip Script file.
 * @param entry Listed resource.
 * @param path Zip entry path.
 * @param file Zip entry.
 * @returns Resource as stored, or undefined when it is not a resource.
 */
async function solidScriptFileResourceRead(
  zip: ZipReader,
  entry: unknown,
  path: string,
  file: NonNullable<ReturnType<ZipReader['entry']>>,
): Promise<unknown> {
  const body = await (await zip.read(file)).text();
  if (!solidScriptFileResourceIsText(entry, path)) return solidScriptFileImageRead(zip, entry, JSON.parse(body));
  const listed = (entry as { name?: unknown }).name;
  const fromPath = path.slice(SOLID_SCRIPT_FILE_RESOURCES.length).replace(/\.txt$/i, '');
  const name = typeof listed === 'string' && listed !== '' ? listed : fromPath;
  return { name, kind: 'Text', text: body };
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
      const loaded = await solidScriptFileResourceRead(zip, entry, path, file);
      if (loaded !== undefined) read.push(loaded);
    } catch {
      continue;
    }
  }
  return solidScriptResourcesNormalize(read);
}
