import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { ControllerCollaboration } from '@/collaboration/runtime/controller_collaboration_runtime.js';
import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';

/**
 * Collaborate menu stub that the editor always loads. It holds no sockets and
 * imports the collaboration code only when a menu entry is used, so offline
 * editing pays nothing beyond one null check in the scene New/Load guards.
 */
export class LoaderCollaborationMenu {
  private readonly hostCreate: () => HostCollaborationEditor;
  private readonly development: boolean;
  private controller: ControllerCollaboration | null;
  private loading: Promise<ControllerCollaboration> | null;

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
   * Returns whether a room is active. Offline this is a single null check.
   *
   * @returns True while in a room.
   */
  active(): boolean {
    return this.controller !== null && this.controller.inRoom();
  }

  /**
   * Returns the Collaborate menu entries.
   *
   * @returns Menu entries.
   */
  entries(): ToolbarMenuEntry[] {
    return [
      { label: 'Browse rooms\u2026', onClick: () => void this.run((controller) => controller.rooms()) },
      { label: 'Create room\u2026', onClick: () => void this.run((controller) => controller.create()) },
      {
        label: 'Leave room',
        onClick: () => void this.run((controller) => controller.leave()),
        isEnabled: () => this.active(),
      },
      {
        label: 'Room chat',
        onClick: () => void this.run(async (controller) => controller.chat()),
        isEnabled: () => this.active(),
      },
      {
        label: 'Restore scene from\u2026',
        onClick: () => void this.run((controller) => controller.snapshots()),
        isEnabled: () => this.controller !== null && this.controller.isOwner(),
      },
      { kind: 'separator' },
      { label: 'Collaboration settings\u2026', onClick: () => void this.run((controller) => controller.settings()) },
      {
        label: 'Disconnect',
        onClick: () => void this.run(async (controller) => controller.disconnect()),
        isEnabled: () => this.controller !== null && this.controller.isConnected(),
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
