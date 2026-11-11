import { nameOrderCompare, nameOrderCompareWithPath } from '@/utils/utils_name_order.js';
import type { ProjectFileRecord, ProjectSnapshot } from '@/project/scan/project_snapshot.js';
import { projectPathName, projectPathParent } from '@/project/fs/project_path.js';
import { PROJECT_EDITOR_DIRECTORY } from '@/project/fs/project_editor_folder.js';
import {
  CURVE_LIBRARY_PROJECT_FOLDER,
  CURVE_LIBRARY_VIRTUAL_ROOT,
  curveLibraryFolder,
} from '@/curve/library/curve_library.js';

/**
 * Folder key of the virtual "Curves" root: the project's AiWorldEd/Curves, or
 * in a room the "Remote" (room owner's) and "Local" (own) curves below it (no
 * real path starts with "//").
 */
export const PANEL_PROJECT_VIRTUAL_CURVES = CURVE_LIBRARY_VIRTUAL_ROOT;

/** Virtual curve folders below the Curves root, in display order. */
const PANEL_PROJECT_VIRTUAL_CURVE_FOLDERS: readonly { path: string; name: string }[] = [
  { path: curveLibraryFolder('remote'), name: 'Remote' },
  { path: curveLibraryFolder('local'), name: 'Local' },
];

/** Most tiles the file grid shows at once. */
export const PANEL_PROJECT_TILES_MAXIMUM = 600;

/** One folder row of the project tree. */
export interface PanelProjectFolderRow {
  path: string;
  name: string;
  depth: number;
  fileCount: number;
  /** True when subfolders follow (the row shows an expand arrow). */
  hasChildren: boolean;
}

/** Files to show in the grid and how many matched in total. */
export interface PanelProjectFileList {
  files: ProjectFileRecord[];
  total: number;
}

/**
 * Lists every folder of the snapshot depth-first, root first, with the number
 * of compatible files directly inside it. The editor's own AiWorldEd folder is
 * left out of the tree; its curves appear under the virtual "Curves" root after
 * the project folders (with "Remote" and "Local" below it when the snapshot has
 * those folders, as in a room).
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
    const below = children.get(path) ?? [];
    rows.push({
      path,
      name: path === '' ? rootName : projectPathName(path),
      depth,
      fileCount: counts.get(path) ?? 0,
      hasChildren: below.length > 0,
    });
    below.forEach((child) => visit(child, depth + 1));
  };
  visit('', 0);
  const curveFolders = PANEL_PROJECT_VIRTUAL_CURVE_FOLDERS.filter((folder) => snapshot.directories.has(folder.path));
  rows.push({
    path: PANEL_PROJECT_VIRTUAL_CURVES,
    name: 'Curves',
    depth: 0,
    fileCount: counts.get(CURVE_LIBRARY_PROJECT_FOLDER) ?? 0,
    hasChildren: curveFolders.length > 0,
  });
  for (const folder of curveFolders)
    rows.push({
      path: folder.path,
      name: folder.name,
      depth: 1,
      fileCount: counts.get(folder.path) ?? 0,
      hasChildren: false,
    });
  return rows;
}

/**
 * Returns the direct subfolders of a folder in the order the tree lists them
 * (by name), for the folder tiles before its files. The project root also lists
 * the virtual roots the tree shows beside it (Curves), after its own folders.
 *
 * @param rows Folder rows from panelProjectFolderRows.
 * @param folder Folder path.
 * @returns Subfolder rows.
 */
export function panelProjectFolderChildRows(
  rows: readonly PanelProjectFolderRow[],
  folder: string,
): PanelProjectFolderRow[] {
  const index = rows.findIndex((row) => row.path === folder);
  const parent = rows[index];
  if (parent === undefined) return [];
  const children: PanelProjectFolderRow[] = [];
  for (let next = index + 1; next < rows.length && rows[next]!.depth > parent.depth; next++)
    if (rows[next]!.depth === parent.depth + 1) children.push(rows[next]!);
  if (folder === '') children.push(...rows.filter((row) => row.depth === 0 && row.path !== ''));
  return children;
}

/**
 * Tells whether a folder of the tree holds files, directly or in its
 * subfolders.
 *
 * @param rows Folder rows from panelProjectFolderRows.
 * @param folder Folder row.
 * @returns True when it or a subfolder holds a file.
 */
export function panelProjectFolderHoldsFiles(
  rows: readonly PanelProjectFolderRow[],
  folder: PanelProjectFolderRow,
): boolean {
  const index = rows.indexOf(folder);
  if (index < 0) return false;
  for (let next = index; next < rows.length && (next === index || rows[next]!.depth > folder.depth); next++)
    if (rows[next]!.fileCount > 0) return true;
  return false;
}

/**
 * Tells whether a folder can be shown: a project folder or a virtual root.
 *
 * @param snapshot Project snapshot.
 * @param folder Folder path.
 * @returns True when it exists.
 */
export function panelProjectFolderExists(snapshot: ProjectSnapshot, folder: string): boolean {
  return folder === '' || folder === PANEL_PROJECT_VIRTUAL_CURVES || snapshot.directories.has(folder);
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
    .filter((path) => path !== '' && !path.startsWith('//') && !panelProjectEditorFolderIs(path))
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
  const directory = folder === PANEL_PROJECT_VIRTUAL_CURVES ? CURVE_LIBRARY_PROJECT_FOLDER : folder;
  const matches = [...snapshot.files.values()]
    .filter((record) => (needle === '' ? record.directory === directory : record.path.toLowerCase().includes(needle)))
    .sort((left, right) => nameOrderCompareWithPath(left.name, left.path, right.name, right.path));
  return { files: matches.slice(0, PANEL_PROJECT_TILES_MAXIMUM), total: matches.length };
}

/**
 * Tells whether a folder is the editor's own folder or inside it.
 *
 * @param path Folder path.
 * @returns True for AiWorldEd and its subfolders.
 */
function panelProjectEditorFolderIs(path: string): boolean {
  return path === PROJECT_EDITOR_DIRECTORY || path.startsWith(`${PROJECT_EDITOR_DIRECTORY}/`);
}

/**
 * Compares paths case-insensitively with natural number order.
 *
 * @param left First path.
 * @param right Second path.
 * @returns Sort order.
 */
export function panelProjectCompare(left: string, right: string): number {
  return nameOrderCompare(left, right);
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
