import { textCount } from '@/utils/utils_plural.js';
import { GlbImportTextureResolverChecker } from '@/io/glb/import/glb_import_texture_resolver_checker.js';
import type {
  GlbImportImage,
  GlbImportTextureResolution,
  GlbImportTextureResolver,
} from '@/io/glb/import/glb_import_types.js';
import type { ControllerProjectEditor } from '@/project/host/controller_project_editor.js';
import {
  textureEmbeddedExtensionOf,
  textureEmbeddedIdOf,
  textureEmbeddedMime,
} from '@/texture/embedded/texture_embedded_id.js';
import { textureEmbeddedAdd, type TextureEmbedded } from '@/texture/embedded/texture_embedded_library.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { textureSourceBlocked } from '@/texture/library/texture_source_gate.js';

/** Editor parts the GLB texture step uses. */
export interface LayoutGlbTextureResolverParts {
  /** Project editor, or null where project folders are unavailable. */
  projectEditor: () => ControllerProjectEditor | null;
  /** Texture library the level's textures are listed in, or null. */
  library: () => TextureLibrary | null;
}

/**
 * Turns the embedded images of a GLB import into embedded textures of the level
 * ("embedded:<sha256>.<ext>"): they are listed in the texture library and saved
 * inside the .aiworld file, with or without an open project folder. Identical
 * bytes share one texture id, within an import and across imports. Room members
 * add no textures: see {@link layoutRoomTextureReferences}.
 */
export class LayoutGlbTextureResolver implements GlbImportTextureResolver {
  /**
   * Creates the resolver for one import.
   *
   * @param parts Editor parts.
   */
  constructor(private readonly parts: LayoutGlbTextureResolverParts) {}

  /**
   * Resolves texture ids for the embedded images.
   *
   * @param images Embedded images.
   * @returns Texture ids and a status note.
   */
  async resolve(images: readonly GlbImportImage[]): Promise<GlbImportTextureResolution> {
    if (images.length === 0) return { textureIdByImage: new Map(), note: null };
    if (textureSourceBlocked() !== null)
      return layoutRoomTextureReferences(
        images.map((image) => ({ index: image.index, name: layoutGlbImageFileName(image), image })),
      );
    const library = this.parts.library();
    if (library === null)
      return new GlbImportTextureResolverChecker('textures kept on the checker: no texture library here').resolve(
        images,
      );
    return layoutGlbTexturesEmbed(library, images);
  }
}

/**
 * Lists the images as embedded textures, keeping entries the library already
 * has untouched.
 *
 * @param library Texture library.
 * @param images Embedded images.
 * @returns Texture ids and a note with the counts.
 */
async function layoutGlbTexturesEmbed(
  library: TextureLibrary,
  images: readonly GlbImportImage[],
): Promise<GlbImportTextureResolution> {
  const textureIdByImage = new Map<number, string>();
  const added = new Map<string, TextureEmbedded>();
  let reused = 0;
  for (const image of images) {
    const id = await textureEmbeddedIdOf(image.bytes, image.mimeType);
    textureIdByImage.set(image.index, id);
    if (added.has(id)) continue;
    if (library.getEntryById(id) !== null) reused++;
    else added.set(id, { id, name: image.name || `texture${image.index}`, blob: layoutGlbImageBlob(image, id) });
  }
  textureEmbeddedAdd(library, [...added.values()]);
  return { textureIdByImage, note: layoutGlbTextureNote(added.size, reused) };
}

/**
 * Wraps the bytes of an image in a blob of the id's MIME type.
 *
 * @param image Embedded image.
 * @param id Texture id.
 * @returns Image blob.
 */
function layoutGlbImageBlob(image: GlbImportImage, id: string): Blob {
  return new Blob([new Uint8Array(image.bytes)], { type: textureEmbeddedMime(id) });
}

/**
 * Returns the file name an image is known by: its name and the extension of its
 * bytes.
 *
 * @param image Embedded image.
 * @returns File name.
 */
function layoutGlbImageFileName(image: GlbImportImage): string {
  return `${image.name || `texture${image.index}`}.${textureEmbeddedExtensionOf(image.bytes, image.mimeType)}`;
}

/**
 * Describes what happened to the images.
 *
 * @param addedCount Textures added to the level.
 * @param reusedCount Images the library already listed.
 * @returns Status note.
 */
function layoutGlbTextureNote(addedCount: number, reusedCount: number): string {
  const parts: string[] = [];
  if (addedCount > 0) parts.push(`embedded ${textCount(addedCount, 'new texture')} in the level`);
  if (reusedCount > 0) parts.push(`reused ${textCount(reusedCount, 'texture')}`);
  return parts.join(', ');
}

/** Note on a room member's import whose textures stay with the member. */
export const LAYOUT_ROOM_TEXTURE_NOTE = 'textures not added to the room: they show as missing until the room owner has';

/** Image of a room member's import: its file name and, when embedded, its bytes. */
export interface LayoutRoomTextureImage {
  index: number;
  name: string;
  image?: { bytes: Uint8Array; mimeType: string };
}

/**
 * Keeps a room member's model textures as references: nothing is stored or
 * sent, and the faces show the pink missing-texture checker until the room
 * owner has the texture, then update by themselves. An image the member could
 * read (embedded, or a file in its own open project folder) is referenced by
 * the embedded id the owner's import of the same bytes produces
 * ("embedded:<sha256>.<ext>"), which also matches an owner project file with
 * those bytes. An image file the member cannot read is referenced by its file
 * name, which matches the one owner texture of that name.
 *
 * @param images Image index, file name and embedded bytes.
 * @returns Texture ids and a note naming the files.
 */
export async function layoutRoomTextureReferences(
  images: readonly LayoutRoomTextureImage[],
): Promise<GlbImportTextureResolution> {
  const textureIdByImage = new Map<number, string>();
  for (const { index, name, image } of images)
    textureIdByImage.set(
      index,
      image === undefined ? name.replace(/[\\/:*?"<>|]/g, '_') : await textureEmbeddedIdOf(image.bytes, image.mimeType),
    );
  const names = [...new Set(images.map((image) => image.name))];
  const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ', …' : '');
  return { textureIdByImage, note: names.length > 0 ? `${LAYOUT_ROOM_TEXTURE_NOTE} ${shown}` : null };
}
