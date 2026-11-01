import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import type { ProjectFileSystemEntry } from '@/project/fs/project_file_system.js';
import { projectPathExtension, projectPathSegments } from '@/project/fs/project_path.js';
import {
  PROJECT_DESKTOP_FILE_BYTES_MAXIMUM,
  type ProjectDesktopFile,
  type ProjectDesktopListParams,
  type ProjectDesktopPathParams,
  type ProjectDesktopRoot,
  type ProjectDesktopWriteParams,
} from './project_desktop_protocol.js';

/** Most folders remembered as picked. */
const PROJECT_DESKTOP_HOST_ROOTS_MAXIMUM = 32;

/** Opens the native folder dialog; resolves with the picked path or null. */
export type ProjectDesktopHostDialog = () => Promise<string | null>;

/** Remembered picked folders. */
interface ProjectDesktopHostState {
  roots: string[];
  last: string | null;
}

/**
 * Bun-side file access for the desktop project bridge. Only folders the user
 * picked in the native dialog are accepted (remembered in a small JSON file),
 * every path is checked to stay inside its folder (symlinks included), and
 * writes go to a temporary file that replaces the target by rename.
 */
export class ProjectDesktopHost {
  private readonly stateFile: string;
  private readonly dialog: ProjectDesktopHostDialog;
  private state: ProjectDesktopHostState | null;

  /**
   * Creates the host.
   *
   * @param stateFile JSON file remembering picked folders.
   * @param dialog Native folder dialog.
   */
  constructor(stateFile: string, dialog: ProjectDesktopHostDialog) {
    this.stateFile = stateFile;
    this.dialog = dialog;
    this.state = null;
  }

  /**
   * Lets the user pick a project folder.
   *
   * @returns Picked folder, or null when cancelled.
   */
  async pick(): Promise<ProjectDesktopRoot | null> {
    const picked = await this.dialog();
    if (picked === null || picked === '') return null;
    const root = await realpath(resolve(picked));
    if (!(await stat(root)).isDirectory()) return null;
    await this.stateRemember(root);
    return { root, name: basename(root) };
  }

  /**
   * Returns the last picked folder when it still exists.
   *
   * @returns Folder, or null.
   */
  async last(): Promise<ProjectDesktopRoot | null> {
    const last = (await this.stateLoad()).last;
    if (last === null) return null;
    const exists = await stat(last).then(
      (stats) => stats.isDirectory(),
      () => false,
    );
    return exists ? { root: last, name: basename(last) } : null;
  }

  /**
   * Lists a folder; symlinks are skipped.
   *
   * @param params Folder and wanted extensions.
   * @returns Children, or an empty list when the folder is gone.
   */
  async list(params: ProjectDesktopListParams): Promise<ProjectFileSystemEntry[]> {
    const folder = await this.pathResolve(params, true).catch(() => null);
    if (folder === null) return [];
    const dirents = await readdir(folder, { withFileTypes: true }).catch(() => []);
    const wanted = new Set(params.extensions);
    const entries = await Promise.all(dirents.map((dirent) => projectDesktopHostEntry(folder, dirent, wanted)));
    return entries.filter((entry): entry is ProjectFileSystemEntry => entry !== null);
  }

  /**
   * Reads a file.
   *
   * @param params File address.
   * @returns Contents and time.
   */
  async read(params: ProjectDesktopPathParams): Promise<ProjectDesktopFile> {
    const file = await this.pathResolve(params, false);
    const stats = await stat(file);
    if (!stats.isFile() || stats.size > PROJECT_DESKTOP_FILE_BYTES_MAXIMUM)
      throw new Error('File is too large or not a file');
    return { base64: (await readFile(file)).toString('base64'), lastModified: Math.floor(stats.mtimeMs) };
  }

  /**
   * Replaces a file atomically, creating missing folders.
   *
   * @param params File address and contents.
   */
  async write(params: ProjectDesktopWriteParams): Promise<void> {
    const bytes = Buffer.from(params.base64, 'base64');
    if (bytes.length > PROJECT_DESKTOP_FILE_BYTES_MAXIMUM) throw new Error('File is too large');
    const target = await this.pathResolve(params, false, true);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, new Uint8Array(bytes));
    await rename(temporary, target).catch(async (error: unknown) => {
      await rm(temporary, { force: true });
      throw error;
    });
  }

  /**
   * Removes a file; a missing file is fine.
   *
   * @param params File address.
   */
  async remove(params: ProjectDesktopPathParams): Promise<void> {
    const target = await this.pathResolve(params, false).catch(() => null);
    if (target !== null) await rm(target, { force: true });
  }

  /**
   * Resolves a project path inside an accepted folder.
   *
   * @param params Folder and path.
   * @param directory True for a folder path ("" is the root).
   * @param create True to create missing parent folders.
   * @returns Absolute path.
   */
  private async pathResolve(params: ProjectDesktopPathParams, directory: boolean, create = false): Promise<string> {
    const root = await this.rootAccepted(params.root);
    if (directory && params.path === '') return root;
    const target = join(root, ...projectPathSegments(params.path));
    if (create) await mkdir(dirname(target), { recursive: true });
    const real = await realpath(target).catch(() => null);
    const checked = real ?? join(await realpath(dirname(target)), basename(target));
    if (!projectDesktopHostInside(root, real ?? dirname(checked))) throw new Error('Path leaves the project folder');
    return checked;
  }

  /**
   * Checks that a folder was picked by the user.
   *
   * @param root Folder path from the webview.
   * @returns The same path.
   */
  private async rootAccepted(root: string): Promise<string> {
    if (!(await this.stateLoad()).roots.includes(root)) throw new Error('Folder was not picked by the user');
    return root;
  }

  /**
   * Remembers a picked folder as the last one.
   *
   * @param root Folder path.
   */
  private async stateRemember(root: string): Promise<void> {
    const state = await this.stateLoad();
    state.roots = [root, ...state.roots.filter((known) => known !== root)].slice(0, PROJECT_DESKTOP_HOST_ROOTS_MAXIMUM);
    state.last = root;
    await mkdir(dirname(this.stateFile), { recursive: true });
    await writeFile(this.stateFile, JSON.stringify(state));
  }

  /**
   * Loads the remembered folders once.
   *
   * @returns State.
   */
  private async stateLoad(): Promise<ProjectDesktopHostState> {
    if (this.state !== null) return this.state;
    const text = await readFile(this.stateFile, 'utf8').catch(() => '');
    this.state = projectDesktopHostStateParse(text);
    return this.state;
  }
}

/**
 * Describes one directory entry; symlinks and unknown types are skipped.
 *
 * @param folder Absolute folder path.
 * @param dirent Directory entry.
 * @param wanted Extensions that need stats.
 * @returns Entry, or null when skipped.
 */
async function projectDesktopHostEntry(
  folder: string,
  dirent: { name: string; isDirectory(): boolean; isFile(): boolean },
  wanted: ReadonlySet<string>,
): Promise<ProjectFileSystemEntry | null> {
  if (dirent.isDirectory()) return { name: dirent.name, kind: 'directory' };
  if (!dirent.isFile()) return null;
  if (!wanted.has(projectPathExtension(dirent.name))) return { name: dirent.name, kind: 'file' };
  const stats = await stat(join(folder, dirent.name)).catch(() => null);
  if (stats === null) return null;
  return { name: dirent.name, kind: 'file', size: stats.size, lastModified: Math.floor(stats.mtimeMs) };
}

/**
 * Tells whether a resolved path is the root or lies inside it.
 *
 * @param root Root folder.
 * @param path Resolved path.
 * @returns True when inside.
 */
function projectDesktopHostInside(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep);
}

/**
 * Parses the remembered folders, tolerating a missing or broken file.
 *
 * @param text File text.
 * @returns State.
 */
function projectDesktopHostStateParse(text: string): ProjectDesktopHostState {
  try {
    const parsed = JSON.parse(text) as Partial<ProjectDesktopHostState>;
    const roots = Array.isArray(parsed.roots) ? parsed.roots.filter((root) => typeof root === 'string') : [];
    return { roots, last: typeof parsed.last === 'string' && roots.includes(parsed.last) ? parsed.last : null };
  } catch {
    return { roots: [], last: null };
  }
}
