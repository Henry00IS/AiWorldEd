import { textCount } from '@/utils/utils_plural.js';
import { curveFileTextIs } from '@/curve/model/curve_file.js';
import { sceneFileNameLegacy } from '@/io/scene_file/scene_file_extension.js';
import type { ControllerProject } from '@/project/controller/controller_project.js';
import { controllerProjectErrorText } from '@/project/controller/controller_project.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import type { ProjectFileRecord } from '@/project/scan/project_snapshot.js';
import type { ProjectAutosave } from '@/project/autosave/project_autosave.js';
import { projectTextureCacheRestore } from '@/project/textures/cache/project_texture_cache.js';
import type { ProjectAutosaveDocument } from '@/project/autosave/project_autosave_files.js';
import {
  projectAutosaveNewer,
  projectAutosaveNewest,
  projectAutosaveRead,
} from '@/project/autosave/project_autosave_recovery.js';
import type { HostProjectEditor, ProjectModelPlacement } from './host_project_editor.js';

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
  private loads = 0;

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
   * Tells whether a scene is loading right now.
   *
   * @returns True during a load.
   */
  sceneLoading(): boolean {
    return this.loads > 0;
  }

  /**
   * Opens a scene, VMF, OBJ, GLB or FBX file from the project.
   *
   * @param record File record.
   * @param placement Where a model lands: in front of the last used view, or
   *   where the file places it.
   */
  async open(record: ProjectFileRecord, placement: ProjectModelPlacement = 'view'): Promise<void> {
    const fileSystem = this.project.fileSystem();
    if (fileSystem === null) return;
    const file = await this.fileRead(fileSystem, record.path);
    if (file === null) return;
    if (record.kind === 'glb')
      return this.host.glbImport(await file.arrayBuffer(), record.name, record.path, placement);
    if (record.kind === 'fbx')
      return this.host.fbxImport(await file.arrayBuffer(), record.name, record.path, placement);
    if (record.kind === 'scene') return this.sceneOpenChecked(fileSystem, record, file);
    const text = await file.text();
    if (record.kind === 'vmf') return this.host.vmfImport(text, record.name, placement);
    if (record.kind === 'obj') return this.host.objImport(text, record.name, placement);
  }

  /**
   * Opens a project scene unless it is a legacy .json that holds a curve.
   *
   * @param fileSystem Project folder.
   * @param record Scene file record.
   * @param file Scene file.
   */
  private async sceneOpenChecked(fileSystem: ProjectFileSystem, record: ProjectFileRecord, file: File): Promise<void> {
    if (sceneFileNameLegacy(record.name) && curveFileTextIs(await file.text()))
      return this.host.status('This is a curve file: drag it onto a curve field, such as a Column profile.');
    await this.sceneOpen(fileSystem, record, file);
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
      `with ${textCount(document.objectCount, 'object')}.\n\nRestore it?`;
    if (!(await this.host.confirm('Restore Autosave', message, 'Restore', 'Not Now'))) return;
    if (this.project.fileSystem() !== fileSystem || this.host.sceneHasUnsavedWork()) return;
    await this.documentLoad(document);
  }

  /**
   * Replaces the scene with a project scene, offering a newer autosave.
   *
   * @param fileSystem Project folder.
   * @param record Scene file record.
   * @param file Scene file.
   */
  private async sceneOpen(fileSystem: ProjectFileSystem, record: ProjectFileRecord, file: File): Promise<void> {
    if (this.host.sceneBlocked(false)) return;
    if (this.host.sceneHasUnsavedWork()) {
      const message = `Open ${record.path}?\n\nAny unsaved changes will be permanently lost.`;
      if (!(await this.host.confirm('Open Scene', message, 'Open', 'Cancel'))) return;
    }
    const document = await projectAutosaveRead(fileSystem, record.path);
    if (document !== null && projectAutosaveNewer(document, record.lastModified)) {
      const message =
        `${record.path} has an autosave from ${new Date(document.savedAt).toLocaleString()} ` +
        `(${textCount(document.objectCount, 'object')}) that is newer than the file.\n\nOpen the autosave instead?`;
      this.offeredSet(document);
      if (await this.host.confirm('Recover Autosave', message, 'Open Autosave', 'Open File'))
        return void (await this.documentLoad(document));
    }
    await this.sceneLoad(file, record.path, record.name);
  }

  /**
   * Loads a saved state as the scene it came from, with the embedded textures
   * it uses from the project's texture cache. The state is already in the
   * level's history, so the autosave does not write it again.
   *
   * @param document Saved state.
   * @returns True when the scene loaded.
   */
  async documentLoad(document: ProjectAutosaveDocument): Promise<boolean> {
    const fileSystem = this.project.fileSystem();
    if (fileSystem !== null)
      await projectTextureCacheRestore(fileSystem, this.host.textureLibrary(), document.data).catch(() => 0);
    const name = `${document.sourcePath ?? 'untitled'} (saved state)`;
    if (!(await this.sceneLoad(new Blob([JSON.stringify(document.data)]), document.sourcePath, name))) return false;
    this.autosave.savedMarkSet();
    this.host.status(`Restored the state saved ${new Date(document.savedAt).toLocaleString()}`);
    return true;
  }

  /**
   * Loads a scene file while remembering where it came from.
   *
   * @param file Scene file.
   * @param path Scene path in the project, or null.
   * @param name Shown file name.
   * @returns True when the scene loaded.
   */
  private async sceneLoad(file: Blob, path: string | null, name: string): Promise<boolean> {
    this.loading = path;
    this.loads += 1;
    try {
      return await this.host.sceneLoad(file, name);
    } finally {
      this.loading = null;
      this.loads -= 1;
    }
  }

  /**
   * Reads a project file, reporting failures in the status bar.
   *
   * @param fileSystem Project folder.
   * @param path File path.
   * @returns File, or null when it could not be read.
   */
  private async fileRead(fileSystem: ProjectFileSystem, path: string): Promise<File | null> {
    try {
      return await fileSystem.fileRead(path);
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
