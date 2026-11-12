import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { PROJECT_EDITOR_LOCAL_DIRECTORY, projectEditorFolderPrepare } from '@/project/fs/project_editor_folder.js';
import type { ProjectFileRecord } from '@/project/scan/project_snapshot.js';
import { sha256Hex } from '@/utils/utils_sha256.js';

/** Machine-local cache of project texture hashes. */
export const PROJECT_TEXTURE_HASHES_FILE = `${PROJECT_EDITOR_LOCAL_DIRECTORY}/TextureHashes.json`;

/** Format marker of the cache file. */
const PROJECT_TEXTURE_HASHES_FORMAT = 'aiworlded-texture-hashes';

/** Cached hash of one file version. */
interface ProjectTextureHashesEntry {
  size: number;
  lastModified: number;
  sha256: string;
}

/**
 * Content hashes of the project's textures, cached by path, size and time in
 * AiWorldEd/.Local, so a big project is hashed once.
 */
export class ProjectTextureHashes {
  private cache: Record<string, ProjectTextureHashesEntry> | null = null;
  private dirty = false;

  /**
   * Creates the lookup for one project folder.
   *
   * @param fileSystem Project folder.
   */
  constructor(private readonly fileSystem: ProjectFileSystem) {}

  /**
   * Writes the cache back when new hashes were computed, dropping files that
   * are gone.
   *
   * @param present Paths of the project's textures.
   */
  async save(present: ReadonlySet<string>): Promise<void> {
    if (!this.dirty || this.cache === null || !this.fileSystem.writable) return;
    this.dirty = false;
    for (const path of Object.keys(this.cache)) if (!present.has(path)) delete this.cache[path];
    const text = JSON.stringify({ format: PROJECT_TEXTURE_HASHES_FORMAT, version: 1, files: this.cache });
    await projectEditorFolderPrepare(this.fileSystem);
    await this.fileSystem.fileWrite(PROJECT_TEXTURE_HASHES_FILE, text).catch(() => undefined);
  }

  /**
   * Returns a file's hash from the cache, or computes and caches it.
   *
   * @param record File record.
   * @param file The file when already read, so it is not read again.
   * @returns SHA-256 hex, or null when unreadable.
   */
  async hashOf(record: ProjectFileRecord, file?: Blob): Promise<string | null> {
    const cache = await this.cacheLoad();
    const cached = cache[record.path];
    if (cached !== undefined && cached.size === record.size && cached.lastModified === record.lastModified)
      return cached.sha256;
    try {
      const bytes = new Uint8Array(await (file ?? (await this.fileSystem.fileRead(record.path))).arrayBuffer());
      const sha256 = await sha256Hex(bytes);
      cache[record.path] = { size: record.size, lastModified: record.lastModified, sha256 };
      this.dirty = true;
      return sha256;
    } catch {
      return null;
    }
  }

  /**
   * Reads the cache file once.
   *
   * @returns Entries by path.
   */
  private async cacheLoad(): Promise<Record<string, ProjectTextureHashesEntry>> {
    if (this.cache !== null) return this.cache;
    this.cache = {};
    try {
      const parsed = JSON.parse(await (await this.fileSystem.fileRead(PROJECT_TEXTURE_HASHES_FILE)).text()) as {
        files?: Record<string, ProjectTextureHashesEntry>;
      };
      for (const [path, entry] of Object.entries(parsed.files ?? {}))
        if (
          typeof entry?.sha256 === 'string' &&
          typeof entry.size === 'number' &&
          typeof entry.lastModified === 'number'
        )
          this.cache[path] = entry;
    } catch {
      return this.cache;
    }
    return this.cache;
  }
}
