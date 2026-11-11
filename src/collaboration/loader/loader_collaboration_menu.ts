import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { ControllerCollaboration } from '@/collaboration/runtime/controller_collaboration_runtime.js';
import type { McpImagePublisher } from '@/ai/client/delivery_mcp_capture.js';
import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import type { ProjectHistoryRoom } from '@/project/history/controller_project_history.js';

/**
 * Collaborate menu stub that the editor always loads. It holds no sockets and
 * imports the collaboration code only on start() or when a menu entry is used.
 * It also publishes MCP captures as public links through the one relay
 * connection.
 */
export class LoaderCollaborationMenu implements McpImagePublisher {
  private readonly hostCreate: () => HostCollaborationEditor;
  private readonly development: boolean;
  private controller: ControllerCollaboration | null;
  private loading: Promise<ControllerCollaboration> | null;
  private historyOpener: (() => void) | null = null;

  /**
   * Creates the stub.
   *
   * @param hostCreate Builds the editor services on first use.
   * @param development True in a development build.
   */
  constructor(hostCreate: () => HostCollaborationEditor, development: boolean) {
    this.hostCreate = hostCreate;
    this.development = development;
    this.controller = null;
    this.loading = null;
  }

  /**
   * Loads the collaboration code and keeps the editor connected to the relay,
   * reconnecting in the background.
   *
   * @returns Resolves once the controller is loaded.
   */
  async start(): Promise<void> {
    (await this.load()).startup();
  }

  /**
   * Returns whether public transfer links can be created right now.
   *
   * @returns True while connected to a relay that announced `transfer`.
   */
  available(): boolean {
    return this.controller !== null && this.controller.transferAvailable();
  }

  /**
   * Shares a file as a public transfer link of the relay connection.
   *
   * @param file File bytes.
   * @param name File name.
   * @returns Public download URL.
   */
  async share(file: Blob, name: string): Promise<string> {
    return (await this.load()).transferPublish(file, name);
  }

  /**
   * Returns whether a room is active. Offline this is a single null check.
   *
   * @returns True while in a room.
   */
  active(): boolean {
    return this.controller !== null && this.controller.inRoom();
  }

  /**
   * Returns whether the editor stays connected; false after Disconnect.
   *
   * @returns True while online or reconnecting.
   */
  online(): boolean {
    return this.controller === null || this.controller.isOnline();
  }

  /**
   * Returns whether the user went offline with Disconnect, which grays out
   * everything but the settings and Connect.
   *
   * @returns True after Disconnect.
   */
  offlineChosen(): boolean {
    return this.controller !== null && this.controller.offlineChosen();
  }

  /**
   * Returns the owned room as the Level History sees it.
   *
   * @returns Room, or null unless this client owns the active room.
   */
  historyRoom(): ProjectHistoryRoom | null {
    return this.controller?.historyRoom() ?? null;
  }

  /**
   * Sets what Collaborate → Level History opens.
   *
   * @param open Opens the Level History.
   */
  historyOpenerSet(open: () => void): void {
    this.historyOpener = open;
  }

  /**
   * Returns the Collaborate menu entries.
   *
   * @returns Menu entries.
   */
  entries(): ToolbarMenuEntry[] {
    return [
      {
        label: 'Browse Rooms\u2026',
        onClick: () => void this.run((controller) => controller.rooms()),
        isEnabled: () => !this.offlineChosen() && !this.active(),
      },
      {
        label: 'Create Room\u2026',
        onClick: () => void this.run((controller) => controller.create()),
        isEnabled: () => !this.offlineChosen() && !this.active(),
      },
      {
        label: 'Leave Room',
        onClick: () => void this.run((controller) => controller.leave()),
        isEnabled: () => this.active(),
      },
      {
        label: 'Room Chat',
        onClick: () => void this.run(async (controller) => controller.chat()),
        isEnabled: () => this.active(),
      },
      {
        label: 'Level History\u2026',
        onClick: () => this.historyOpener?.(),
        isEnabled: () => this.historyOpener !== null && this.historyRoom() !== null,
      },
      { kind: 'separator' },
      {
        label: 'Collaboration Settings\u2026',
        onClick: () => void this.run((controller) => controller.settings()),
        isEnabled: () => !this.active(),
      },
      {
        label: 'Disconnect',
        labelLive: () => (this.online() ? 'Disconnect' : 'Connect'),
        onClick: () => void this.run((controller) => controller.connectToggle()),
      },
    ];
  }

  /**
   * Loads the controller if needed and runs an action on it.
   *
   * @param action Action to run.
   */
  async run(action: (controller: ControllerCollaboration) => Promise<void>): Promise<void> {
    await action(await this.load());
  }

  /**
   * Imports the collaboration code once.
   *
   * @returns Controller.
   */
  private load(): Promise<ControllerCollaboration> {
    this.loading ??= import('@/collaboration/runtime/controller_collaboration_runtime.js').then((module) => {
      this.controller = new module.ControllerCollaboration(this.hostCreate(), this.development);
      return this.controller;
    });
    return this.loading;
  }
}
