import { userIdle } from '@/utils/user_idle.js';
import { projectFileReaderSet } from '@/project/project_file_access.js';
import { ControllerProject, type ControllerProjectEvent } from '@/project/controller/controller_project.js';
import { PROJECT_PICKER_READ_ONLY_NOTICE, projectPickerHandleSupported } from '@/project/fs/project_picker.js';
import type { ProjectFileRecord } from '@/project/scan/project_snapshot.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectSnapshotFromEntries } from '@/project/scan/project_snapshot_entries.js';
import { ProjectAutosave } from '@/project/autosave/project_autosave.js';
import { ControllerProjectHistory } from '@/project/history/controller_project_history.js';
import { PanelProject, type PanelProjectState } from '@/project/ui/panel_project.js';
import { ProjectSceneOpener } from './project_scene_opener.js';
import type { HostProjectEditor, ProjectModelPlacement } from './host_project_editor.js';
import type { ProjectFileKind } from '@/project/fs/project_file_kind.js';
import { CurveThumbnails } from '@/curve/ui/curve_thumbnails.js';
import { ProjectTextureCacheHost } from './project_texture_cache_host.js';
import { curveProjectAccessSet } from '@/curve/ui/curve_project_access.js';
import {
  curveLibraryFolder,
  curveLibraryListen,
  curveLibraryPath,
  curveLibraryPathParse,
  curveLibraryPathRead,
  curveLibrarySource,
  curveLibrarySourceLabel,
} from '@/curve/library/curve_library.js';
import { curveLibraryCopy } from '@/curve/library/curve_library_actions.js';
import type { MenuContextItem } from '@/ui/menu/menu_context.js';
import type { ProjectSnapshot } from '@/project/scan/project_snapshot.js';
import { ProjectCurveSources } from './project_curve_sources.js';

/** File kinds that are models, added to the scene by double-click or menu. */
const CONTROLLER_PROJECT_EDITOR_MODEL_KINDS: ReadonlySet<ProjectFileKind> = new Set(['glb', 'fbx', 'obj', 'vmf']);

/** Explains what to do with a curve file. */
export const CONTROLLER_PROJECT_EDITOR_CURVE_HINT =
  'Drag a .aicurve file onto a curve field, such as a Column profile.';

/** Explains the read-only room project to a room member. */
export const CONTROLLER_PROJECT_EDITOR_ROOM_NOTICE =
  "You are in a collaboration room: this is the room owner's project, read-only, including its Remote curves. Your own folder comes back when you work offline.";

/** Panel notice while a member looks at their own Local curves in a room. */
export const CONTROLLER_PROJECT_EDITOR_LOCAL_NOTICE =
  'Local: your own curves, saved on this computer. Saving in a room always goes here. Copy curves from Remote to keep them.';

/** Shown while the browser cannot keep a live project folder. */
export const CONTROLLER_PROJECT_EDITOR_UNSUPPORTED =
  'This browser cannot keep a live project folder (Firefox and Safari lack the File System Access API). ' +
  'You can still open a read-only copy; use Chrome, Edge or the desktop app for live updates and autosave.';

/** Optional overrides for tests. */
export interface ControllerProjectEditorOptions {
  project?: ControllerProject;
  autosave?: ProjectAutosave;
  storage?: Storage | null;
}

/**
 * Connects the project folder to the editor: the project panel, scene and model
 * opening, texture selection and the autosave.
 */
export class ControllerProjectEditor {
  readonly project: ControllerProject;
  readonly panel: PanelProject;
  readonly autosave: ProjectAutosave;
  readonly textureCache: ProjectTextureCacheHost;
  /** Level History: autosaves and snapshots of the open project. */
  readonly history: ControllerProjectHistory;
  private readonly host: HostProjectEditor;
  private readonly opener: ProjectSceneOpener;
  private readonly unsubscribers: (() => void)[];
  private notice: string | null;
  private renderQueued: boolean;
  private roomShown: boolean;
  private roomScenePending: boolean;
  private readonly curveThumbnails = new CurveThumbnails(() => this.renderQueue());
  private readonly curveSources: ProjectCurveSources;

  /**
   * Creates the project panel and controllers; {@link start} restores the last
   * project.
   *
   * @param host Editor services.
   * @param options Test overrides.
   */
  constructor(host: HostProjectEditor, options: ControllerProjectEditorOptions = {}) {
    this.host = host;
    this.project = options.project ?? new ControllerProject({ library: host.textureLibrary() });
    this.autosave =
      options.autosave ??
      new ProjectAutosave({
        fileSystem: () => this.project.fileSystem(),
        capture: () => host.sceneCapture(),
        library: () => host.textureLibrary(),
        thumbnail: host.history?.thumbnail,
        title: host.history?.title,
        revision: host.history?.revision,
        state: host.history?.state,
      });
    this.opener = new ProjectSceneOpener(host, this.project, this.autosave, options.storage);
    this.history = this.historyCreate();
    this.curveSources = new ProjectCurveSources(this.project);
    this.textureCache = new ProjectTextureCacheHost({
      project: this.project,
      live: () => host.textureIdsLive?.() ?? [],
      loading: () => this.opener.sceneLoading(),
      idle: userIdle(),
      inRoom: () => host.roomActive?.() === true,
    });
    this.panel = new PanelProject(
      host.container,
      {
        onOpen: () => void this.project.open(),
        onReopen: () => void this.project.reopen(),
        onClose: () => void this.close(),
        onActivate: (record) => void this.activate(record),
        thumbnail: (record) => this.thumbnail(record),
        menu: (record) => this.menu(record),
        folderDropAccepts: (folder) => this.curveDropTarget(folder) !== null,
        folderDrop: (folder, path) => void this.curveDrop(folder, path),
      },
      host.anchor(),
    );
    this.notice = projectPickerHandleSupported() ? null : CONTROLLER_PROJECT_EDITOR_UNSUPPORTED;
    this.renderQueued = false;
    this.roomShown = false;
    this.roomScenePending = false;
    this.unsubscribers = [
      this.project.listenerAdd((event) => this.onEvent(event)),
      host.textureLibrary().listenerAdd(() => this.renderQueue()),
      curveLibraryListen(() => this.renderQueue()),
    ];
    this.render();
  }

  /** Restores the last project and starts following scene changes. */
  start(): void {
    this.curveAccessRegister();
    this.curveSources.update();
    this.unsubscribers.push(this.host.historyListen(() => this.autosave.changed()));
    const flush = () => void this.autosave.flush();
    window.addEventListener('pagehide', flush);
    this.unsubscribers.push(() => window.removeEventListener('pagehide', flush));
    void this.project.restore();
  }

  /**
   * Opens a project folder, or asks again for the remembered one.
   *
   * @returns True when a project is open afterwards.
   */
  openOrReopen(): Promise<boolean> {
    return this.project.pendingName() !== null ? this.project.reopen() : this.project.open();
  }

  /** Tells the autosave which scene is now in the editor after any load. */
  sceneLoaded(): void {
    this.autosave.sceneSet(this.opener.loadingPath());
  }

  /**
   * Makes a snapshot of a level file just opened outside the project panel.
   *
   * @returns Resolves once written.
   */
  async levelOpened(): Promise<void> {
    await this.autosave.snapshot();
  }

  /**
   * Makes a snapshot of the level just saved to its file, and of the room when
   * in one.
   *
   * @returns Resolves once written.
   */
  async levelSaved(): Promise<void> {
    await this.autosave.snapshot();
    await this.host.historyRoom?.()?.snapshot();
  }

  /**
   * Builds the Level History over this project, its autosave and the room.
   *
   * @returns Level History controller.
   */
  private historyCreate(): ControllerProjectHistory {
    const host = this.host;
    return new ControllerProjectHistory({
      container: host.container,
      fileSystem: () => this.project.fileSystem(),
      autosave: this.autosave,
      restore: (document) => this.opener.documentLoad(document),
      room: () => host.historyRoom?.() ?? null,
      inRoom: () => host.roomActive?.() === true,
    });
  }

  /** Stops watching, autosaving and listening. */
  dispose(): void {
    curveProjectAccessSet(null);
    projectFileReaderSet(null);
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    this.curveSources.dispose();
    this.textureCache.dispose();
    this.autosave.dispose();
    this.project.dispose();
    this.panel.dispose();
  }

  /** Writes the pending autosave, then closes the project. */
  private async close(): Promise<void> {
    await this.autosave.flush();
    await this.project.close();
  }

  /**
   * Updates the panel after a project event.
   *
   * @param event Project event.
   */
  private onEvent(event: ControllerProjectEvent): void {
    if (event.type === 'status') return this.statusShow(event.message);
    if (event.type === 'suspended') this.roomShown = true;
    if (event.type === 'suspended' || event.type === 'closed') this.textureCache.projectClosed();
    if (event.type === 'closed') this.closedShow();
    if (event.type === 'opened') this.openedShow(event.fileSystem);
    this.curveSources.update();
    this.render();
  }

  /**
   * Resets the panel notice after a close; leaving a room keeps its scene for
   * the local autosave.
   */
  private closedShow(): void {
    if (this.roomShown) {
      this.roomShown = false;
      this.roomScenePending = true;
      this.autosave.sceneSet(null);
      return;
    }
    this.notice = projectPickerHandleSupported() ? null : CONTROLLER_PROJECT_EDITOR_UNSUPPORTED;
  }

  /**
   * Shows an opened project: offers a newer autosave, or, right after a room
   * ended, autosaves the room's scene into the project instead.
   *
   * @param fileSystem Opened project.
   */
  private openedShow(fileSystem: ProjectFileSystem): void {
    this.notice = null;
    this.textureCache.projectOpened(fileSystem);
    if (!this.roomScenePending) return void this.opener.recoveryOffer(fileSystem);
    this.roomScenePending = false;
    this.autosave.changed();
  }

  /**
   * Shows a project status message.
   *
   * @param message Message; empty messages only refresh the panel.
   */
  private statusShow(message: string): void {
    if (message === PROJECT_PICKER_READ_ONLY_NOTICE) this.notice = message;
    else if (message !== '') this.host.status(message);
    this.render();
    if (message !== '' && message !== PROJECT_PICKER_READ_ONLY_NOTICE) this.panel.setStatusMessage(message);
  }

  /**
   * Opens, imports or applies a file the user double-clicked (or a model chosen
   * from its menu).
   *
   * @param record File record.
   * @param placement Where a model lands: in front of the last used view, or
   *   where the file places it.
   */
  private async activate(record: ProjectFileRecord, placement: ProjectModelPlacement = 'view'): Promise<void> {
    if (record.kind === 'texture') return this.host.textureSelect(record.path);
    if (record.kind === 'curve') return this.statusShow(CONTROLLER_PROJECT_EDITOR_CURVE_HINT);
    if (this.project.suspendedReason() !== null) return this.statusShow(CONTROLLER_PROJECT_EDITOR_ROOM_NOTICE);
    await this.opener.open(record, placement);
  }

  /**
   * Returns a tile preview: the texture image, or a drawing of a curve file.
   *
   * @param record File record.
   * @returns Image URL, or null while none is ready.
   */
  private thumbnail(record: ProjectFileRecord): string | null {
    if (record.kind !== 'curve') return this.host.textureLibrary().getEntryById(record.path)?.previewObjectUrl ?? null;
    return this.curveThumbnails.get(record.path, record.lastModified, () => this.fileText(record.path));
  }

  /**
   * Reads a file of the open project, or a Remote or Local curve, as text.
   *
   * @param path Project or virtual curve path.
   * @returns File text.
   */
  private async fileText(path: string): Promise<string> {
    const virtual = curveLibraryPathRead(path);
    if (virtual !== null) return virtual;
    const fileSystem = this.project.fileSystem();
    if (!fileSystem) throw new Error('No project is open.');
    return (await fileSystem.fileRead(path)).text();
  }

  /** Lets curve fields load from the open project. */
  private curveAccessRegister(): void {
    projectFileReaderSet(async (path) => {
      const fileSystem = this.project.fileSystem();
      if (!fileSystem) throw new Error('No project is open.');
      return fileSystem.fileRead(path);
    });
    curveProjectAccessSet({ read: (path) => this.fileText(path) });
  }

  /**
   * Updates thumbnails (the whole room project) soon, once for a burst of
   * texture loads.
   */
  private renderQueue(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    setTimeout(() => {
      this.renderQueued = false;
      if (this.project.suspendedReason() !== null) this.render();
      else this.panel.thumbnailsRefresh();
    }, 100);
  }

  /** Re-renders the panel from the project state. */
  private render(): void {
    this.panel.render(this.state());
  }

  /**
   * Builds the panel state.
   *
   * @returns Panel state.
   */
  private state(): PanelProjectState {
    if (this.project.suspendedReason() !== null) return this.roomState();
    const fileSystem = this.project.fileSystem();
    return {
      name: fileSystem?.name ?? null,
      pending: this.project.pendingName(),
      snapshot: this.project.snapshot(),
      notice: this.notice,
      watchMode: fileSystem?.watchMode() ?? 'none',
      writable: fileSystem?.writable ?? false,
    };
  }

  /**
   * Builds the read-only panel state of the room owner's project.
   *
   * @returns Panel state.
   */
  private roomState(): PanelProjectState {
    const library = this.host.textureLibrary();
    return {
      name: library.getFolderName() ?? 'Room',
      pending: null,
      snapshot: this.roomCurvesAdd(projectSnapshotFromEntries(library.getEntries())),
      notice: CONTROLLER_PROJECT_EDITOR_ROOM_NOTICE,
      noticeLocal:
        curveLibrarySource('local') === null
          ? undefined
          : { folder: curveLibraryFolder('local'), text: CONTROLLER_PROJECT_EDITOR_LOCAL_NOTICE },
      watchMode: 'none',
      writable: false,
      room: true,
    };
  }

  /**
   * Adds the room's curves to the member's view: the owner's under
   * Curves/Remote and the member's own under Curves/Local.
   *
   * @param snapshot Room snapshot.
   * @returns The snapshot with curve records.
   */
  private roomCurvesAdd(snapshot: ProjectSnapshot): ProjectSnapshot {
    for (const id of ['remote', 'local'] as const) {
      const source = curveLibrarySource(id);
      if (source === null) continue;
      const directory = curveLibraryFolder(id);
      snapshot.directories.add(directory);
      for (const entry of source.list()) {
        const path = curveLibraryPath(id, entry.fileName);
        const record = { path, name: entry.fileName, directory, kind: 'curve' as const };
        snapshot.files.set(path, { ...record, size: entry.size, lastModified: entry.lastModified });
      }
    }
    return snapshot;
  }

  /**
   * Returns a tile's context menu: a model file can be added where the file
   * places it (double-click puts it in front of the view), and a Remote curve
   * copies to Local. The owner's Remote curves are read-only, so nothing copies
   * the other way.
   *
   * @param record File record.
   * @returns Items, none for other files.
   */
  private menu(record: ProjectFileRecord): MenuContextItem[] {
    if (CONTROLLER_PROJECT_EDITOR_MODEL_KINDS.has(record.kind))
      return [{ label: 'Add at Original Location', callback: () => void this.activate(record, 'original') }];
    if (curveLibraryPathParse(record.path)?.id !== 'remote' || curveLibrarySource('local') === null) return [];
    const disabled = curveLibrarySource('local')?.writable() !== true;
    const label = `Copy to Local${disabled ? ' (Read-Only)' : ''}`;
    return [{ label, disabled, callback: () => void this.curveDrop(curveLibraryFolder('local'), record.path) }];
  }

  /**
   * Returns the Local curves when a folder row stands for them and they take
   * copies; Remote never does.
   *
   * @param folder Folder path.
   * @returns Local , or null.
   */
  private curveDropTarget(folder: string): 'local' | null {
    return folder === curveLibraryFolder('local') && curveLibrarySource('local')?.writable() === true ? 'local' : null;
  }

  /**
   * Copies a Remote curve to Local, asking Yes/No before overwriting.
   *
   * @param folder Target folder row.
   * @param path Dragged curve path.
   */
  private async curveDrop(folder: string, path: string): Promise<void> {
    const to = this.curveDropTarget(folder);
    const parsed = curveLibraryPathParse(path);
    const from = parsed === null ? null : curveLibrarySource(parsed.id);
    const target = to === null ? null : curveLibrarySource(to);
    if (parsed?.id !== 'remote' || from === null || target === null) return;
    const where = curveLibrarySourceLabel(target.id);
    try {
      const copied = await curveLibraryCopy(from, target, parsed.fileName, (title, message) =>
        this.host.confirm(title, message, 'Yes', 'No'),
      );
      this.statusShow(
        copied ? `Copied ${parsed.fileName} to ${where}` : `Kept the existing ${parsed.fileName} in ${where}`,
      );
    } catch (error) {
      this.statusShow(error instanceof Error && error.message ? error.message : `Copying ${parsed.fileName} failed.`);
    }
  }
}
