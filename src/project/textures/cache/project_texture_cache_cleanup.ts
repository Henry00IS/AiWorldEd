import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import {
  PROJECT_EDITOR_AUTOSAVE_DIRECTORY,
  PROJECT_EDITOR_SNAPSHOTS_DIRECTORY,
  PROJECT_EDITOR_TEXTURE_CACHE_DIRECTORY,
} from '@/project/fs/project_editor_folder.js';
import { projectPathJoin } from '@/project/fs/project_path.js';
import {
  projectTextureScanBlob,
  type ProjectTextureScanPace,
} from '@/project/textures/cache/project_texture_cache_scan.js';
import { textureEmbeddedIdParse } from '@/texture/embedded/texture_embedded_id.js';

/**
 * A cached texture written this recently is never deleted (an autosave may be
 * on its way).
 */
export const PROJECT_TEXTURE_CACHE_RECENT_MS = 10 * 60 * 1000;

/** Deepest folder nesting searched below the autosave and snapshot folders. */
const PROJECT_TEXTURE_CACHE_DEPTH_MAXIMUM = 8;

/** Name of a cache file: "<sha256>.<ext>" or "<sha256>.json". */
const PROJECT_TEXTURE_CACHE_FILE = /^([0-9a-f]{64})\.[a-z0-9]{1,5}$/;

/** What one cleanup pass needs. */
export interface ProjectTextureCacheCleanupDeps {
  /** Project folder. */
  fileSystem: ProjectFileSystem;
  /** Texture ids the open scene and its undo history use. */
  live: () => Iterable<string>;
  /** Shares the main thread, pauses for input and cancels. */
  pace: ProjectTextureScanPace;
  /** Checked right before each deletion; false stops the pass. */
  allowed: () => boolean;
  /** Clock in milliseconds (tests). */
  now?: () => number;
}

/** Files of one cached texture. */
interface ProjectTextureCacheGroup {
  names: string[];
  lastModified: number;
}

/**
 * Deletes the cached textures (AiWorldEd/.Local/TextureCache) that no autosave,
 * autosave copy or room snapshot uses any more, together with their name files.
 * A texture the open scene or its undo history uses, or that was written in the
 * last {@link PROJECT_TEXTURE_CACHE_RECENT_MS}, stays. Every autosave and
 * snapshot is searched for the hashes first; when one cannot be read the pass
 * throws and deletes nothing.
 *
 * @param deps Project folder, live ids, pace and deletion gate.
 * @returns Deleted file names.
 */
export async function projectTextureCacheCleanup(deps: ProjectTextureCacheCleanupDeps): Promise<string[]> {
  await deps.pace.start();
  const groups = await projectTextureCacheGroups(deps.fileSystem);
  if (groups.size === 0) return [];
  const used = new Set<string>();
  for (const folder of [PROJECT_EDITOR_AUTOSAVE_DIRECTORY, PROJECT_EDITOR_SNAPSHOTS_DIRECTORY])
    await projectTextureCacheUsed(deps.fileSystem, folder, deps.pace, used, 0);
  const deleted: string[] = [];
  const now = (deps.now ?? Date.now)();
  for (const [hash, group] of groups) {
    if (used.has(hash) || now - group.lastModified < PROJECT_TEXTURE_CACHE_RECENT_MS) continue;
    await deps.pace.pace();
    if (!deps.allowed()) break;
    if (projectTextureCacheLiveHashes(deps.live()).has(hash)) continue;
    for (const name of group.names)
      await deps.fileSystem.fileRemove(projectPathJoin(PROJECT_EDITOR_TEXTURE_CACHE_DIRECTORY, name));
    deleted.push(...group.names);
  }
  deps.pace.finish();
  return deleted;
}

/**
 * Groups the cache files by hash, with the newest modification time of each
 * group. Files with other names are left alone.
 *
 * @param fileSystem Project folder.
 * @returns Groups by hash.
 */
async function projectTextureCacheGroups(
  fileSystem: ProjectFileSystem,
): Promise<Map<string, ProjectTextureCacheGroup>> {
  const groups = new Map<string, ProjectTextureCacheGroup>();
  for (const entry of await fileSystem.directoryList(PROJECT_EDITOR_TEXTURE_CACHE_DIRECTORY, () => true)) {
    const hash = entry.kind === 'file' ? PROJECT_TEXTURE_CACHE_FILE.exec(entry.name)?.[1] : undefined;
    if (hash === undefined) continue;
    const group = groups.get(hash) ?? { names: [], lastModified: 0 };
    group.names.push(entry.name);
    group.lastModified = Math.max(group.lastModified, entry.lastModified ?? Number.POSITIVE_INFINITY);
    groups.set(hash, group);
  }
  return groups;
}

/**
 * Adds the hashes every file below a folder names, one file and one chunk at a
 * time.
 *
 * @param fileSystem Project folder.
 * @param folder Folder to search.
 * @param pace Pace of the pass.
 * @param used Hashes found.
 * @param depth Nesting below the first folder.
 */
async function projectTextureCacheUsed(
  fileSystem: ProjectFileSystem,
  folder: string,
  pace: ProjectTextureScanPace,
  used: Set<string>,
  depth: number,
): Promise<void> {
  if (depth > PROJECT_TEXTURE_CACHE_DEPTH_MAXIMUM) throw new Error(`${folder} is nested too deeply to search`);
  for (const entry of await fileSystem.directoryList(folder, () => false)) {
    await pace.pace();
    const path = projectPathJoin(folder, entry.name);
    if (entry.kind === 'directory') await projectTextureCacheUsed(fileSystem, path, pace, used, depth + 1);
    else await projectTextureScanBlob(await fileSystem.fileRead(path), pace, used);
  }
}

/**
 * Returns the hashes of the embedded ids among texture ids.
 *
 * @param ids Texture ids.
 * @returns Hashes.
 */
function projectTextureCacheLiveHashes(ids: Iterable<string>): Set<string> {
  const hashes = new Set<string>();
  for (const id of ids) {
    const hash = textureEmbeddedIdParse(id)?.hash;
    if (hash !== undefined) hashes.add(hash);
  }
  return hashes;
}
