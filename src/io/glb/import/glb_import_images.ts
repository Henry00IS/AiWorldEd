import { textureImageSniff } from '@/texture/library/texture_image_sniff.js';
import type { GlbImportDocument } from './glb_import_document_loader.js';
import type { GlbImportJson, GlbImportJsonImage } from './glb_import_json.js';
import type { GlbImportImage } from './glb_import_types.js';

/** Longest image name kept from a GLB, in characters. */
const GLB_IMPORT_IMAGE_NAME_MAXIMUM = 64;

/**
 * Returns the glTF image index a material uses as its base color, following a
 * texture's plain source or an image extension's source (WebP, AVIF, KTX2).
 *
 * @param json GlTF JSON.
 * @param materialIndex Material index, or undefined for the default material.
 * @returns Image index, or null when the material has no base color image.
 */
export function glbImportMaterialImageIndex(json: GlbImportJson, materialIndex: number | undefined): number | null {
  if (materialIndex === undefined) return null;
  const textureIndex = json.materials?.[materialIndex]?.pbrMetallicRoughness?.baseColorTexture?.index;
  if (textureIndex === undefined) return null;
  const texture = json.textures?.[textureIndex];
  if (texture === undefined) return null;
  if (texture.source !== undefined) return texture.source;
  const extensionSource = Object.values(texture.extensions ?? {}).find((entry) => entry.source !== undefined);
  return extensionSource?.source ?? null;
}

/**
 * Reads the encoded bytes of every embedded image a GLB material uses as its
 * base color. External image files and unsupported formats are left out.
 */
export class GlbImportImageReader {
  /**
   * Reads the base color images of a document.
   *
   * @param document Parsed document.
   * @returns Images in glTF image index order.
   */
  async read(document: GlbImportDocument): Promise<GlbImportImage[]> {
    const indices = glbImportUsedImageIndices(document.json);
    const images = await Promise.all(indices.map((index) => this.readOne(document, index)));
    return images.filter((image): image is GlbImportImage => image !== null);
  }

  /**
   * Reads one image.
   *
   * @param document Parsed document.
   * @param index Image index.
   * @returns Image, or null when it is external, unreadable or not a raster.
   */
  private async readOne(document: GlbImportDocument, index: number): Promise<GlbImportImage | null> {
    const source = document.json.images?.[index];
    if (source === undefined) return null;
    const bytes = await glbImportImageBytes(document, source).catch(() => null);
    if (bytes === null) return null;
    const sniffed = textureImageSniff(bytes);
    if (sniffed === null) return null;
    return { index, name: glbImportImageName(document.json, index), mimeType: sniffed.mime, bytes };
  }
}

/**
 * Lists the image indices materials use as base color, without duplicates.
 *
 * @param json GlTF JSON.
 * @returns Sorted image indices.
 */
function glbImportUsedImageIndices(json: GlbImportJson): number[] {
  const used = new Set<number>();
  (json.materials ?? []).forEach((_material, materialIndex) => {
    const imageIndex = glbImportMaterialImageIndex(json, materialIndex);
    if (imageIndex !== null) used.add(imageIndex);
  });
  return [...used].sort((a, b) => a - b);
}

/**
 * Reads the bytes of an image from its buffer view or data URI.
 *
 * @param document Parsed document.
 * @param image Image definition.
 * @returns Bytes, or null for external files.
 */
async function glbImportImageBytes(document: GlbImportDocument, image: GlbImportJsonImage): Promise<Uint8Array | null> {
  if (image.bufferView !== undefined) {
    const view: ArrayBuffer = await document.parser.getDependency('bufferView', image.bufferView);
    return new Uint8Array(view.slice(0));
  }
  if (image.uri?.startsWith('data:')) return glbImportDataUriBytes(image.uri);
  return null;
}

/**
 * Decodes a base64 data URI.
 *
 * @param uri Data URI.
 * @returns Bytes, or null when the URI is not base64.
 */
function glbImportDataUriBytes(uri: string): Uint8Array | null {
  const marker = ';base64,';
  const start = uri.indexOf(marker);
  if (start < 0) return null;
  const binary = atob(uri.slice(start + marker.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Picks a file-safe name for an image: its own name, else the name of a
 * material using it, else "image_<index>".
 *
 * @param json GlTF JSON.
 * @param index Image index.
 * @returns Name without extension.
 */
function glbImportImageName(json: GlbImportJson, index: number): string {
  const ownName = json.images?.[index]?.name ?? '';
  const materialName =
    (json.materials ?? []).find(
      (_material, materialIndex) => glbImportMaterialImageIndex(json, materialIndex) === index,
    )?.name ?? '';
  const candidates = [ownName, materialName].map(glbImportFileNameSanitize);
  return candidates.find((candidate) => candidate.length > 0) ?? `image_${index}`;
}

/**
 * Removes folders, the extension and characters that are unsafe in file names.
 *
 * @param name Raw name.
 * @returns Safe stem, possibly empty.
 */
export function glbImportFileNameSanitize(name: string): string {
  const stem = name
    .replace(/^.*[\\/]/, '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[^A-Za-z0-9 _.-]+/g, '_')
    .replace(/^[ .]+|[ .]+$/g, '');
  return stem.slice(0, GLB_IMPORT_IMAGE_NAME_MAXIMUM);
}
