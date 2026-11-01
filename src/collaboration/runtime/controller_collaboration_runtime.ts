import {
  CONFIG_COLLABORATION_URL_KEY,
  configCollaborationNameGet,
  configCollaborationNameSet,
  configCollaborationStorage,
  configCollaborationUrlDefault,
  configCollaborationUrlGet,
  configCollaborationUrlSet,
  type ConfigCollaborationStorage,
} from '@/collaboration/config/config_collaboration_server.js';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import { SocketCollaborationBrowser } from '@/collaboration/net/socket_collaboration_browser.js';
import type { SocketCollaborationFactory } from '@/collaboration/net/socket_collaboration_types.js';
import {
  RuntimeCollaboration,
  type RuntimeCollaborationListener,
} from '@/collaboration/runtime/runtime_collaboration_client.js';
import {
  runtimeCollaborationErrorText,
  runtimeCollaborationJoinFailure,
  type RuntimeCollaborationJoinFailure,
} from '@/collaboration/runtime/runtime_collaboration_errors.js';
import type { SessionCollaborationRoomInfo } from '@/collaboration/session/session_collaboration_types.js';
import { DialogCollaborationCreate } from '@/collaboration/ui/dialog_collaboration_create.js';
import { DialogCollaborationJoin } from '@/collaboration/ui/dialog_collaboration_join.js';
import { DialogCollaborationRooms } from '@/collaboration/ui/dialog_collaboration_rooms.js';
import { DialogCollaborationSettings } from '@/collaboration/ui/dialog_collaboration_settings.js';
import { IndicatorCollaborationStatus } from '@/collaboration/ui/indicator_collaboration_status.js';
import { showMessageBox } from '@/ui/dialog/dialog_message_box.js';

/**
 * Online menu backend, loaded on first use: connects the dialogs, the status
 * indicator and the runtime.
 */
export class ControllerCollaboration {
  readonly runtime: RuntimeCollaboration;
  private readonly host: HostCollaborationEditor;
  private readonly storage: ConfigCollaborationStorage | null;
  private readonly development: boolean;
  private indicator: IndicatorCollaborationStatus | null;

  /**
   * Creates the controller.
   *
   * @param host Editor services.
   * @param development True in a development build.
   * @param factory Socket factory.
   * @param storage Settings storage.
   */
  constructor(
    host: HostCollaborationEditor,
    development: boolean,
    factory: SocketCollaborationFactory = (url) => new SocketCollaborationBrowser(url),
    storage: ConfigCollaborationStorage | null = configCollaborationStorage(),
  ) {
    this.host = host;
    this.storage = storage;
    this.development = development;
    this.indicator = null;
    const options = { url: () => this.url(), name: () => configCollaborationNameGet(this.storage), factory };
    this.runtime = new RuntimeCollaboration(host, options, this.listener());
  }

  /**
   * Returns whether a room is active (joined, joining or synchronizing).
   *
   * @returns True in a room.
   */
  inRoom(): boolean {
    return this.runtime.session !== null || this.runtime.state === 'joining';
  }

  /**
   * Returns whether the relay connection is up or being restored.
   *
   * @returns True when not offline.
   */
  isConnected(): boolean {
    return this.runtime.state !== 'offline';
  }

  /** Opens the room browser. */
  async rooms(): Promise<void> {
    this.indicatorEnsure();
    if (this.inRoom()) return this.runtime.status('Leave the current room before joining another');
    const dialog = new DialogCollaborationRooms(this.host.container, this.url(), () => this.runtime.rooms());
    const choice = await dialog.open();
    if (choice?.action === 'create') await this.create();
    else if (choice?.action === 'join') await this.join(choice.room);
  }

  /** Opens the create dialog and creates the room. */
  async create(): Promise<void> {
    this.indicatorEnsure();
    if (this.inRoom()) return this.runtime.status('Leave the current room first');
    const name = configCollaborationNameGet(this.storage);
    const dialog = new DialogCollaborationCreate(this.host.container, `${name || 'My'} room`, name);
    const result = await dialog.open();
    if (result === null) return;
    this.displayNameSave(result.displayName);
    try {
      await this.runtime.create(result.name, result.private, result.password);
    } catch (error) {
      await this.notice('Could not create the room', runtimeCollaborationErrorText(error), false);
    }
  }

  /**
   * Joins a room after confirming that local work is discarded.
   *
   * @param room Room to join.
   */
  async join(room: SessionCollaborationRoomInfo): Promise<void> {
    if (!(await this.discardConfirm(room.name))) return;
    let error = '';
    for (;;) {
      const name = configCollaborationNameGet(this.storage);
      const result = await new DialogCollaborationJoin(this.host.container, room, name, error).open();
      if (result === null) return;
      this.displayNameSave(result.displayName);
      const failure = await this.joinAttempt(room.id, result.password);
      if (failure === null) return;
      error = failure.text;
      if (!room.private || !failure.retry) break;
    }
    await this.notice('Could not join the room', error, false);
  }

  /** Leaves the current room after confirmation. */
  async leave(): Promise<void> {
    if (!this.inRoom()) return;
    const owner = this.runtime.owner;
    const message = owner
      ? 'You own this room. Leaving closes it for everyone; they keep their copy offline.'
      : 'Your copy of the scene stays here as offline work.';
    const confirmed = await showMessageBox({
      host: this.host.container,
      title: 'Leave room',
      message,
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
    });
    if (confirmed) await this.runtime.leave();
  }

  /** Opens the settings dialog. */
  async settings(): Promise<void> {
    const current = {
      url: this.storage?.getItem(CONFIG_COLLABORATION_URL_KEY) ?? '',
      name: configCollaborationNameGet(this.storage),
    };
    const result = await new DialogCollaborationSettings(
      this.host.container,
      current,
      configCollaborationUrlDefault(this.development),
    ).open();
    if (result === null || this.storage === null) return;
    configCollaborationUrlSet(this.storage, result.url);
    configCollaborationNameSet(this.storage, result.name);
    this.host.status('Online settings saved');
  }

  /** Disconnects from the relay. */
  disconnect(): void {
    this.runtime.disconnect();
  }

  /**
   * Stores the display name typed into a create or join dialog.
   *
   * @param name Valid display name.
   */
  private displayNameSave(name: string): void {
    if (this.storage !== null) configCollaborationNameSet(this.storage, name);
  }

  /**
   * Tries to join once.
   *
   * @param room Room id.
   * @param password Password.
   * @returns Failure, or null on success.
   */
  private async joinAttempt(room: string, password: string): Promise<RuntimeCollaborationJoinFailure | null> {
    try {
      await this.runtime.join(room, password);
      return null;
    } catch (error) {
      return runtimeCollaborationJoinFailure(error);
    }
  }

  /**
   * Asks before local work is replaced by the room scene.
   *
   * @param roomName Room being joined.
   * @returns True when the user accepted.
   */
  private async discardConfirm(roomName: string): Promise<boolean> {
    if (!this.host.sceneHasWork()) return true;
    return showMessageBox({
      host: this.host.container,
      title: 'Discard local work?',
      message: `Joining "${roomName}" replaces your current scene and undo history with the room's scene.`,
      boldMessage: 'Unsaved changes will be lost. Save first (File \u2192 Save) if you want to keep them.',
      confirmLabel: 'Discard and join',
      cancelLabel: 'Cancel',
    });
  }

  /**
   * Shows a notice; offline notices offer to save the scene locally.
   *
   * @param title Title.
   * @param message Explanation.
   * @param offline True when the user now works offline.
   */
  private async notice(title: string, message: string, offline: boolean): Promise<void> {
    const host = this.host.container;
    if (!offline) {
      await showMessageBox({ host, title, message, confirmLabel: 'OK', cancelLabel: 'Close' });
      return;
    }
    const save = await showMessageBox({
      host,
      title,
      message,
      confirmLabel: 'Save locally',
      cancelLabel: 'Continue offline',
    });
    if (save) this.host.sceneSaveLocal();
  }

  /**
   * Returns the relay URL.
   *
   * @returns URL.
   */
  private url(): string {
    return configCollaborationUrlGet(this.storage, this.development);
  }

  /** Creates the status indicator on first use. */
  private indicatorEnsure(): void {
    const statusBar = this.host.statusBarElement();
    if (this.indicator !== null || statusBar === null) return;
    this.indicator = new IndicatorCollaborationStatus(statusBar, () => void this.rooms());
    this.indicatorUpdate();
  }

  /** Redraws the status indicator. */
  private indicatorUpdate(): void {
    const session = this.runtime.session;
    const locks = new Map<number, number>();
    session?.sync.replica.locks.byUser().forEach((ids, user) => locks.set(user, ids.length));
    this.indicator?.update({
      state: this.runtime.state,
      room: this.runtime.room?.name ?? '',
      self: this.runtime.user(),
      members: session?.roster.list() ?? [],
      locks,
      password: this.runtime.password,
    });
  }

  /**
   * Builds the runtime listener.
   *
   * @returns Listener.
   */
  private listener(): RuntimeCollaborationListener {
    return {
      stateChanged: () => this.indicatorUpdate(),
      rosterChanged: () => this.indicatorUpdate(),
      notice: (title, message, offline) => void this.notice(title, message, offline),
    };
  }
}
