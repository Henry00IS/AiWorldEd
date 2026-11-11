import type { ProjectHistoryIndex, ProjectHistoryNode } from './project_history_tree.js';

/** Row id of "You Are Here", the live work. */
export const PROJECT_HISTORY_HERE = '@here';

/** One placed row of the tree. */
export interface ProjectHistoryTreeRow {
  id: string;
  /** Saved state, or null for "You Are Here". */
  node: ProjectHistoryNode | null;
  /** Row this one grew from, or null for a first state. */
  parent: string | null;
  lane: number;
  /** Position in time order, oldest first. */
  order: number;
  /** Whether the row is the marker, one of its ancestors, or "You Are Here". */
  onPath: boolean;
}

/** Placed rows, newest first, plus the number of lanes the graph needs. */
export interface ProjectHistoryTreeLayout {
  rows: ProjectHistoryTreeRow[];
  lanes: number;
}

/** Occupied row spans of each lane. */
type ProjectHistoryLaneSpans = Array<Array<[number, number]>>;

/**
 * Places the states of a tree in rows, newest first, and in lanes, so each
 * branch keeps one lane and no two branches share a lane where they overlap.
 * The branch leading to the marker is placed first and stays leftmost.
 *
 * @param index Tree index.
 * @param live Whether the tree's work is live in the editor ("You Are Here").
 * @returns Placed rows and lane count.
 */
export function projectHistoryTreeLayout(index: ProjectHistoryIndex, live: boolean): ProjectHistoryTreeLayout {
  const rows = projectHistoryTreeRows(index, live);
  const byId = new Map(rows.map((row) => [row.id, row]));
  projectHistoryTreePathMark(byId, index.marker);
  const children = projectHistoryTreeChildren(rows, byId);
  const spans: ProjectHistoryLaneSpans = [];
  for (const root of projectHistoryTreeSorted(children.get(null) ?? []))
    projectHistoryTreeLanePlace(spans, root, root.order, 0);
  for (const row of rows)
    for (const child of projectHistoryTreeSorted(children.get(row.id) ?? []))
      projectHistoryTreeLanePlace(spans, child, row.order, row.lane);
  return { rows: rows.reverse(), lanes: Math.max(1, spans.length) };
}

/**
 * Builds the rows in time order, oldest first, with "You Are Here" last.
 *
 * @param index Tree index.
 * @param live Whether to add "You Are Here".
 * @returns Unplaced rows.
 */
function projectHistoryTreeRows(index: ProjectHistoryIndex, live: boolean): ProjectHistoryTreeRow[] {
  const ordered = [...index.nodes].sort((left, right) => left.time - right.time || (left.id < right.id ? -1 : 1));
  const rows = ordered.map((node, order) => projectHistoryTreeRowCreate(node.id, node, node.parent, order));
  if (live) rows.push(projectHistoryTreeRowCreate(PROJECT_HISTORY_HERE, null, index.marker, rows.length));
  return rows;
}

/**
 * Creates an unplaced row.
 *
 * @param id Row id.
 * @param node Saved state, or null for "You Are Here".
 * @param parent Parent row id.
 * @param order Position in time order.
 * @returns Row.
 */
function projectHistoryTreeRowCreate(
  id: string,
  node: ProjectHistoryNode | null,
  parent: string | null,
  order: number,
): ProjectHistoryTreeRow {
  return { id, node, parent, lane: -1, order, onPath: node === null };
}

/**
 * Groups rows by parent; rows whose parent is missing count as first states.
 *
 * @param rows Rows.
 * @param byId Rows by id.
 * @returns Children by parent id.
 */
function projectHistoryTreeChildren(
  rows: readonly ProjectHistoryTreeRow[],
  byId: ReadonlyMap<string, ProjectHistoryTreeRow>,
): Map<string | null, ProjectHistoryTreeRow[]> {
  const children = new Map<string | null, ProjectHistoryTreeRow[]>();
  for (const row of rows) {
    row.parent = row.parent !== null && byId.has(row.parent) ? row.parent : null;
    const list = children.get(row.parent) ?? [];
    list.push(row);
    children.set(row.parent, list);
  }
  return children;
}

/**
 * Orders siblings: the one on the path to the marker first, then by time.
 *
 * @param rows Siblings.
 * @returns Ordered copy.
 */
function projectHistoryTreeSorted(rows: readonly ProjectHistoryTreeRow[]): ProjectHistoryTreeRow[] {
  return [...rows].sort((left, right) => Number(right.onPath) - Number(left.onPath) || left.order - right.order);
}

/**
 * Gives a row the preferred lane when it is free from the parent's row to its
 * own, else the leftmost free lane.
 *
 * @param spans Occupied spans per lane, extended in place.
 * @param row Row to place.
 * @param start Order of the parent row.
 * @param preferred Lane to try first.
 */
function projectHistoryTreeLanePlace(
  spans: ProjectHistoryLaneSpans,
  row: ProjectHistoryTreeRow,
  start: number,
  preferred: number,
): void {
  const span: [number, number] = [start, row.order];
  const free = (lane: number) => (spans[lane] ?? []).every(([from, to]) => span[1] <= from || to <= span[0]);
  let lane = preferred >= 0 && free(preferred) ? preferred : 0;
  while (!free(lane)) lane += 1;
  (spans[lane] ??= []).push(span);
  row.lane = lane;
}

/**
 * Marks the marker and its ancestors as the path to the current work.
 *
 * @param byId Rows by id.
 * @param marker Marker node id.
 */
function projectHistoryTreePathMark(byId: ReadonlyMap<string, ProjectHistoryTreeRow>, marker: string | null): void {
  const seen = new Set<string>();
  for (let id = marker; id !== null && !seen.has(id);) {
    seen.add(id);
    const row = byId.get(id);
    if (row === undefined) return;
    row.onPath = true;
    id = row.parent;
  }
}

/**
 * Counts the states that grew directly from a node.
 *
 * @param index Tree index.
 * @param id Node id.
 * @returns Number of direct children.
 */
export function projectHistoryTreeChildCount(index: ProjectHistoryIndex, id: string): number {
  return index.nodes.filter((node) => node.parent === id).length;
}
