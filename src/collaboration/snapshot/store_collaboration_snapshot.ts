import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import { stateCollaborationParse } from '@/collaboration/sync/state_collaboration_parse.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { PROJECT_EDITOR_SNAPSHOTS_DIRECTORY, projectEditorFolderPrepare } from '@/project/fs/project_editor_folder.js';
import { projectTextureCacheKeep, projectTextureCacheRestore } from '@/project/textures/cache/project_texture_cache.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';

/** Project folder that holds room snapshots. */
export const SNAPSHOT_COLLABORATION_DIRECTORY = PROJECT_EDITOR_SNAPSHOTS_DIRECTORY;
/** Snapshots kept in memory for the session. */
export const SNAPSHOT_COLLABORATION_MEMORY_KEEP = 12;
/** Snapshots kept in the project folder. */
export const SNAPSHOT_COLLABORATION_FOLDER_KEEP = 30;
/** Format marker written into every snapshot file. */
export const SNAPSHOT_COLLABORATION_FORMAT = 'aiworlded-room-snapshot';

/** Why a snapshot was taken. */
export type SnapshotCollaborationReason = 'room-start' | 'periodic' | 'large-change' | 'before-restore' | 'manual';

/** What a snapshot list shows. */
export interface SnapshotCollaborationMeta {
  id: string;
  savedAt: number;
  count: number;
  reason: SnapshotCollaborationReason;
  stored: 'memory' | 'project';
}

/** A saved room scene. */
export interface SnapshotCollaborationScene extends SnapshotCollaborationMeta {
  states: NodeCollaborationState[];
}

/** Keeps room snapshots somewhere. */
export interface SnapshotCollaborationStore {
  save(scene: SnapshotCollaborationScene): Promise<void>;
  list(): Promise<SnapshotCollaborationMeta[]>;
  load(id: string): Promise<SnapshotCollaborationScene | null>;
}

const SNAPSHOT_COLLABORATION_REASONS: readonly SnapshotCollaborationReason[] = [
  'room-start',
  'periodic',
  'large-change',
  'before-restore',
  'manual',
];

/**
 * Names a snapshot after its time, object count and reason
 * ("20261101-142233-123_3000_periodic"), so a list needs no file reads.
 *
 * @param savedAt Time in milliseconds.
 * @param count Object count.
 * @param reason Why it was taken.
 * @returns Snapshot id.
 */
export function snapshotCollaborationId(savedAt: number, count: number, reason: SnapshotCollaborationReason): string {
  const iso = new Date(savedAt).toISOString();
  const stamp = `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}-${iso.slice(20, 23)}`;
  return `${stamp}_${count}_${reason}`;
}

/**
 * Reads the time, count and reason back from a snapshot id.
 *
 * @param id Snapshot id.
 * @returns Parts, or null for a foreign name.
 */
export function snapshotCollaborationIdParse(
  id: string,
): Pick<SnapshotCollaborationMeta, 'savedAt' | 'count' | 'reason'> | null {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})_(\d{1,7})_([a-z-]+)$/.exec(id);
  if (match === null) return null;
  const reason = match[9] as SnapshotCollaborationReason;
  if (!SNAPSHOT_COLLABORATION_REASONS.includes(reason)) return null;
  const [year, month, day, hour, minute, second, milli, count] = match.slice(1, 9).map(Number) as number[];
  return { savedAt: Date.UTC(year!, month! - 1, day!, hour!, minute!, second!, milli!), count: count!, reason };
}

/**
 * Parses a snapshot file; states that fail validation are dropped.
 *
 * @param id Snapshot id.
 * @param text File contents.
 * @returns Scene, or null when the file is not a snapshot.
 */
export function snapshotCollaborationParse(id: string, text: string): SnapshotCollaborationScene | null {
  const meta = snapshotCollaborationIdParse(id);
  if (meta === null) return null;
  try {
    const value = JSON.parse(text) as { format?: unknown; states?: unknown } | null;
    if (value?.format !== SNAPSHOT_COLLABORATION_FORMAT || !Array.isArray(value.states)) return null;
    const states = (value.states as unknown[])
      .map((state) => stateCollaborationParse(state))
      .filter((state): state is NodeCollaborationState => state !== null);
    return { id, ...meta, stored: 'project', states };
  } catch {
    return null;
  }
}

/** Keeps the newest snapshots in memory for the session. */
export class SnapshotCollaborationMemoryStore implements SnapshotCollaborationStore {
  private readonly scenes: SnapshotCollaborationScene[] = [];

  /**
   * Keeps a snapshot, dropping the oldest beyond the limit.
   *
   * @param scene Snapshot.
   */
  async save(scene: SnapshotCollaborationScene): Promise<void> {
    this.scenes.unshift({ ...scene, stored: 'memory' });
    this.scenes.splice(SNAPSHOT_COLLABORATION_MEMORY_KEEP);
  }

  /**
   * Lists the snapshots, newest first.
   *
   * @returns Snapshot list.
   */
  async list(): Promise<SnapshotCollaborationMeta[]> {
    return this.scenes.map(({ states: _states, ...meta }) => meta);
  }

  /**
   * Returns a snapshot.
   *
   * @param id Snapshot id.
   * @returns Snapshot, or null.
   */
  async load(id: string): Promise<SnapshotCollaborationScene | null> {
    return this.scenes.find((scene) => scene.id === id) ?? null;
  }
}

/**
 * Keeps snapshots as files in the project folder, so they survive a reload. The
 * embedded textures a snapshot uses go into the project's texture cache.
 */
export class SnapshotCollaborationFolderStore implements SnapshotCollaborationStore {
  private readonly folder: ProjectFileSystem;
  private readonly library: () => TextureLibrary | null;

  /**
   * Creates the store.
   *
   * @param folder Project folder.
   * @param library Library holding the embedded textures snapshots use.
   */
  constructor(folder: ProjectFileSystem, library: () => TextureLibrary | null = () => null) {
    this.folder = folder;
    this.library = library;
  }

  /**
   * Copies the snapshot's embedded textures into the texture cache, writes the
   * snapshot file and deletes the oldest beyond the limit.
   *
   * @param scene Snapshot.
   */
  async save(scene: SnapshotCollaborationScene): Promise<void> {
    const text = JSON.stringify({ format: SNAPSHOT_COLLABORATION_FORMAT, version: 1, states: scene.states });
    await projectEditorFolderPrepare(this.folder);
    await projectTextureCacheKeep(this.folder, this.library(), scene.states);
    await this.folder.fileWrite(snapshotCollaborationPath(scene.id), text);
    const stale = (await this.list()).slice(SNAPSHOT_COLLABORATION_FOLDER_KEEP);
    for (const meta of stale) await this.folder.fileRemove(snapshotCollaborationPath(meta.id)).catch(() => undefined);
  }

  /**
   * Lists the snapshot files, newest first.
   *
   * @returns Snapshot list.
   */
  async list(): Promise<SnapshotCollaborationMeta[]> {
    const entries = await this.folder.directoryList(SNAPSHOT_COLLABORATION_DIRECTORY, () => false).catch(() => []);
    const suffix = `.${SNAPSHOT_COLLABORATION_EXTENSION}`;
    return entries
      .filter((entry) => entry.kind === 'file' && entry.name.endsWith(suffix))
      .map((entry) => entry.name.slice(0, -suffix.length))
      .flatMap((id) => {
        const meta = snapshotCollaborationIdParse(id);
        return meta === null ? [] : [{ id, ...meta, stored: 'project' as const }];
      })
      .sort((left, right) => right.savedAt - left.savedAt);
  }

  /**
   * Reads a snapshot file and lists the embedded textures it uses from the
   * texture cache.
   *
   * @param id Snapshot id.
   * @returns Snapshot, or null when missing or invalid.
   */
  async load(id: string): Promise<SnapshotCollaborationScene | null> {
    if (snapshotCollaborationIdParse(id) === null) return null;
    const file = await this.folder.fileRead(snapshotCollaborationPath(id)).catch(() => null);
    if (file === null) return null;
    const scene = snapshotCollaborationParse(id, await file.text());
    const library = this.library();
    if (scene !== null && library !== null)
      await projectTextureCacheRestore(this.folder, library, scene.states).catch(() => 0);
    return scene;
  }
}

/** Snapshot file extension (plain JSON). */
const SNAPSHOT_COLLABORATION_EXTENSION = 'json';

/**
 * Returns the path of a snapshot file.
 *
 * @param id Snapshot id.
 * @returns Project-relative path.
 */
function snapshotCollaborationPath(id: string): string {
  return `${SNAPSHOT_COLLABORATION_DIRECTORY}/${id}.${SNAPSHOT_COLLABORATION_EXTENSION}`;
}
