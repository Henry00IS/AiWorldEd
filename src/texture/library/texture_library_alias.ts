import { textureEmbeddedIdIs, textureEmbeddedIdParse } from '@/texture/embedded/texture_embedded_id.js';
import type { TextureBrowserEntry } from './texture_browser_entry.js';
import { isDefaultCheckerTextureId } from './texture_id.js';
import type { TextureLibrary } from './texture_library.js';

/**
 * Finds the file a texture id means when no file has that exact id: an embedded
 * id ("embedded:<sha256>.<ext>") matches the embedded texture of the same
 * content under any extension, or else a project file with those bytes (its
 * hash known from the project's hash cache), and any other id matches by its
 * file name the one texture of that name anywhere in the project, a project
 * file by its file name or an embedded one by the name it was imported under. A
 * name two textures share matches neither. The id itself never changes, so a
 * level keeps what it referenced. The lookup table is rebuilt when the library
 * revision changes.
 */
export class TextureLibraryAlias {
  private library: TextureLibrary | null = null;
  private revision = -1;
  private readonly keys = new Map<string, TextureBrowserEntry | null>();

  /**
   * Resolves an id to a library file.
   *
   * @param library Library, or null.
   * @param id Texture id.
   * @returns Exact entry, the unique alias match, or null.
   */
  resolve(library: TextureLibrary | null, id: string): TextureBrowserEntry | null {
    if (library === null) return null;
    const exact = library.getEntryById(id);
    if (exact !== null) return exact;
    if (library !== this.library || library.getRevision() !== this.revision) this.rebuild(library);
    return this.keys.get(textureLibraryAliasKey(id)) ?? null;
  }

  /**
   * Indexes every entry under its alias keys; keys two entries share map to
   * null. Entries with the same bytes are interchangeable, so a hash key keeps
   * the embedded entry, else the first one. An embedded name without an
   * extension ("sign" from a model) also matches with it ("sign.png").
   *
   * @param library Library.
   */
  private rebuild(library: TextureLibrary): void {
    this.library = library;
    this.revision = library.getRevision();
    this.keys.clear();
    for (const entry of library.getEntries()) {
      if (isDefaultCheckerTextureId(entry.id)) continue;
      const keys = new Set<string>();
      const embedded = textureEmbeddedIdParse(entry.id);
      const hash = embedded?.hash ?? entry.sha256;
      if (hash !== undefined) {
        const key = `hash:${hash}`;
        const known = this.keys.get(key);
        if (known === undefined || (embedded !== null && known !== null && !textureEmbeddedIdIs(known.id)))
          this.keys.set(key, entry);
      }
      if (embedded !== null) {
        const name = /\.[a-z0-9]+$/i.test(entry.displayName)
          ? entry.displayName
          : `${entry.displayName}.${embedded.extension}`;
        keys.add(textureLibraryNameKey(name));
      } else keys.add(textureLibraryNameKey(entry.fileName));
      keys.forEach((key) => {
        const known = this.keys.get(key);
        this.keys.set(key, known === undefined || known === entry ? entry : null);
      });
    }
  }
}

/**
 * Finds a file with the content an embedded id names: the id itself, the
 * embedded texture under another extension, or a project file with the same
 * hash.
 *
 * @param library Library.
 * @param id Texture id.
 * @returns Entry, or null (also for ids that are not embedded ids).
 */
export function textureLibraryContentFind(library: TextureLibrary, id: string): TextureBrowserEntry | null {
  const exact = library.getEntryById(id);
  const hash = textureEmbeddedIdParse(id)?.hash;
  if (exact !== null || hash === undefined) return exact;
  const entries = library.getEntries();
  return (
    entries.find((entry) => textureEmbeddedIdParse(entry.id)?.hash === hash) ??
    entries.find((entry) => entry.sha256 === hash) ??
    null
  );
}

/**
 * Returns the key an id is looked up under.
 *
 * @param id Texture id.
 * @returns Hash key for embedded ids, name key otherwise.
 */
function textureLibraryAliasKey(id: string): string {
  const hash = textureEmbeddedIdIs(id) ? textureEmbeddedIdParse(id)?.hash : undefined;
  return hash !== undefined ? `hash:${hash}` : textureLibraryNameKey(id);
}

/**
 * Returns the name key of a file name or path: its last segment, lower case.
 *
 * @param name File name or path.
 * @returns Name key.
 */
function textureLibraryNameKey(name: string): string {
  return `name:${name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1).toLowerCase()}`;
}
