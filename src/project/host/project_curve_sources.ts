import {
  CURVE_LIBRARY_PROJECT_FOLDER,
  CurveLibraryExistsError,
  curveLibraryChanged,
  curveLibraryFileNameValid,
  curveLibrarySourceSet,
  type CurveLibraryEntry,
  type CurveLibrarySource,
} from '@/curve/library/curve_library.js';
import type { ControllerProject } from '@/project/controller/controller_project.js';
import { projectEditorFolderPrepare } from '@/project/fs/project_editor_folder.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';

/**
 * Offers the project's AiWorldEd/Curves to curve tools: as "project" while the
 * project is open, and as "local" while it is put away in a room, so a member
 * keeps their own curves next to the owner's.
 */
export class ProjectCurveSources {
  private local: CurveLibraryEntry[] = [];
  private localFileSystem: ProjectFileSystem | null = null;
  private registered: { project: boolean; local: boolean } = { project: false, local: false };

  /**
   * Creates the sources; {@link update} registers them.
   *
   * @param project Project controller.
   */
  constructor(private readonly project: ControllerProject) {}

  /** Registers or removes the sources after a project change. */
  update(): void {
    const open = this.project.suspendedReason() === null && this.project.fileSystem() !== null;
    if (open !== this.registered.project) {
      this.registered.project = open;
      curveLibrarySourceSet('project', open ? this.projectSource() : null);
    } else if (open) curveLibraryChanged();
    const parked = this.project.parkedFileSystem();
    if (parked !== this.localFileSystem) {
      this.localFileSystem = parked;
      this.local = [];
      this.registered.local = parked !== null;
      curveLibrarySourceSet('local', parked === null ? null : this.localSource(parked));
      if (parked !== null) void this.localRefresh();
    }
  }

  /** Removes both sources. */
  dispose(): void {
    if (this.registered.project) curveLibrarySourceSet('project', null);
    if (this.registered.local) curveLibrarySourceSet('local', null);
    this.registered = { project: false, local: false };
    this.localFileSystem = null;
  }

  /**
   * The open project's curves, listed from its live snapshot.
   *
   * @returns Source.
   */
  private projectSource(): CurveLibrarySource {
    const fileSystem = () => {
      const current = this.project.suspendedReason() === null ? this.project.fileSystem() : null;
      if (current === null) throw new Error('No project is open.');
      return current;
    };
    return {
      id: 'project',
      writable: () => this.project.suspendedReason() === null && this.project.fileSystem()?.writable === true,
      readOnlyReason: () => (this.project.fileSystem()?.writable === true ? null : 'The project folder is read-only.'),
      list: () =>
        [...this.project.snapshot().files.values()]
          .filter(
            (record) => record.directory === CURVE_LIBRARY_PROJECT_FOLDER && curveLibraryFileNameValid(record.name),
          )
          .map((record) => ({ fileName: record.name, size: record.size, lastModified: record.lastModified })),
      read: async (fileName) => (await fileSystem().fileRead(projectCurvePath(fileName))).text(),
      write: async (fileName, text, overwrite) => {
        await projectCurveWrite(fileSystem(), fileName, text, overwrite);
        await this.project.watcherCurrent()?.rescan();
        curveLibraryChanged();
      },
    };
  }

  /**
   * A room member's own curves, from the project put away while in the room.
   *
   * @param fileSystem Parked project.
   * @returns Source.
   */
  private localSource(fileSystem: ProjectFileSystem): CurveLibrarySource {
    return {
      id: 'local',
      writable: () => fileSystem.writable,
      readOnlyReason: () => (fileSystem.writable ? null : 'Your project folder is read-only.'),
      list: () => this.local,
      read: async (fileName) => (await fileSystem.fileRead(projectCurvePath(fileName))).text(),
      write: async (fileName, text, overwrite) => {
        await projectCurveWrite(fileSystem, fileName, text, overwrite);
        await this.localRefresh();
      },
    };
  }

  /** Lists the member's own curves again. */
  private async localRefresh(): Promise<void> {
    const fileSystem = this.localFileSystem;
    if (fileSystem === null) return;
    const entries = await fileSystem.directoryList(CURVE_LIBRARY_PROJECT_FOLDER, () => true).catch(() => []);
    if (fileSystem !== this.localFileSystem) return;
    this.local = entries
      .filter((entry) => entry.kind === 'file' && curveLibraryFileNameValid(entry.name))
      .map((entry) => ({ fileName: entry.name, size: entry.size ?? 0, lastModified: entry.lastModified ?? 0 }));
    curveLibraryChanged();
  }
}

/**
 * Returns the project path of a curve.
 *
 * @param fileName File name.
 * @returns Path.
 */
function projectCurvePath(fileName: string): string {
  if (!curveLibraryFileNameValid(fileName)) throw new Error(`${fileName} is not a curve file name.`);
  return `${CURVE_LIBRARY_PROJECT_FOLDER}/${fileName}`;
}

/**
 * Writes a curve into AiWorldEd/Curves, refusing to replace one unless asked.
 *
 * @param fileSystem Project folder.
 * @param fileName File name.
 * @param text File text.
 * @param overwrite True to replace an existing file.
 */
async function projectCurveWrite(
  fileSystem: ProjectFileSystem,
  fileName: string,
  text: string,
  overwrite: boolean,
): Promise<void> {
  const path = projectCurvePath(fileName);
  if (!fileSystem.writable) throw new Error('The project folder is read-only.');
  if (!overwrite) {
    const existing = await fileSystem.directoryList(CURVE_LIBRARY_PROJECT_FOLDER, () => false).catch(() => []);
    const lower = fileName.toLowerCase();
    if (existing.some((entry) => entry.name.toLowerCase() === lower)) throw new CurveLibraryExistsError(fileName);
  }
  await projectEditorFolderPrepare(fileSystem);
  await fileSystem.fileWrite(path, text);
}
