import { createTextureBrowserEntry, type TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { textureLibraryContentFind } from '@/texture/library/texture_library_alias.js';
import { textureEmbeddedIdParse, textureEmbeddedMime } from './texture_embedded_id.js';

/** A texture that is not a project file: its bytes travel inside the level. */
export interface TextureEmbedded {
  /** Texture id ("embedded:<sha256>.<ext>"). */
  id: string;
  /** Readable name shown instead of the hash. */
  name: string;
  /** Image bytes; may be a lazy slice of the level file. */
  blob: Blob;
}

/**
 * Builds the texture library entry of an embedded texture.
 *
 * @param texture Embedded texture.
 * @returns Entry listed under the texture's id and name.
 */
export function textureEmbeddedEntry(texture: TextureEmbedded): TextureBrowserEntry {
  const extension = textureEmbeddedIdParse(texture.id)?.extension ?? 'png';
  const fileName = texture.name.toLowerCase().endsWith(`.${extension}`) ? texture.name : `${texture.name}.${extension}`;
  const entry = createTextureBrowserEntry(
    new File([texture.blob], fileName, { type: textureEmbeddedMime(texture.id) }),
    texture.id,
  );
  entry.displayName = texture.name;
  const hash = textureEmbeddedIdParse(texture.id)?.hash;
  if (hash !== undefined) entry.sha256 = hash;
  return entry;
}

/**
 * Lists embedded textures in the library, replacing same-id entries.
 *
 * @param library Texture library.
 * @param textures Embedded textures.
 */
export function textureEmbeddedAdd(library: TextureLibrary, textures: readonly TextureEmbedded[]): void {
  if (textures.length > 0) library.entriesUpsert(textures.map((texture) => textureEmbeddedEntry(texture)));
}

/**
 * Lets listed embedded textures read their bytes from a new place (the level
 * file just saved) without reloading anything: the entries keep their identity,
 * so textures already shown stay as they are.
 *
 * @param library Texture library.
 * @param textures Embedded textures at their new place.
 */
export function textureEmbeddedRepoint(library: TextureLibrary, textures: readonly TextureEmbedded[]): void {
  for (const texture of textures) {
    const entry = library.getEntryById(texture.id);
    if (entry === null) continue;
    const fresh = textureEmbeddedEntry({ ...texture, name: entry.displayName });
    URL.revokeObjectURL(entry.previewObjectUrl);
    entry.sourceFile = fresh.sourceFile;
    entry.previewObjectUrl = fresh.previewObjectUrl;
  }
}

/**
 * Reads listed embedded textures into memory, so they stay readable once the
 * file their bytes come from is written over. Unreadable ones are left as they
 * are.
 *
 * @param library Texture library.
 * @param ids Embedded texture ids.
 */
export async function textureEmbeddedDetach(library: TextureLibrary, ids: Iterable<string>): Promise<void> {
  const textures = textureEmbeddedCollect(library, ids).found;
  const loaded = await Promise.all(
    textures.map((texture) =>
      texture.blob.arrayBuffer().then(
        (bytes) => ({ ...texture, blob: new Blob([bytes], { type: texture.blob.type }) }),
        () => null,
      ),
    ),
  );
  textureEmbeddedRepoint(
    library,
    loaded.filter((texture): texture is TextureEmbedded => texture !== null),
  );
}

/**
 * Collects the embedded textures a level uses from the library: the entry of
 * the id itself, else any entry with the same content (the embedded texture
 * under another extension, or a project file with those bytes), as the editor
 * shows it.
 *
 * @param library Texture library, or null.
 * @param ids Embedded texture ids the level uses.
 * @returns Textures found, and the ids the library lacks.
 */
export function textureEmbeddedCollect(
  library: TextureLibrary | null,
  ids: Iterable<string>,
): { found: TextureEmbedded[]; missing: string[] } {
  const found: TextureEmbedded[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const entry = library === null ? null : textureLibraryContentFind(library, id);
    if (entry === null) missing.push(id);
    else found.push({ id, name: entry.displayName, blob: entry.sourceFile });
  }
  return { found, missing };
}

/**
 * Keeps the embedded textures whose bytes can still be read: a lazy slice of a
 * level file fails once that file was replaced or deleted outside the editor.
 *
 * @param textures Embedded textures.
 * @returns The readable ones, in order.
 */
export async function textureEmbeddedReadable(textures: readonly TextureEmbedded[]): Promise<TextureEmbedded[]> {
  const readable = await Promise.all(
    textures.map((texture) =>
      texture.blob
        .slice(0, 1)
        .arrayBuffer()
        .then(
          () => true,
          () => false,
        ),
    ),
  );
  return textures.filter((_texture, index) => readable[index]);
}
