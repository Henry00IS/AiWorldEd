import { ControllerCollaborationChat } from '@/collaboration/chat/controller_collaboration_chat.js';
import { roomCollaborationDefaultName } from '@/collaboration/ui/room_collaboration_default_name.js';
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
import {
  DialogCollaborationSnapshots,
  dialogCollaborationSnapshotsLabel,
} from '@/collaboration/ui/dialog_collaboration_snapshots.js';
import type { SnapshotCollaborationRestoreReport } from '@/collaboration/snapshot/owner_collaboration_snapshot.js';
import type { SessionCollaborationRoom } from '@/collaboration/session/session_collaboration_room.js';
import { IndicatorCollaborationStatus } from '@/collaboration/ui/indicator_collaboration_status.js';
import {
  showMessageBox,
  showMessageChoice,
  type MessageBoxChoice,
  type MessageBoxOptions,
} from '@/ui/dialog/dialog_message_box.js';

/**
 * Collaborate menu backend, loaded on first use: connects the dialogs, the
 * status indicator and the runtime.
 */
export class ControllerCollaboration {
  readonly runtime: RuntimeCollaboration;
  private readonly host: HostCollaborationEditor;
  private readonly storage: ConfigCollaborationStorage | null;
  private readonly development: boolean;
  private indicator: IndicatorCollaborationStatus | null;
  private chatController: ControllerCollaborationChat | null;
  private chatSession: object | null;
  private readonly modalsOpen: Set<string>;

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
    this.chatController = null;
    this.chatSession = null;
    this.modalsOpen = new Set();
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

  /**
   * Runs a dialog flow only when no other flow of the same kind is open, so
   * repeated triggers (menu clicks, close events) never stack modals.
   *
   * @param kind Modal kind.
   * @param run Flow to run.
   */
  private async modalOnce(kind: string, run: () => Promise<void>): Promise<void> {
    if (this.modalsOpen.has(kind)) return;
    this.modalsOpen.add(kind);
    try {
      await run();
    } finally {
      this.modalsOpen.delete(kind);
    }
  }

  /** Opens the room browser. */
  async rooms(): Promise<void> {
    await this.modalOnce('flow', () => this.roomsRun());
  }

  /** Room browser flow. */
  private async roomsRun(): Promise<void> {
    this.indicatorEnsure();
    if (this.inRoom()) return this.runtime.status('Leave the current room before joining another');
    const dialog = new DialogCollaborationRooms(this.host.container, this.url(), {
      watch: (watcher) => this.runtime.roomsWatchStart(watcher),
      unwatch: () => this.runtime.roomsUnwatch(),
    });
    const choice = await dialog.open();
    if (choice?.action === 'create') await this.createRun();
    else if (choice?.action === 'join') await this.joinRun(choice.room);
  }

  /** Opens the create dialog and creates the room. */
  async create(): Promise<void> {
    await this.modalOnce('flow', () => this.createRun());
  }

  /** Create room flow. */
  private async createRun(): Promise<void> {
    this.indicatorEnsure();
    if (this.inRoom()) return this.runtime.status('Leave the current room first');
    const name = configCollaborationNameGet(this.storage);
    const dialog = new DialogCollaborationCreate(this.host.container, roomCollaborationDefaultName(name), name);
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
    await this.modalOnce('flow', () => this.joinRun(room));
  }

  /**
   * Join flow.
   *
   * @param room Room to join.
   */
  private async joinRun(room: SessionCollaborationRoomInfo): Promise<void> {
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
    await this.modalOnce('flow', () => this.leaveRun());
  }

  /** Leave flow. */
  private async leaveRun(): Promise<void> {
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

  /**
   * Returns whether this client owns the active room.
   *
   * @returns True for the room owner.
   */
  isOwner(): boolean {
    return this.runtime.session !== null && this.runtime.owner;
  }

  /** Lists the room snapshots and restores the chosen one (owner only). */
  async snapshots(): Promise<void> {
    await this.modalOnce('flow', () => this.snapshotsRun());
  }

  /** Snapshot restore flow. */
  private async snapshotsRun(): Promise<void> {
    const session = this.runtime.session;
    if (session === null || !this.runtime.owner)
      return this.runtime.status('Only the room owner can restore the scene');
    const choice = await new DialogCollaborationSnapshots(this.host.container, {
      list: () => session.snapshots.list(),
      take: () => session.snapshots.take('manual'),
    }).open();
    if (choice === null) return;
    const confirmed = await showMessageBox({
      host: this.host.container,
      title: 'Restore scene',
      message: `Set the room back to ${dialogCollaborationSnapshotsLabel(choice, Date.now())} for everyone? You can undo this.`,
      confirmLabel: 'Restore',
      cancelLabel: 'Cancel',
    });
    if (!confirmed || this.runtime.session !== session) return;
    await this.snapshotsReport(session, await session.snapshots.restore(choice.id));
  }

  /**
   * Shows the outcome of a restore that skipped objects or failed.
   *
   * @param session Room session.
   * @param report Restore outcome.
   */
  private async snapshotsReport(
    session: SessionCollaborationRoom,
    report: SnapshotCollaborationRestoreReport,
  ): Promise<void> {
    if (report.ok && report.skipped.length === 0) return;
    const holders = [...new Set(report.skipped.filter((skip) => skip.holder >= 0).map((skip) => skip.holder))];
    const names = holders.map((holder) => session.roster.nameOf(holder)).join(', ');
    const detail = names === '' ? '' : ` Members editing them: ${names}.`;
    await this.notice(
      report.ok ? 'Scene restored with exceptions' : 'Restore failed',
      `${report.message}.${detail}`,
      false,
    );
  }

  /** Opens the room chat window. */
  chat(): void {
    this.chatEnsure().open();
  }

  /** Opens the settings dialog. */
  async settings(): Promise<void> {
    await this.modalOnce('flow', () => this.settingsRun());
  }

  /** Settings flow. */
  private async settingsRun(): Promise<void> {
    const current = {
      url: this.storage?.getItem(CONFIG_COLLABORATION_URL_KEY) ?? '',
      name: configCollaborationNameGet(this.storage),
    };
    const result = await new DialogCollaborationSettings(
      this.host.container,
      current,
      configCollaborationUrlDefault(this.development),
      this.roomDisplayName(),
    ).open();
    if (result === null || this.storage === null) return;
    configCollaborationUrlSet(this.storage, result.url);
    configCollaborationNameSet(this.storage, result.name);
    this.host.status('Collaboration settings saved');
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
   * @param offline True when the room ended for this user.
   */
  private async notice(title: string, message: string, offline: boolean): Promise<void> {
    if (offline) return this.offlineChoose(title, message);
    const host = this.host.container;
    await this.modalOnce(`notice:${title}`, async () => {
      await showMessageBox({ host, title, message, confirmLabel: 'OK', cancelLabel: 'Close' });
    });
  }

  /**
   * Asks a user whose room ended how to go on: save, save and work offline, or
   * work offline. The scene always stays; only one such dialog is ever open.
   *
   * @param title Title.
   * @param message Explanation.
   */
  private async offlineChoose(title: string, message: string): Promise<void> {
    if (this.modalsOpen.has('offline')) return;
    const picked: { choice: MessageBoxChoice } = { choice: 'cancel' };
    await this.modalOnce('offline', async () => {
      picked.choice = await showMessageChoice(
        controllerCollaborationOfflineOptions(this.host.container, title, message, this.runtime.state === 'lobby'),
      );
    });
    if (picked.choice !== 'extra' && this.runtime.session === null) this.runtime.disconnect();
    if (picked.choice !== 'cancel') this.host.sceneSaveLocal();
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
   * Returns the name this user joined the current room with.
   *
   * @returns Name, or null when not in a room.
   */
  private roomDisplayName(): string | null {
    if (!this.inRoom()) return null;
    const self = this.runtime.user();
    const member = this.runtime.session?.roster.list().find((entry) => entry.user === self);
    return member?.name ?? configCollaborationNameGet(this.storage);
  }

  /**
   * Returns the room chat, creating it on first use.
   *
   * @returns Chat controller.
   */
  private chatEnsure(): ControllerCollaborationChat {
    if (this.chatController === null) {
      this.chatController = new ControllerCollaborationChat(this.host, this.runtime);
      this.chatSession = null;
      this.chatSync();
    }
    return this.chatController;
  }

  /** Starts or ends the room chat when a room session starts or ends. */
  private chatSync(): void {
    const session = this.runtime.session;
    if (session === this.chatSession) return;
    if (session !== null) this.chatEnsure();
    this.chatSession = session;
    if (session === null) this.chatController?.roomLeft();
    else this.chatController?.roomEntered(this.runtime.room?.name ?? '');
  }

  /** Redraws the room surfaces after a state or roster change. */
  private changed(): void {
    this.indicatorUpdate();
    this.chatSync();
  }

  /**
   * Builds the runtime listener.
   *
   * @returns Listener.
   */
  private listener(): RuntimeCollaborationListener {
    return {
      stateChanged: () => this.changed(),
      rosterChanged: () => this.changed(),
      chat: (message) => {
        this.chatSync();
        this.chatController?.received(message);
      },
      notice: (title, message, offline) => void this.notice(title, message, offline),
    };
  }
}

/** Explains what stays and what goes when a room ends. */
export const CONTROLLER_COLLABORATION_OFFLINE_NOTE =
  'Your copy of the scene stays open. Textures that only the room owner had show as pink checkerboards until they are on your disk; their paths are kept.';

/**
 * Builds the dialog shown when a room ends: Save (stay online, in the room
 * list), Save & continue offline, or Continue offline.
 *
 * @param host Dialog host.
 * @param title Title.
 * @param message Explanation.
 * @param online True while still connected to the relay, so staying online is
 *   possible.
 * @returns Message box options.
 */
export function controllerCollaborationOfflineOptions(
  host: HTMLElement,
  title: string,
  message: string,
  online: boolean,
): MessageBoxOptions {
  return {
    host,
    title,
    message,
    boldMessage: CONTROLLER_COLLABORATION_OFFLINE_NOTE,
    confirmLabel: 'Save & continue offline',
    cancelLabel: 'Continue offline',
    ...(online ? { extraLabel: 'Save' } : {}),
  };
}
