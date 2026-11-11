import { projectHistoryNodeFind, type ProjectHistoryNode } from '@/project/history/tree/project_history_tree.js';
import type { ProjectHistoryThumbnailSource } from '@/project/history/tree/project_history_tree.js';
import {
  projectHistoryTreeAutosave,
  projectHistoryTreeCleanup,
  projectHistoryTreeSessionEnd,
  projectHistoryTreeSnapshot,
} from '@/project/history/tree/project_history_tree_edit.js';
import {
  projectHistoryStateFile,
  projectHistoryThumbnailFile,
  type ProjectHistoryStore,
} from './project_history_store.js';

/** An encoded thumbnail and where it came from. */
export interface ProjectHistoryThumbnailShot {
  blob: Blob;
  source: ProjectHistoryThumbnailSource;
}

/** Takes a thumbnail of what the editor shows now. */
export type ProjectHistoryThumbnailCapture = () => Promise<ProjectHistoryThumbnailShot | null>;

/** A state about to be recorded. */
export interface ProjectHistoryRecord {
  /** State file contents. */
  state: string;
  objectCount: number;
  time: number;
  /** Thumbnail of the state, when one was taken. */
  shot: ProjectHistoryThumbnailShot | null;
  /**
   * Whether the state starts a new session even when the live one could
   * continue (the scene was loaded from a file since).
   */
  fresh?: boolean;
}

/**
 * Records an autosave into a tree: replaces the live session's state or starts
 * a new session, writes the thumbnail and removes the states cleanup drops.
 *
 * @param store Tree store.
 * @param record State to record.
 * @param sessionEnd Whether the next autosave starts a new session.
 * @returns Copy of the session node.
 */
export function projectHistoryAutosaveRecord(
  store: ProjectHistoryStore,
  record: ProjectHistoryRecord,
  sessionEnd = false,
): Promise<ProjectHistoryNode> {
  return store.change(async (index) => {
    if (record.fresh === true) projectHistoryTreeSessionEnd(index);
    const { node } = projectHistoryTreeAutosave(index, record.time, record.objectCount);
    await projectHistoryRecordFiles(store, node, record);
    await store.filesRemove(projectHistoryTreeCleanup(index));
    if (sessionEnd) projectHistoryTreeSessionEnd(index);
    return { ...node };
  });
}

/**
 * Records a named snapshot into a tree.
 *
 * @param store Tree store.
 * @param record State to record.
 * @param name Snapshot name.
 * @returns Copy of the snapshot node.
 */
export function projectHistorySnapshotRecord(
  store: ProjectHistoryStore,
  record: ProjectHistoryRecord,
  name: string,
): Promise<ProjectHistoryNode> {
  return store.change(async (index) => {
    const node = projectHistoryTreeSnapshot(index, record.time, record.objectCount, name);
    await projectHistoryRecordFiles(store, node, record);
    return { ...node };
  });
}

/**
 * Writes a node's state file and thumbnail.
 *
 * @param store Tree store.
 * @param node Node, changed in place to name its thumbnail source.
 * @param record State to record.
 */
async function projectHistoryRecordFiles(
  store: ProjectHistoryStore,
  node: ProjectHistoryNode,
  record: ProjectHistoryRecord,
): Promise<void> {
  await store.folder.write(projectHistoryStateFile(node.id), record.state);
  if (record.shot === null) return;
  await store.folder.write(projectHistoryThumbnailFile(node.id), record.shot.blob);
  node.thumbnail = record.shot.source;
}

/**
 * Returns the node the current work descends from.
 *
 * @param store Tree store.
 * @returns Copy of the marker node, or null.
 */
export async function projectHistoryMarkerNode(store: ProjectHistoryStore): Promise<ProjectHistoryNode | null> {
  const index = await store.index();
  const node = projectHistoryNodeFind(index, index.marker);
  return node === null ? null : { ...node };
}
