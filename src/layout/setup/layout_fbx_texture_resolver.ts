import { textCount } from '@/utils/utils_plural.js';
import type { GlbImportTextureResolution } from '@/io/glb/import/glb_import_types.js';
import type { FbxImportTexture, FbxImportTextureResolver } from '@/io/fbx/import/fbx_import_types.js';
import { fbxImportTexturePathFind } from '@/io/fbx/import/textures/fbx_import_texture_lookup.js';
import { ProjectScanner } from '@/project/scan/project_scanner.js';
import { textureSourceBlocked } from '@/texture/library/texture_source_gate.js';
import { textureEmbeddedExtensionOf } from '@/texture/embedded/texture_embedded_id.js';
import {
  LayoutGlbTextureResolver,
  layoutRoomTextureReferences,
  type LayoutGlbTextureResolverParts,
} from './layout_glb_texture_resolver.js';

/** Most missing file names listed in the status note. */
const LAYOUT_FBX_MISSING_NAMES_SHOWN = 3;

/**
 * Chooses the texture of every diffuse map of an FBX import: embedded images
 * become embedded textures of the level like GLB images; images the FBX names
 * as files are looked up among the project's textures (next to the FBX first,
 * then by file name) and keep the checker when the project lacks them.
 */
export class LayoutFbxTextureResolver implements FbxImportTextureResolver {
  /**
   * Creates the resolver for one import.
   *
   * @param parts Editor parts.
   * @param fbxFolder Project folder of the FBX file, or null when outside.
   */
  constructor(
    private readonly parts: LayoutGlbTextureResolverParts,
    private readonly fbxFolder: string | null,
  ) {}

  /**
   * Resolves texture ids for the diffuse maps.
   *
   * @param textures Diffuse maps.
   * @returns Texture ids and a status note.
   */
  async resolve(textures: readonly FbxImportTexture[]): Promise<GlbImportTextureResolution> {
    if (textures.length > 0 && textureSourceBlocked() !== null) return this.memberResolve(textures);
    const images = textures.flatMap((texture) => (texture.image === null ? [] : [texture.image]));
    const embedded = await new LayoutGlbTextureResolver(this.parts).resolve(images);
    const external = this.externalResolve(textures.filter((texture) => texture.image === null));
    const notes = [...new Set([embedded.note, external.note])].filter(
      (note): note is string => note !== null && note !== '',
    );
    return {
      textureIdByImage: new Map([...embedded.textureIdByImage, ...external.textureIdByImage]),
      note: notes.length > 0 ? notes.join('; ') : null,
    };
  }

  /**
   * A room member's references: the content hash of every image it can read
   * (embedded, or a file in its own open project folder; the bytes stay with
   * the member and the owner trusts the hash), else the file name.
   *
   * @param textures Diffuse maps.
   * @returns Texture ids and a status note.
   */
  private async memberResolve(textures: readonly FbxImportTexture[]): Promise<GlbImportTextureResolution> {
    const paths = textures.some((texture) => texture.image === null) ? await this.memberTexturePaths() : [];
    const images = [];
    for (const texture of textures) {
      const image = texture.image ?? (await this.memberFileRead(paths, texture.references));
      const fileName = texture.references[0]?.replace(/^.*[\\/]/, '');
      images.push({
        index: texture.index,
        name:
          texture.image !== null
            ? `${texture.image.name || texture.name}.${textureEmbeddedExtensionOf(texture.image.bytes, texture.image.mimeType)}`
            : fileName || `${texture.name}.png`,
        ...(image !== null ? { image } : {}),
      });
    }
    return layoutRoomTextureReferences(images);
  }

  /**
   * Lists the texture files of the member's own open project folder.
   *
   * @returns Project paths, empty without a readable folder.
   */
  private async memberTexturePaths(): Promise<string[]> {
    const fileSystem = this.parts.projectEditor()?.project.fileSystem() ?? null;
    if (fileSystem === null) return [];
    try {
      const snapshot = await new ProjectScanner().scan(fileSystem);
      return [...snapshot.files.values()].filter((record) => record.kind === 'texture').map((record) => record.path);
    } catch {
      return [];
    }
  }

  /**
   * Reads the image file an FBX names from the member's own project folder.
   *
   * @param paths Texture paths of that folder.
   * @param references Paths the FBX names.
   * @returns Bytes, or null when the file is not there or unreadable.
   */
  private async memberFileRead(
    paths: readonly string[],
    references: readonly string[],
  ): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    const fileSystem = this.parts.projectEditor()?.project.fileSystem() ?? null;
    const path = fileSystem === null ? null : fbxImportTexturePathFind(paths, this.fbxFolder, references);
    if (fileSystem === null || path === null) return null;
    try {
      const file = await fileSystem.fileRead(path);
      return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type };
    } catch {
      return null;
    }
  }

  /**
   * Looks up the image files of the textures among the project's textures.
   *
   * @param textures Textures whose image is a file.
   * @returns Texture ids of the found files and a note on the missing ones.
   */
  private externalResolve(textures: readonly FbxImportTexture[]): GlbImportTextureResolution {
    const textureIds = this.projectTextureIds();
    const found = new Map<number, string>();
    const missing: string[] = [];
    for (const texture of textures) {
      const id = fbxImportTexturePathFind(textureIds, this.fbxFolder, texture.references);
      if (id === null) missing.push(texture.references[0]?.replace(/^.*[\\/]/, '') || texture.name);
      else found.set(texture.index, id);
    }
    return { textureIdByImage: found, note: layoutFbxTextureNote(found.size, missing, textureIds.length > 0) };
  }

  /**
   * Lists the textures of the open project folder.
   *
   * @returns Project-relative texture paths, empty without a project.
   */
  private projectTextureIds(): string[] {
    const editor = this.parts.projectEditor();
    const library = this.parts.library();
    if (editor === null || library === null || editor.project.fileSystem() === null) return [];
    const files = editor.project.snapshot().files;
    return library
      .getEntries()
      .filter((entry) => files.get(entry.id)?.kind === 'texture')
      .map((entry) => entry.id);
  }
}

/**
 * Describes the outcome of the file lookups.
 *
 * @param foundCount Textures found in the project.
 * @param missing File names not found.
 * @param projectHasTextures Whether a project with textures is open.
 * @returns Note, or null when there were no file textures.
 */
function layoutFbxTextureNote(
  foundCount: number,
  missing: readonly string[],
  projectHasTextures: boolean,
): string | null {
  const parts: string[] = [];
  if (foundCount > 0) parts.push(`linked ${textCount(foundCount, 'texture')} from the project`);
  if (missing.length > 0) {
    const shown = missing.slice(0, LAYOUT_FBX_MISSING_NAMES_SHOWN).join(', ');
    const more =
      missing.length > LAYOUT_FBX_MISSING_NAMES_SHOWN
        ? ` and ${missing.length - LAYOUT_FBX_MISSING_NAMES_SHOWN} more`
        : '';
    const where = projectHasTextures
      ? 'not found in the project'
      : 'kept on the checker: open the project folder holding them';
    parts.push(`${textCount(missing.length, 'texture file')} ${where} (${shown}${more})`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}
