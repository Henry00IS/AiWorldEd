import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { PROJECT_HISTORY_ROOM_NAME_MAX } from './project_history_room_files.js';
import type { ProjectHistoryEntry } from './project_history_entry.js';

/** Characters read from the start of a file for its details. */
export const PROJECT_HISTORY_DETAILS_HEAD = 4096;

/** What a history file tells about itself near its start. */
export interface ProjectHistoryDetails {
  objectCount: number | null;
  /** Scene file the autosave belongs to. */
  sourcePath: string | null;
  /** Room a room snapshot comes from. */
  room: string | null;
}

/**
 * Reads the object count, scene path and room name from the start of an
 * autosave or room snapshot file, without parsing the scene.
 *
 * @param head Start of the file.
 * @returns Details; fields the start lacks are null.
 */
export function projectHistoryDetailsParse(head: string): ProjectHistoryDetails {
  const count = /"objectCount":(\d{1,9})[,}]/.exec(head)?.[1];
  return {
    objectCount: count === undefined ? null : Number(count),
    sourcePath: projectHistoryDetailsString(head, 'sourcePath'),
    room: projectHistoryDetailsString(head, 'room')?.slice(0, PROJECT_HISTORY_ROOM_NAME_MAX) ?? null,
  };
}

/**
 * Reads one JSON string field from the start of a file.
 *
 * @param head Start of the file.
 * @param field Field name.
 * @returns Non-empty value, or null.
 */
function projectHistoryDetailsString(head: string, field: string): string | null {
  const match = new RegExp(`"${field}":("(?:[^"\\\\]|\\\\.)*")`).exec(head)?.[1];
  if (match === undefined) return null;
  try {
    const value: unknown = JSON.parse(match);
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
}

/** Reads entry details once per file version and remembers them. */
export class ProjectHistoryDetailsReader {
  private readonly cache = new Map<string, Promise<ProjectHistoryDetails>>();

  /**
   * Returns the details of an entry's file. A failed read is not remembered, so
   * the next list refresh tries again.
   *
   * @param fileSystem Project folder.
   * @param entry History entry with a file.
   * @returns Details; all null while the file cannot be read.
   */
  read(fileSystem: ProjectFileSystem, entry: ProjectHistoryEntry): Promise<ProjectHistoryDetails> {
    const key = `${entry.path ?? entry.id}|${entry.size ?? ''}|${entry.time}`;
    const known = this.cache.get(key);
    if (known !== undefined) return known;
    const read = this.readFile(fileSystem, entry.path).then((details) => {
      if (details === null) this.cache.delete(key);
      return details ?? { objectCount: null, sourcePath: null, room: null };
    });
    this.cache.set(key, read);
    return read;
  }

  /**
   * Reads the start of a file.
   *
   * @param fileSystem Project folder.
   * @param path Project-relative path, or null.
   * @returns Details, or null when the file cannot be read.
   */
  private async readFile(fileSystem: ProjectFileSystem, path: string | null): Promise<ProjectHistoryDetails | null> {
    if (path === null) return null;
    try {
      const file = await fileSystem.fileRead(path);
      return projectHistoryDetailsParse(await file.slice(0, PROJECT_HISTORY_DETAILS_HEAD).text());
    } catch {
      return null;
    }
  }
}
