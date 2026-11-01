import { ControllerProject, type ControllerProjectEvent } from '@/project/controller/controller_project.js';
import { PROJECT_PICKER_READ_ONLY_NOTICE, projectPickerHandleSupported } from '@/project/fs/project_picker.js';
import type { ProjectFileRecord } from '@/project/scan/project_snapshot.js';
import { ProjectAutosave } from '@/project/autosave/project_autosave.js';
import { PanelProject, type PanelProjectState } from '@/project/ui/panel_project.js';
import { ProjectSceneOpener } from './project_scene_opener.js';
import type { HostProjectEditor } from './host_project_editor.js';

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
  private readonly host: HostProjectEditor;
  private readonly opener: ProjectSceneOpener;
  private readonly unsubscribers: (() => void)[];
  private notice: string | null;
  private renderQueued: boolean;

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
      new ProjectAutosave({ fileSystem: () => this.project.fileSystem(), capture: () => host.sceneCapture() });
    this.opener = new ProjectSceneOpener(host, this.project, this.autosave, options.storage);
    this.panel = new PanelProject(
      host.container,
      {
        onOpen: () => void this.project.open(),
        onReopen: () => void this.project.reopen(),
        onClose: () => void this.close(),
        onActivate: (record) => void this.activate(record),
        thumbnail: (record) => host.textureLibrary().getEntryById(record.path)?.previewObjectUrl ?? null,
      },
      host.anchor(),
    );
    this.notice = projectPickerHandleSupported() ? null : CONTROLLER_PROJECT_EDITOR_UNSUPPORTED;
    this.renderQueued = false;
    this.unsubscribers = [
      this.project.listenerAdd((event) => this.onEvent(event)),
      host.textureLibrary().listenerAdd(() => this.renderQueue()),
    ];
    this.render();
  }

  /** Restores the last project and starts following scene changes. */
  start(): void {
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

  /** Stops watching, autosaving and listening. */
  dispose(): void {
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
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
    if (event.type === 'closed')
      this.notice = projectPickerHandleSupported() ? null : CONTROLLER_PROJECT_EDITOR_UNSUPPORTED;
    if (event.type === 'opened') {
      this.notice = null;
      void this.opener.recoveryOffer(event.fileSystem);
    }
    this.render();
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
   * Opens, imports or applies a file the user double-clicked.
   *
   * @param record File record.
   */
  private async activate(record: ProjectFileRecord): Promise<void> {
    if (record.kind === 'texture') return this.host.textureSelect(record.path);
    await this.opener.open(record);
  }

  /** Updates thumbnails soon, once for a burst of texture loads. */
  private renderQueue(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    setTimeout(() => {
      this.renderQueued = false;
      this.panel.thumbnailsRefresh();
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
}
