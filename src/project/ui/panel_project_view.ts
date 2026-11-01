import type { ProjectFileRecord, ProjectSnapshot } from '@/project/scan/project_snapshot.js';
import { projectPathName, projectPathParent } from '@/project/fs/project_path.js';

/** Most tiles the file grid shows at once. */
export const PANEL_PROJECT_TILES_MAXIMUM = 600;

/** One folder row of the project tree. */
export interface PanelProjectFolderRow {
  path: string;
  name: string;
  depth: number;
  fileCount: number;
}

/** Files to show in the grid and how many matched in total. */
export interface PanelProjectFileList {
  files: ProjectFileRecord[];
  total: number;
}

/**
 * Lists every folder of the snapshot depth-first, root first, with the number
 * of compatible files directly inside it.
 *
 * @param snapshot Project snapshot.
 * @param rootName Name shown for the project root.
 * @returns Folder rows in display order.
 */
export function panelProjectFolderRows(snapshot: ProjectSnapshot, rootName: string): PanelProjectFolderRow[] {
  const counts = panelProjectFolderCounts(snapshot);
  const children = panelProjectFolderChildren(snapshot);
  const rows: PanelProjectFolderRow[] = [];
  const visit = (path: string, depth: number) => {
    rows.push({ path, name: path === '' ? rootName : projectPathName(path), depth, fileCount: counts.get(path) ?? 0 });
    (children.get(path) ?? []).forEach((child) => visit(child, depth + 1));
  };
  visit('', 0);
  return rows;
}

/**
 * Counts files directly inside each folder.
 *
 * @param snapshot Project snapshot.
 * @returns File count per folder path.
 */
function panelProjectFolderCounts(snapshot: ProjectSnapshot): Map<string, number> {
  const counts = new Map<string, number>();
  snapshot.files.forEach((record) => counts.set(record.directory, (counts.get(record.directory) ?? 0) + 1));
  return counts;
}

/**
 * Groups folders under their parent, sorted by name.
 *
 * @param snapshot Project snapshot.
 * @returns Child folder paths per parent path.
 */
function panelProjectFolderChildren(snapshot: ProjectSnapshot): Map<string, string[]> {
  const children = new Map<string, string[]>();
  [...snapshot.directories]
    .filter((path) => path !== '')
    .sort(panelProjectCompare)
    .forEach((path) => {
      const parent = projectPathParent(path);
      const list = children.get(parent) ?? [];
      list.push(path);
      children.set(parent, list);
    });
  return children;
}

/**
 * Picks the files the grid shows: the folder's own files, or matches from the
 * whole project while searching.
 *
 * @param snapshot Project snapshot.
 * @param folder Selected folder path.
 * @param query Search text; empty shows the folder.
 * @returns Shown files (capped) and the full match count.
 */
export function panelProjectFiles(snapshot: ProjectSnapshot, folder: string, query: string): PanelProjectFileList {
  const needle = query.trim().toLowerCase();
  const matches = [...snapshot.files.values()]
    .filter((record) => (needle === '' ? record.directory === folder : record.path.toLowerCase().includes(needle)))
    .sort((left, right) => panelProjectCompare(left.path, right.path));
  return { files: matches.slice(0, PANEL_PROJECT_TILES_MAXIMUM), total: matches.length };
}

/**
 * Compares paths case-insensitively with natural number order.
 *
 * @param left First path.
 * @param right Second path.
 * @returns Sort order.
 */
export function panelProjectCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Formats a byte count for the file tooltip.
 *
 * @param bytes Size in bytes.
 * @returns Short human readable size.
 */
export function panelProjectSizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
