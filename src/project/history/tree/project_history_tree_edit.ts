import {
  PROJECT_HISTORY_NAME_MAX,
  PROJECT_HISTORY_NOTE_MAX,
  projectHistoryNodeFind,
  projectHistoryNodeIdCreate,
  projectHistoryNodeLocked,
  type ProjectHistoryIndex,
  type ProjectHistoryNode,
  type ProjectHistoryNodeKind,
} from './project_history_tree.js';

/** Quiet time after which the next autosave starts a new editing session. */
export const PROJECT_HISTORY_SESSION_IDLE_MS = 30 * 60_000;

/** Unnamed states kept per tree; named ones are kept until deleted. */
export const PROJECT_HISTORY_UNNAMED_KEEP = 20;

/** Outcome of recording an autosave. */
export interface ProjectHistoryAutosaveResult {
  node: ProjectHistoryNode;
  /** True when the autosave started a new session. */
  created: boolean;
}

/**
 * Records an autosave: it replaces the state of the live session when that
 * session is still where the work stands, is unnamed and was written to less
 * than {@link PROJECT_HISTORY_SESSION_IDLE_MS} ago; otherwise it starts a new
 * session that grows from the marker.
 *
 * @param index Tree index, changed in place.
 * @param time Autosave time.
 * @param objectCount Objects in the state.
 * @returns The session and whether it is new.
 */
export function projectHistoryTreeAutosave(
  index: ProjectHistoryIndex,
  time: number,
  objectCount: number,
): ProjectHistoryAutosaveResult {
  const live = projectHistoryNodeFind(index, index.live);
  if (live !== null && projectHistoryTreeLiveContinues(index, live, time)) {
    live.time = Math.max(live.time, time);
    live.autosaves += 1;
    live.objectCount = objectCount;
    return { node: live, created: false };
  }
  const node = projectHistoryTreeNodeAdd(index, 'session', time, objectCount, '');
  index.live = node.id;
  return { node, created: true };
}

/**
 * Tells whether an autosave may still replace the live session's state.
 *
 * @param index Tree index.
 * @param live Live session.
 * @param time Autosave time.
 * @returns True when the session continues.
 */
function projectHistoryTreeLiveContinues(index: ProjectHistoryIndex, live: ProjectHistoryNode, time: number): boolean {
  if (index.marker !== live.id || projectHistoryNodeLocked(live)) return false;
  return time - live.time < PROJECT_HISTORY_SESSION_IDLE_MS;
}

/**
 * Adds a snapshot taken by hand that grows from the marker and becomes the new
 * marker; the next autosave starts a new session.
 *
 * @param index Tree index, changed in place.
 * @param time Snapshot time.
 * @param objectCount Objects in the state.
 * @param name Snapshot name.
 * @returns The snapshot.
 */
export function projectHistoryTreeSnapshot(
  index: ProjectHistoryIndex,
  time: number,
  objectCount: number,
  name: string,
): ProjectHistoryNode {
  const node = projectHistoryTreeNodeAdd(index, 'snapshot', time, objectCount, projectHistoryTreeNameClean(name));
  index.live = null;
  return node;
}

/**
 * Adds a node below the marker and moves the marker to it.
 *
 * @param index Tree index, changed in place.
 * @param kind Node kind.
 * @param time State time.
 * @param objectCount Objects in the state.
 * @param name Name, or empty.
 * @returns The node.
 */
function projectHistoryTreeNodeAdd(
  index: ProjectHistoryIndex,
  kind: ProjectHistoryNodeKind,
  time: number,
  objectCount: number,
  name: string,
): ProjectHistoryNode {
  const id = projectHistoryNodeIdCreate(index, time);
  const node: ProjectHistoryNode = {
    id,
    parent: index.marker,
    kind,
    name,
    note: '',
    time,
    started: time,
    autosaves: kind === 'session' ? 1 : 0,
    objectCount,
    thumbnail: null,
  };
  index.nodes.push(node);
  index.marker = id;
  return node;
}

/** Ends the live session, so the next autosave starts a new one. */
export function projectHistoryTreeSessionEnd(index: ProjectHistoryIndex): void {
  index.live = null;
}

/**
 * Moves the marker to a node after it was restored; the next autosave grows a
 * new session from it and leaves the old future in place.
 *
 * @param index Tree index, changed in place.
 * @param id Restored node id.
 * @returns True when the node exists.
 */
export function projectHistoryTreeRestore(index: ProjectHistoryIndex, id: string): boolean {
  if (projectHistoryNodeFind(index, id) === null) return false;
  index.marker = id;
  index.live = null;
  return true;
}

/**
 * Names a node, which keeps it until deleted, or clears its name, which makes
 * it an ordinary session that cleanup may remove. A named live session stops
 * taking autosaves.
 *
 * @param index Tree index, changed in place.
 * @param id Node id.
 * @param name New name; empty clears it.
 * @returns The node, or null when missing.
 */
export function projectHistoryTreeRename(
  index: ProjectHistoryIndex,
  id: string,
  name: string,
): ProjectHistoryNode | null {
  const node = projectHistoryNodeFind(index, id);
  if (node === null) return null;
  node.name = projectHistoryTreeNameClean(name);
  if (node.name === '') node.kind = 'session';
  else if (index.live === id) index.live = null;
  return node;
}

/**
 * Sets the note of a node.
 *
 * @param index Tree index, changed in place.
 * @param id Node id.
 * @param note Note text.
 * @returns The node, or null when missing.
 */
export function projectHistoryTreeNote(
  index: ProjectHistoryIndex,
  id: string,
  note: string,
): ProjectHistoryNode | null {
  const node = projectHistoryNodeFind(index, id);
  if (node !== null) node.note = note.slice(0, PROJECT_HISTORY_NOTE_MAX);
  return node;
}

/**
 * Removes a node; the states that grew from it attach to its parent, and a
 * marker on it moves to its parent.
 *
 * @param index Tree index, changed in place.
 * @param id Node id.
 * @returns True when the node existed.
 */
export function projectHistoryTreeRemove(index: ProjectHistoryIndex, id: string): boolean {
  const node = projectHistoryNodeFind(index, id);
  if (node === null) return false;
  index.nodes = index.nodes.filter((other) => other !== node);
  index.nodes.forEach((other) => {
    if (other.parent === id) other.parent = node.parent;
  });
  if (index.marker === id) index.marker = node.parent;
  if (index.live === id) index.live = null;
  return true;
}

/**
 * Removes the unnamed states beyond the newest
 * {@link PROJECT_HISTORY_UNNAMED_KEEP}; the marker and the live session always
 * stay.
 *
 * @param index Tree index, changed in place.
 * @param keep Unnamed states to keep.
 * @returns Ids of the removed nodes.
 */
export function projectHistoryTreeCleanup(index: ProjectHistoryIndex, keep = PROJECT_HISTORY_UNNAMED_KEEP): string[] {
  const unnamed = index.nodes
    .filter((node) => !projectHistoryNodeLocked(node))
    .sort((left, right) => right.time - left.time);
  const removed = unnamed
    .slice(keep)
    .filter((node) => node.id !== index.marker && node.id !== index.live)
    .map((node) => node.id);
  removed.forEach((id) => projectHistoryTreeRemove(index, id));
  return removed;
}

/**
 * Trims a name and limits its length.
 *
 * @param name Raw name.
 * @returns Clean name.
 */
export function projectHistoryTreeNameClean(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, PROJECT_HISTORY_NAME_MAX);
}
