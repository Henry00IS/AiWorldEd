import { DialogCollaborationBase } from '@/collaboration/ui/dialog_collaboration_base.js';
import {
  uiCollaborationButton,
  uiCollaborationButtons,
  uiCollaborationText,
  uiCollaborationTextSet,
} from '@/collaboration/ui/ui_collaboration_elements.js';
import type { SessionCollaborationRoomInfo } from '@/collaboration/session/session_collaboration_types.js';

/** Choice made in the room browser. */
export type DialogCollaborationRoomsChoice =
  { action: 'join'; room: SessionCollaborationRoomInfo } | { action: 'create' };

/**
 * Sorts rooms: public first, then by name.
 *
 * @param rooms Rooms.
 * @returns Sorted copy.
 */
export function dialogCollaborationRoomsSort(
  rooms: readonly SessionCollaborationRoomInfo[],
): SessionCollaborationRoomInfo[] {
  return [...rooms].sort((a, b) => Number(a.private) - Number(b.private) || a.name.localeCompare(b.name));
}

/** Lists the relay's rooms with join, create and refresh actions. */
export class DialogCollaborationRooms extends DialogCollaborationBase<DialogCollaborationRoomsChoice> {
  private readonly load: () => Promise<SessionCollaborationRoomInfo[]>;
  private readonly list: HTMLElement;
  private readonly status: HTMLElement;

  /**
   * Builds the dialog and loads the list.
   *
   * @param host Modal host.
   * @param server Relay URL shown to the user.
   * @param load Loads the room list.
   */
  constructor(host: HTMLElement, server: string, load: () => Promise<SessionCollaborationRoomInfo[]>) {
    super(host, 'Online rooms', 520);
    this.load = load;
    this.list = dialogCollaborationRoomsList();
    this.status = uiCollaborationText('Loading rooms...', 'muted');
    this.body.append(
      uiCollaborationText(`Server: ${server}`, 'muted'),
      this.list,
      this.status,
      uiCollaborationButtons(
        uiCollaborationButton('Refresh', false, () => void this.refresh()),
        uiCollaborationButton('Close', false, () => this.finish(null)),
        uiCollaborationButton('Create room...', true, () => this.finish({ action: 'create' })),
      ),
    );
    void this.refresh();
  }

  /** Reloads the room list. */
  async refresh(): Promise<void> {
    uiCollaborationTextSet(this.status, 'Loading rooms...', 'muted');
    try {
      this.render(dialogCollaborationRoomsSort(await this.load()));
    } catch (error) {
      this.list.replaceChildren();
      uiCollaborationTextSet(
        this.status,
        `Could not reach the server: ${String((error as Error).message ?? error)}`,
        'bad',
      );
    }
  }

  /**
   * Shows the rooms.
   *
   * @param rooms Rooms.
   */
  private render(rooms: SessionCollaborationRoomInfo[]): void {
    this.list.replaceChildren(...rooms.map((room) => this.row(room)));
    const text = rooms.length === 0 ? 'No rooms yet. Create one to share your scene.' : `${rooms.length} room(s)`;
    uiCollaborationTextSet(this.status, text, 'muted');
  }

  /**
   * Creates one room row.
   *
   * @param room Room.
   * @returns Row element.
   */
  private row(room: SessionCollaborationRoomInfo): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.padding = '6px 8px';
    row.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
    const name = document.createElement('span');
    name.textContent = `${room.private ? '\u{1F512} ' : ''}${room.name}`;
    name.title = room.private ? 'Private room (password required)' : 'Public room';
    name.style.flex = '1';
    name.style.overflow = 'hidden';
    name.style.textOverflow = 'ellipsis';
    name.style.whiteSpace = 'nowrap';
    row.append(name, dialogCollaborationRoomsUsers(room), this.joinButton(room));
    return row;
  }

  /**
   * Creates the join button of a room.
   *
   * @param room Room.
   * @returns Button.
   */
  private joinButton(room: SessionCollaborationRoomInfo): HTMLButtonElement {
    const full = room.maxUsers > 0 && room.users >= room.maxUsers;
    const button = uiCollaborationButton(full ? 'Full' : 'Join', false, () => this.finish({ action: 'join', room }));
    button.disabled = full;
    button.style.minWidth = '56px';
    return button;
  }
}

/**
 * Creates the scrolling list container.
 *
 * @returns List element.
 */
function dialogCollaborationRoomsList(): HTMLElement {
  const list = document.createElement('div');
  list.style.maxHeight = '320px';
  list.style.minHeight = '60px';
  list.style.overflowY = 'auto';
  list.style.border = '1px solid rgba(255,255,255,0.08)';
  list.style.borderRadius = '6px';
  list.style.background = 'rgba(0,0,0,0.25)';
  list.style.margin = '8px 0';
  return list;
}

/**
 * Creates the user count label of a room.
 *
 * @param room Room.
 * @returns Label.
 */
function dialogCollaborationRoomsUsers(room: SessionCollaborationRoomInfo): HTMLElement {
  const users = document.createElement('span');
  users.textContent = room.maxUsers > 0 ? `${room.users}/${room.maxUsers} users` : `${room.users} users`;
  users.style.color = '#9a9a9a';
  users.style.flex = '0 0 auto';
  return users;
}
