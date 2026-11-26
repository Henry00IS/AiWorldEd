import { curveFileNameReadable, curveFileRead } from '@/curve/model/curve_file.js';
import { pathFileNameReadable, pathFileRead } from '@/path/model/path_file.js';
import { isImageFileName } from '@/texture/library/image_file_filter.js';
import {
  solidScriptResourceCurve,
  solidScriptResourceNameFree,
  type SolidScriptResource,
} from './solid_script_resource.js';
import { solidScriptResourceTextureEmbed } from './solid_script_resource_texture.js';

/** A resource made from a file, or why the file does not fit. */
export type SolidScriptResourceFileRead = SolidScriptResource | { error: string };

/**
 * Makes a resource from a dropped image, curve or path file, named after the
 * file; an image is copied into the script.
 *
 * @param file File.
 * @param taken Resources the script already has.
 * @returns Resource, or the problem.
 */
export async function solidScriptResourceFromFile(
  file: File,
  taken: readonly SolidScriptResource[],
): Promise<SolidScriptResourceFileRead> {
  const name = solidScriptResourceNameFree(taken, solidScriptResourceNameOfFile(file.name));
  if (isImageFileName(file.name)) {
    const textureId = await solidScriptResourceTextureEmbed(file, name);
    return textureId === null ? { error: `${file.name} is not an image.` } : { name, kind: 'Texture', textureId };
  }
  if (pathFileNameReadable(file.name)) {
    const read = pathFileRead(await file.text());
    return 'error' in read ? read : { name, kind: 'Path', path: read.path };
  }
  if (curveFileNameReadable(file.name)) {
    const read = curveFileRead(await file.text());
    return 'error' in read ? read : solidScriptResourceCurve(name, read.curve);
  }
  return { error: `${file.name} is not a texture, curve or path file.` };
}

/**
 * Turns a file name into a resource name, such as stone wall.png into
 * Stone_wall.
 *
 * @param fileName File name, maybe with folders.
 * @returns Name.
 */
export function solidScriptResourceNameOfFile(fileName: string): string {
  const base = fileName
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]*$/, '')
    .replace(/\W+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!/^[A-Za-z]/.test(base)) return `Resource${base}`;
  return base[0]!.toUpperCase() + base.slice(1);
}
