import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import { stateCollaborationParse } from '@/collaboration/sync/state_collaboration_parse.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { PROJECT_EDITOR_SNAPSHOTS_DIRECTORY, projectEditorFolderPrepare } from '@/project/fs/project_editor_folder.js';
import { projectTextureCacheKeep, projectTextureCacheRestore } from '@/project/textures/cache/project_texture_cache.js';
import {
  PROJECT_HISTORY_ROOM_NAME_MAX,
  projectHistoryRoomFileParse,
  projectHistoryRoomIdParse,
  projectHistoryRoomPath,
} from '@/project/history/project_history_room_files.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';

/** Project folder that holds room snapshots. */
export const SNAPSHOT_COLLABORATION_DIRECTORY = PROJECT_EDITOR_SNAPSHOTS_DIRECTORY;
/** Snapshots kept in memory for the session. */
export const SNAPSHOT_COLLABORATION_MEMORY_KEEP = 12;
/** Unlocked snapshots kept in the project folder; locked ones are never deleted. */
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
  /** Locked snapshots are never deleted by any cleanup. */
  locked: boolean;
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

/**
 * Parses a snapshot file; states that fail validation are dropped.
 *
 * @param id Snapshot id.
 * @param text File contents.
 * @returns Scene, or null when the file is not a snapshot.
 */
export function snapshotCollaborationParse(
  id: string,
  text: string,
  locked = false,
): SnapshotCollaborationScene | null {
  const meta = projectHistoryRoomIdParse(id);
  if (meta === null) return null;
  try {
    const value = JSON.parse(text) as { format?: unknown; states?: unknown } | null;
    if (value?.format !== SNAPSHOT_COLLABORATION_FORMAT || !Array.isArray(value.states)) return null;
    const states = (value.states as unknown[])
      .map((state) => stateCollaborationParse(state))
      .filter((state): state is NodeCollaborationState => state !== null);
    return { id, ...meta, stored: 'project', locked, states };
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
    this.scenes.unshift({ ...scene, stored: 'memory', locked: false });
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
  private readonly room: string;

  /**
   * Creates the store.
   *
   * @param folder Project folder.
   * @param library Library holding the embedded textures snapshots use.
   * @param room Name of the room the snapshots come from, written into each
   *   file.
   */
  constructor(folder: ProjectFileSystem, library: () => TextureLibrary | null = () => null, room = '') {
    this.folder = folder;
    this.library = library;
    this.room = room.slice(0, PROJECT_HISTORY_ROOM_NAME_MAX);
  }

  /**
   * Copies the snapshot's embedded textures into the texture cache, writes the
   * snapshot file and deletes the oldest unlocked ones beyond the limit.
   *
   * @param scene Snapshot.
   */
  async save(scene: SnapshotCollaborationScene): Promise<void> {
    const document = { format: SNAPSHOT_COLLABORATION_FORMAT, version: 1, room: this.room, states: scene.states };
    await projectEditorFolderPrepare(this.folder);
    await projectTextureCacheKeep(this.folder, this.library(), scene.states);
    await this.folder.fileWrite(projectHistoryRoomPath(scene.id, scene.locked), JSON.stringify(document));
    const stale = (await this.list()).filter((meta) => !meta.locked).slice(SNAPSHOT_COLLABORATION_FOLDER_KEEP);
    for (const meta of stale)
      await this.folder.fileRemove(projectHistoryRoomPath(meta.id, false)).catch(() => undefined);
  }

  /**
   * Lists the snapshot files, newest first.
   *
   * @returns Snapshot list.
   */
  async list(): Promise<SnapshotCollaborationMeta[]> {
    const entries = await this.folder.directoryList(SNAPSHOT_COLLABORATION_DIRECTORY, () => false).catch(() => []);
    return entries
      .flatMap((entry) => (entry.kind === 'file' ? [projectHistoryRoomFileParse(entry.name)] : []))
      .filter((meta): meta is SnapshotCollaborationMeta => meta !== null)
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
    const meta = (await this.list()).find((entry) => entry.id === id);
    if (meta === undefined) return null;
    const file = await this.folder.fileRead(projectHistoryRoomPath(id, meta.locked)).catch(() => null);
    if (file === null) return null;
    const scene = snapshotCollaborationParse(id, await file.text(), meta.locked);
    const library = this.library();
    if (scene !== null && library !== null)
      await projectTextureCacheRestore(this.folder, library, scene.states).catch(() => 0);
    return scene;
  }
}
