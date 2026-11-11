import { sceneTextureIds } from '@/io/scene/scene_texture_ids.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import {
  PROJECT_EDITOR_TEXTURE_CACHE_DIRECTORY,
  projectEditorFolderPrepare,
} from '@/project/fs/project_editor_folder.js';
import {
  textureEmbeddedFallbackName,
  textureEmbeddedIdIs,
  textureEmbeddedIdParse,
  textureEmbeddedMime,
} from '@/texture/embedded/texture_embedded_id.js';
import {
  textureEmbeddedAdd,
  textureEmbeddedCollect,
  type TextureEmbedded,
} from '@/texture/embedded/texture_embedded_library.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { sha256Hex } from '@/utils/utils_sha256.js';

/**
 * Lists the embedded texture ids a level, autosave or snapshot uses.
 *
 * @param value Scene data.
 * @returns Embedded ids.
 */
export function projectTextureCacheIds(value: unknown): string[] {
  return [...sceneTextureIds(value)].filter(textureEmbeddedIdIs);
}

/**
 * Returns the project path of a cached texture's image.
 *
 * @param hash SHA-256 of the image.
 * @param extension Image extension.
 * @returns Path in AiWorldEd/.Local/TextureCache.
 */
export function projectTextureCacheImagePath(hash: string, extension: string): string {
  return `${PROJECT_EDITOR_TEXTURE_CACHE_DIRECTORY}/${hash}.${extension}`;
}

/**
 * Returns the project path of the file holding a cached texture's name.
 *
 * @param hash SHA-256 of the image.
 * @returns Path in AiWorldEd/.Local/TextureCache.
 */
export function projectTextureCacheNamePath(hash: string): string {
  return `${PROJECT_EDITOR_TEXTURE_CACHE_DIRECTORY}/${hash}.json`;
}

/**
 * Copies the embedded textures scene data uses into the project's texture cache
 * ("<sha256>.<ext>" with "<sha256>.json" holding the name), so autosaves and
 * room snapshots, which are plain JSON, can show them again. Only what the
 * cache lacks is written; a texture whose bytes cannot be read is skipped.
 *
 * @param fileSystem Project folder.
 * @param library Texture library holding the textures, or null.
 * @param value Scene data.
 */
export async function projectTextureCacheKeep(
  fileSystem: ProjectFileSystem,
  library: TextureLibrary | null,
  value: unknown,
): Promise<void> {
  const { found } = textureEmbeddedCollect(library, projectTextureCacheIds(value));
  if (found.length === 0) return;
  await projectEditorFolderPrepare(fileSystem);
  const names = await projectTextureCacheNames(fileSystem);
  for (const texture of found) {
    const parts = textureEmbeddedIdParse(texture.id)!;
    if (names.has(`${parts.hash}.${parts.extension}`)) continue;
    await projectTextureCacheWrite(fileSystem, texture).catch(() => undefined);
  }
}

/**
 * Lists the embedded textures scene data uses that the library lacks, from the
 * project's texture cache. Images whose bytes no longer match their hash are
 * skipped.
 *
 * @param fileSystem Project folder.
 * @param library Texture library to fill.
 * @param value Scene data.
 * @returns Number of textures listed.
 */
export async function projectTextureCacheRestore(
  fileSystem: ProjectFileSystem,
  library: TextureLibrary,
  value: unknown,
): Promise<number> {
  const missing = projectTextureCacheIds(value).filter((id) => library.getEntryById(id) === null);
  if (missing.length === 0) return 0;
  const textures: TextureEmbedded[] = [];
  for (const id of missing) {
    const texture = await projectTextureCacheRead(fileSystem, id).catch(() => null);
    if (texture !== null) textures.push(texture);
  }
  textureEmbeddedAdd(library, textures);
  return textures.length;
}

/**
 * Lists the file names in the texture cache.
 *
 * @param fileSystem Project folder.
 * @returns File names.
 */
async function projectTextureCacheNames(fileSystem: ProjectFileSystem): Promise<Set<string>> {
  const entries = await fileSystem.directoryList(PROJECT_EDITOR_TEXTURE_CACHE_DIRECTORY, () => false);
  return new Set(entries.filter((entry) => entry.kind === 'file').map((entry) => entry.name));
}

/**
 * Writes one texture into the cache: its name first, then its image, so a
 * listed image always has its name.
 *
 * @param fileSystem Project folder.
 * @param texture Embedded texture.
 */
async function projectTextureCacheWrite(fileSystem: ProjectFileSystem, texture: TextureEmbedded): Promise<void> {
  const parts = textureEmbeddedIdParse(texture.id)!;
  const bytes = new Uint8Array(await texture.blob.arrayBuffer());
  await fileSystem.fileWrite(projectTextureCacheNamePath(parts.hash), JSON.stringify({ name: texture.name }));
  await fileSystem.fileWrite(projectTextureCacheImagePath(parts.hash, parts.extension), new Blob([bytes]));
}

/**
 * Reads one texture from the cache.
 *
 * @param fileSystem Project folder.
 * @param id Embedded texture id.
 * @returns Texture, or null when its bytes do not match the id.
 */
async function projectTextureCacheRead(fileSystem: ProjectFileSystem, id: string): Promise<TextureEmbedded | null> {
  const parts = textureEmbeddedIdParse(id)!;
  const file = await fileSystem.fileRead(projectTextureCacheImagePath(parts.hash, parts.extension));
  const bytes = new Uint8Array(await file.arrayBuffer());
  if ((await sha256Hex(bytes)) !== parts.hash) return null;
  const name = await projectTextureCacheNameRead(fileSystem, parts.hash);
  return {
    id,
    name: name ?? textureEmbeddedFallbackName(id),
    blob: new Blob([bytes], { type: textureEmbeddedMime(id) }),
  };
}

/**
 * Reads the name of a cached texture.
 *
 * @param fileSystem Project folder.
 * @param hash SHA-256 of the image.
 * @returns Name, or null when unknown.
 */
async function projectTextureCacheNameRead(fileSystem: ProjectFileSystem, hash: string): Promise<string | null> {
  try {
    const value = JSON.parse(await (await fileSystem.fileRead(projectTextureCacheNamePath(hash))).text()) as {
      name?: unknown;
    } | null;
    return typeof value?.name === 'string' && value.name !== '' ? value.name.slice(0, 256) : null;
  } catch {
    return null;
  }
}
