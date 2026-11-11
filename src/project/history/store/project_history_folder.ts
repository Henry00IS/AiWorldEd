import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectPathJoin } from '@/project/fs/project_path.js';

/** Where one tree keeps its files: index.json, states and thumbnails. */
export interface ProjectHistoryFolder {
  /**
   * Reads a file.
   *
   * @param name File name.
   * @returns Contents, or null when missing or unreadable.
   */
  read(name: string): Promise<Blob | null>;
  /**
   * Writes a file, replacing it.
   *
   * @param name File name.
   * @param data Contents.
   */
  write(name: string, data: string | Blob): Promise<void>;
  /**
   * Removes a file; a missing file is no error.
   *
   * @param name File name.
   */
  remove(name: string): Promise<void>;
}

/** A tree folder inside the project folder. */
export class ProjectHistoryFolderProject implements ProjectHistoryFolder {
  readonly fileSystem: ProjectFileSystem;
  readonly path: string;

  /**
   * Creates the folder view.
   *
   * @param fileSystem Project folder.
   * @param path Project-relative tree folder.
   */
  constructor(fileSystem: ProjectFileSystem, path: string) {
    this.fileSystem = fileSystem;
    this.path = path;
  }

  /**
   * Reads a file of the tree folder.
   *
   * @param name File name.
   * @returns Contents, or null.
   */
  async read(name: string): Promise<Blob | null> {
    return this.fileSystem.fileRead(projectPathJoin(this.path, name)).catch(() => null);
  }

  /**
   * Writes a file into the tree folder.
   *
   * @param name File name.
   * @param data Contents.
   */
  async write(name: string, data: string | Blob): Promise<void> {
    await this.fileSystem.fileWrite(projectPathJoin(this.path, name), data);
  }

  /**
   * Removes a file of the tree folder.
   *
   * @param name File name.
   */
  async remove(name: string): Promise<void> {
    await this.fileSystem.fileRemove(projectPathJoin(this.path, name)).catch(() => undefined);
  }
}

/** A tree folder kept in memory, for a room while no project folder is open. */
export class ProjectHistoryFolderMemory implements ProjectHistoryFolder {
  private readonly files = new Map<string, Blob>();

  /**
   * Returns a kept file.
   *
   * @param name File name.
   * @returns Contents, or null.
   */
  async read(name: string): Promise<Blob | null> {
    return this.files.get(name) ?? null;
  }

  /**
   * Keeps a file.
   *
   * @param name File name.
   * @param data Contents.
   */
  async write(name: string, data: string | Blob): Promise<void> {
    this.files.set(name, typeof data === 'string' ? new Blob([data]) : data);
  }

  /**
   * Forgets a file.
   *
   * @param name File name.
   */
  async remove(name: string): Promise<void> {
    this.files.delete(name);
  }
}
