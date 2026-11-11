/**
 * Kind of a saved state: an editing session that folds the autosaves of one
 * sitting into one state, or a snapshot taken by hand.
 */
export type ProjectHistoryNodeKind = 'session' | 'snapshot';

/** What a tree keeps the history of. */
export type ProjectHistoryTreeKind = 'level' | 'room';

/**
 * Where a node's thumbnail came from: the largest Perspective view, or the
 * whole level framed off-screen.
 */
export type ProjectHistoryThumbnailSource = 'view' | 'framed';

/**
 * One read-only saved state. Named states are kept until deleted; unnamed ones
 * are subject to cleanup.
 */
export interface ProjectHistoryNode {
  id: string;
  /** State this one grew from; null for a first state. */
  parent: string | null;
  kind: ProjectHistoryNodeKind;
  /** Name; empty for unnamed states. */
  name: string;
  /** Free text the user wrote about the state. */
  note: string;
  /** Time of the state (a session: its newest autosave). */
  time: number;
  /** Time of a session's first autosave. */
  started: number;
  /** Autosaves folded into the state. */
  autosaves: number;
  objectCount: number;
  thumbnail: ProjectHistoryThumbnailSource | null;
}

/** Format marker of a tree index. */
export const PROJECT_HISTORY_INDEX_FORMAT = 'aiworlded-history';

/** Contents of a tree's index.json. */
export interface ProjectHistoryIndex {
  format: typeof PROJECT_HISTORY_INDEX_FORMAT;
  version: 1;
  kind: ProjectHistoryTreeKind;
  /** Level path or room name shown to the user. */
  label: string;
  /** Node the current work descends from ("You Are Here"). */
  marker: string | null;
  /** Session the next autosave may still add to. */
  live: string | null;
  nodes: ProjectHistoryNode[];
}

/**
 * Creates an empty tree index.
 *
 * @param kind What the tree keeps.
 * @param label Level path or room name.
 * @returns Index without nodes.
 */
export function projectHistoryIndexCreate(kind: ProjectHistoryTreeKind, label: string): ProjectHistoryIndex {
  return { format: PROJECT_HISTORY_INDEX_FORMAT, version: 1, kind, label, marker: null, live: null, nodes: [] };
}

/**
 * Parses a tree index; invalid nodes are dropped and links to missing nodes are
 * cut.
 *
 * @param text File contents.
 * @returns Index, or null when the text is not a tree index.
 */
export function projectHistoryIndexParse(text: string): ProjectHistoryIndex | null {
  try {
    const value = JSON.parse(text) as Partial<ProjectHistoryIndex> | null;
    if (value?.format !== PROJECT_HISTORY_INDEX_FORMAT || !Array.isArray(value.nodes)) return null;
    const kind: ProjectHistoryTreeKind = value.kind === 'room' ? 'room' : 'level';
    const index = projectHistoryIndexCreate(kind, typeof value.label === 'string' ? value.label : '');
    index.nodes = value.nodes.flatMap((node: unknown) => projectHistoryNodeParse(node));
    index.marker = projectHistoryIndexLink(index, value.marker);
    index.live = projectHistoryIndexLink(index, value.live);
    index.nodes.forEach((node) => (node.parent = projectHistoryIndexLink(index, node.parent)));
    return index;
  } catch {
    return null;
  }
}

/**
 * Keeps a node id only when the index has that node.
 *
 * @param index Tree index.
 * @param id Untrusted id.
 * @returns The id, or null.
 */
function projectHistoryIndexLink(index: ProjectHistoryIndex, id: unknown): string | null {
  return typeof id === 'string' && index.nodes.some((node) => node.id === id) ? id : null;
}

/**
 * Parses one node.
 *
 * @param value Untrusted node.
 * @returns The node in a list, or an empty list when invalid.
 */
function projectHistoryNodeParse(value: unknown): ProjectHistoryNode[] {
  if (typeof value !== 'object' || value === null) return [];
  const node = value as Record<string, unknown>;
  const id = node['id'];
  const time = projectHistoryNumber(node['time']);
  if (typeof id !== 'string' || !PROJECT_HISTORY_ID_PATTERN.test(id) || time === null) return [];
  const name = typeof node['name'] === 'string' ? node['name'].slice(0, PROJECT_HISTORY_NAME_MAX) : '';
  const thumbnail = node['thumbnail'] === 'view' || node['thumbnail'] === 'framed' ? node['thumbnail'] : null;
  return [
    {
      id,
      parent: typeof node['parent'] === 'string' ? node['parent'] : null,
      kind: node['kind'] === 'snapshot' ? 'snapshot' : 'session',
      name,
      note: typeof node['note'] === 'string' ? node['note'].slice(0, PROJECT_HISTORY_NOTE_MAX) : '',
      time,
      started: projectHistoryNumber(node['started']) ?? time,
      autosaves: projectHistoryNumber(node['autosaves']) ?? 0,
      objectCount: projectHistoryNumber(node['objectCount']) ?? 0,
      thumbnail,
    },
  ];
}

/**
 * Reads a finite, non-negative number.
 *
 * @param value Untrusted value.
 * @returns The number, or null.
 */
function projectHistoryNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Node ids: a UTC time stamp plus an optional counter ("20261111-142233-123",
 * "…-123-2").
 */
export const PROJECT_HISTORY_ID_PATTERN = /^\d{8}-\d{6}-\d{3}(?:-\d{1,4})?$/;

/** Longest name kept. */
export const PROJECT_HISTORY_NAME_MAX = 80;

/** Longest note kept. */
export const PROJECT_HISTORY_NOTE_MAX = 2000;

/**
 * Returns a node by id.
 *
 * @param index Tree index.
 * @param id Node id.
 * @returns Node, or null.
 */
export function projectHistoryNodeFind(index: ProjectHistoryIndex, id: string | null): ProjectHistoryNode | null {
  return id === null ? null : (index.nodes.find((node) => node.id === id) ?? null);
}

/**
 * Tells whether a node is kept until deleted: named nodes are.
 *
 * @param node Node.
 * @returns True when named.
 */
export function projectHistoryNodeLocked(node: ProjectHistoryNode): boolean {
  return node.name !== '';
}

/**
 * Names a node id after a time in UTC, adding a counter while the index already
 * has that id.
 *
 * @param index Tree index.
 * @param time Time in milliseconds.
 * @returns Unused node id.
 */
export function projectHistoryNodeIdCreate(index: ProjectHistoryIndex, time: number): string {
  const iso = new Date(time).toISOString();
  const stamp = `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}-${iso.slice(20, 23)}`;
  const used = new Set(index.nodes.map((node) => node.id));
  let id = stamp;
  for (let counter = 2; used.has(id); counter += 1) id = `${stamp}-${counter}`;
  return id;
}
