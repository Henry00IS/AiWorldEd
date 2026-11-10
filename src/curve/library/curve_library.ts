import { PROJECT_EDITOR_CURVES_DIRECTORY } from '@/project/fs/project_editor_folder.js';
import { curveFileNameReadable, curveFileStem } from '@/curve/model/curve_file.js';

/** Folder of the project that saved curves go into (committed with the project). */
export const CURVE_LIBRARY_PROJECT_FOLDER = PROJECT_EDITOR_CURVES_DIRECTORY;

/** Prefix of the virtual curve paths the project browser shows in a room. */
export const CURVE_LIBRARY_VIRTUAL_ROOT = '//Curves';

/**
 * Where curves live:
 *
 * - Project: AiWorldEd/Curves of the open project (offline, or the room owner);
 * - Remote: the room owner's curves, as a room member sees them;
 * - Local: a room member's own AiWorldEd/Curves.
 */
export type CurveLibrarySourceId = 'project' | 'remote' | 'local';

/** One curve file of a source. */
export interface CurveLibraryEntry {
  /**
   * File name with a curve extension, such as "Profile.aicurve" (legacy
   * ".curve" and ".json" curve files too).
   */
  fileName: string;
  /** Size in bytes. */
  size: number;
  /** Last change in milliseconds. */
  lastModified: number;
}

/** A place curves are listed, read from and saved to. */
export interface CurveLibrarySource {
  readonly id: CurveLibrarySourceId;
  /** Returns whether curves can be saved here right now. */
  writable(): boolean;
  /** Returns why saving is not possible, or null. */
  readOnlyReason?(): string | null;
  /** Returns the curves, sorted or not. */
  list(): readonly CurveLibraryEntry[];
  /** Reads a curve file. */
  read(fileName: string): Promise<string>;
  /**
   * Writes a curve file, replacing one of the same name only with overwrite.
   * Rejects with {@link CurveLibraryExistsError} when it exists and overwrite is
   * false.
   */
  write(fileName: string, text: string, overwrite: boolean): Promise<void>;
}

/** Thrown by a write that would replace a curve without permission. */
export class CurveLibraryExistsError extends Error {
  /**
   * Creates the error.
   *
   * @param fileName Existing file.
   */
  constructor(readonly fileName: string) {
    super(`${fileName} already exists`);
  }
}

/** Registered sources. */
const curveLibrarySources = new Map<CurveLibrarySourceId, CurveLibrarySource>();
/** Change listeners. */
const curveLibraryListeners = new Set<() => void>();

/**
 * Registers or removes a source.
 *
 * @param id Source id.
 * @param source Source, or null to remove it.
 */
export function curveLibrarySourceSet(id: CurveLibrarySourceId, source: CurveLibrarySource | null): void {
  if (source === null) curveLibrarySources.delete(id);
  else curveLibrarySources.set(id, source);
  curveLibraryChanged();
}

/**
 * Returns a registered source.
 *
 * @param id Source id.
 * @returns Source, or null.
 */
export function curveLibrarySource(id: CurveLibrarySourceId): CurveLibrarySource | null {
  return curveLibrarySources.get(id) ?? null;
}

/**
 * Returns the registered sources in display order: project, remote, local.
 *
 * @returns Sources.
 */
export function curveLibrarySourcesList(): CurveLibrarySource[] {
  return (['project', 'remote', 'local'] as const).flatMap((id) => curveLibrarySources.get(id) ?? []);
}

/**
 * Listens for changed curve lists.
 *
 * @param listener Called after a change.
 * @returns Removes the listener.
 */
export function curveLibraryListen(listener: () => void): () => void {
  curveLibraryListeners.add(listener);
  return () => curveLibraryListeners.delete(listener);
}

/** Tells listeners that a curve list changed. */
export function curveLibraryChanged(): void {
  for (const listener of [...curveLibraryListeners]) {
    try {
      listener();
    } catch {
      continue;
    }
  }
}

/**
 * Returns the label of a source.
 *
 * @param id Source id.
 * @returns Label.
 */
export function curveLibrarySourceLabel(id: CurveLibrarySourceId): string {
  return { project: 'Curves', remote: 'Remote', local: 'Local' }[id];
}

/**
 * Returns the path the project browser uses for a curve: the real project path
 * for the project, a virtual one for remote and local curves.
 *
 * @param id Source id.
 * @param fileName File name.
 * @returns Path.
 */
export function curveLibraryPath(id: CurveLibrarySourceId, fileName: string): string {
  if (id === 'project') return `${CURVE_LIBRARY_PROJECT_FOLDER}/${fileName}`;
  return `${curveLibraryFolder(id)}/${fileName}`;
}

/**
 * Returns the virtual folder of a remote or local source.
 *
 * @param id Source id.
 * @returns Folder path.
 */
export function curveLibraryFolder(id: Exclude<CurveLibrarySourceId, 'project'>): string {
  return `${CURVE_LIBRARY_VIRTUAL_ROOT}/${curveLibrarySourceLabel(id)}`;
}

/**
 * Splits a virtual remote or local curve path.
 *
 * @param path Path.
 * @returns Source and file name, or null for other paths.
 */
export function curveLibraryPathParse(path: string): { id: CurveLibrarySourceId; fileName: string } | null {
  for (const id of ['remote', 'local'] as const) {
    const prefix = `${curveLibraryFolder(id)}/`;
    if (path.startsWith(prefix) && curveLibraryFileNameValid(path.slice(prefix.length)))
      return { id, fileName: path.slice(prefix.length) };
  }
  return null;
}

/**
 * Reads a curve by a virtual path.
 *
 * @param path Virtual remote or local path.
 * @returns Text, or null when the path is not virtual.
 */
export function curveLibraryPathRead(path: string): Promise<string> | null {
  const parsed = curveLibraryPathParse(path);
  if (parsed === null) return null;
  const source = curveLibrarySources.get(parsed.id);
  if (!source) return Promise.reject(new Error(`${curveLibrarySourceLabel(parsed.id)} curves are not available.`));
  return source.read(parsed.fileName);
}

/**
 * Returns whether a file name is a plain curve file name (no folders): a
 * non-empty name with .aicurve, or legacy .curve or .json.
 *
 * @param fileName File name.
 * @returns True when valid.
 */
export function curveLibraryFileNameValid(fileName: string): boolean {
  return (
    fileName.length <= 128 &&
    curveFileNameReadable(fileName) &&
    curveFileStem(fileName).trim() !== '' &&
    !/[\\/:*?"<>|\u0000-\u001f]/.test(fileName) &&
    !fileName.startsWith('.')
  );
}

/**
 * Returns the display name of a curve file.
 *
 * @param fileName File name.
 * @returns Name without its extension (.aicurve, .curve or .json).
 */
export function curveLibraryDisplayName(fileName: string): string {
  return curveFileStem(fileName);
}
