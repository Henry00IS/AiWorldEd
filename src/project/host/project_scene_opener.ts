import type { ControllerProject } from '@/project/controller/controller_project.js';
import { controllerProjectErrorText } from '@/project/controller/controller_project.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import type { ProjectFileRecord } from '@/project/scan/project_snapshot.js';
import type { ProjectAutosave } from '@/project/autosave/project_autosave.js';
import type { ProjectAutosaveDocument } from '@/project/autosave/project_autosave_files.js';
import {
  projectAutosaveNewer,
  projectAutosaveNewest,
  projectAutosaveRead,
} from '@/project/autosave/project_autosave_recovery.js';
import type { HostProjectEditor } from './host_project_editor.js';

/** Storage key of the newest autosave time already offered for recovery. */
export const PROJECT_SCENE_OPENER_OFFERED_KEY = 'aiworlded.project.autosaveOffered';

/**
 * Opens scenes and models from the project folder and offers autosave recovery
 * when an autosave holds newer work than the file.
 */
export class ProjectSceneOpener {
  private readonly host: HostProjectEditor;
  private readonly project: ControllerProject;
  private readonly autosave: ProjectAutosave;
  private readonly storage: Storage | null;
  private loading: string | null;

  /**
   * Creates the opener.
   *
   * @param host Editor services.
   * @param project Project controller.
   * @param autosave Autosave told about recovered scenes.
   * @param storage Remembers offered autosaves; defaults to localStorage.
   */
  constructor(
    host: HostProjectEditor,
    project: ControllerProject,
    autosave: ProjectAutosave,
    storage?: Storage | null,
  ) {
    this.host = host;
    this.project = project;
    this.autosave = autosave;
    this.storage = storage === undefined ? projectSceneOpenerStorage() : storage;
    this.loading = null;
  }

  /**
   * Returns the project path of the scene being loaded right now.
   *
   * @returns Scene path, or null when the load did not come from the project.
   */
  loadingPath(): string | null {
    return this.loading;
  }

  /**
   * Opens a scene, VMF or OBJ file from the project.
   *
   * @param record File record.
   */
  async open(record: ProjectFileRecord): Promise<void> {
    const fileSystem = this.project.fileSystem();
    if (fileSystem === null) return;
    const text = await this.textRead(fileSystem, record.path);
    if (text === null) return;
    if (record.kind === 'vmf') return this.host.vmfImport(text, record.name);
    if (record.kind === 'obj') return this.host.objImport(text, record.name);
    if (record.kind === 'scene') await this.sceneOpen(fileSystem, record, text);
  }

  /**
   * Offers to restore the newest autosave once after a project opens, when the
   * editor holds no work of its own.
   *
   * @param fileSystem Opened project.
   */
  async recoveryOffer(fileSystem: ProjectFileSystem): Promise<void> {
    const document = await projectAutosaveNewest(fileSystem);
    if (document === null || this.offered(document) || this.host.sceneBlocked(true)) return;
    if (this.host.sceneHasUnsavedWork()) return;
    this.offeredSet(document);
    const name = document.sourcePath ?? 'the untitled scene';
    const message =
      `Found an autosave of ${name} from ${new Date(document.savedAt).toLocaleString()} ` +
      `with ${document.objectCount} object(s).\n\nRestore it?`;
    if (!(await this.host.confirm('Restore Autosave', message, 'Restore', 'Not now'))) return;
    if (this.project.fileSystem() !== fileSystem || this.host.sceneHasUnsavedWork()) return;
    this.documentLoad(document);
  }

  /**
   * Replaces the scene with a project scene, offering a newer autosave.
   *
   * @param fileSystem Project folder.
   * @param record Scene file record.
   * @param text Scene file contents.
   */
  private async sceneOpen(fileSystem: ProjectFileSystem, record: ProjectFileRecord, text: string): Promise<void> {
    if (this.host.sceneBlocked(false)) return;
    if (this.host.sceneHasUnsavedWork()) {
      const message = `Open ${record.path}?\n\nAny unsaved changes will be permanently lost.`;
      if (!(await this.host.confirm('Open Scene', message, 'Open', 'Cancel'))) return;
    }
    const document = await projectAutosaveRead(fileSystem, record.path);
    if (document !== null && projectAutosaveNewer(document, record.lastModified)) {
      const message =
        `${record.path} has an autosave from ${new Date(document.savedAt).toLocaleString()} ` +
        `(${document.objectCount} object(s)) that is newer than the file.\n\nOpen the autosave instead?`;
      this.offeredSet(document);
      if (await this.host.confirm('Recover Autosave', message, 'Open autosave', 'Open file'))
        return this.documentLoad(document);
    }
    this.sceneLoad(text, record.path, record.name);
  }

  /**
   * Loads an autosave as the scene it came from.
   *
   * @param document Autosave.
   */
  private documentLoad(document: ProjectAutosaveDocument): void {
    const name = `${document.sourcePath ?? 'untitled'} (autosave)`;
    if (this.sceneLoad(JSON.stringify(document.data), document.sourcePath, name)) {
      this.host.status(`Restored autosave from ${new Date(document.savedAt).toLocaleString()}`);
      this.autosave.changed();
    }
  }

  /**
   * Loads scene text while remembering where it came from.
   *
   * @param text Scene JSON.
   * @param path Scene path in the project, or null.
   * @param name Shown file name.
   * @returns True when the scene loaded.
   */
  private sceneLoad(text: string, path: string | null, name: string): boolean {
    this.loading = path;
    try {
      return this.host.sceneLoad(text, name);
    } finally {
      this.loading = null;
    }
  }

  /**
   * Reads a project file as text, reporting failures.
   *
   * @param fileSystem Project folder.
   * @param path File path.
   * @returns Text, or null on failure.
   */
  private async textRead(fileSystem: ProjectFileSystem, path: string): Promise<string | null> {
    try {
      return await (await fileSystem.fileRead(path)).text();
    } catch (error) {
      this.host.status(`Could not read ${path}: ${controllerProjectErrorText(error)}`);
      return null;
    }
  }

  /**
   * Tells whether this autosave (or a newer one) was already offered.
   *
   * @param document Autosave.
   * @returns True when already offered.
   */
  private offered(document: ProjectAutosaveDocument): boolean {
    return Number(this.storage?.getItem(PROJECT_SCENE_OPENER_OFFERED_KEY) ?? 0) >= document.savedAt;
  }

  /**
   * Remembers that this autosave was offered.
   *
   * @param document Autosave.
   */
  private offeredSet(document: ProjectAutosaveDocument): void {
    try {
      this.storage?.setItem(PROJECT_SCENE_OPENER_OFFERED_KEY, String(document.savedAt));
    } catch {
      return;
    }
  }
}

/**
 * Returns localStorage when the page may use it.
 *
 * @returns Storage, or null.
 */
function projectSceneOpenerStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
