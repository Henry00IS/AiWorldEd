import { DialogCollaborationBase } from '@/collaboration/ui/dialog_collaboration_base.js';
import { SocketCollaborationClosedError } from '@/collaboration/net/socket_collaboration_closed_error.js';
import { runtimeCollaborationClosedErrorText } from '@/collaboration/runtime/runtime_collaboration_close_text.js';
import {
  uiCollaborationButton,
  uiCollaborationButtons,
  uiCollaborationInput,
  uiCollaborationText,
  uiCollaborationTextSet,
} from '@/collaboration/ui/ui_collaboration_elements.js';
import {
  roomCollaborationDisplayName,
  roomCollaborationMatches,
} from '@/collaboration/ui/room_collaboration_listing.js';
import type { SessionCollaborationRoomInfo } from '@/collaboration/session/session_collaboration_types.js';
import type { RuntimeCollaborationRoomsWatcher } from '@/collaboration/runtime/runtime_collaboration_rooms_watch.js';

/** Choice made in the room browser. */
export type DialogCollaborationRoomsChoice =
  { action: 'join'; room: SessionCollaborationRoomInfo } | { action: 'create' };

/** Live room list the browser subscribes to while it is open. */
export interface DialogCollaborationRoomsSource {
  /**
   * Starts the live list.
   *
   * @param watcher Receives the list now and after every change.
   */
  watch(watcher: RuntimeCollaborationRoomsWatcher): Promise<void>;
  /** Ends the live list. */
  unwatch(): void;
}

/** Longest search text in the room browser. */
export const DIALOG_COLLABORATION_ROOMS_SEARCH_LENGTH = 128;

/**
 * Sorts rooms: public first, then by the shown name.
 *
 * @param rooms Rooms.
 * @returns Sorted copy.
 */
export function dialogCollaborationRoomsSort(
  rooms: readonly SessionCollaborationRoomInfo[],
): SessionCollaborationRoomInfo[] {
  return [...rooms].sort(
    (a, b) =>
      Number(a.private) - Number(b.private) ||
      roomCollaborationDisplayName(a).localeCompare(roomCollaborationDisplayName(b)) ||
      a.id.localeCompare(b.id),
  );
}

/** Lists the relay's rooms live, with search, join and create actions. */
export class DialogCollaborationRooms extends DialogCollaborationBase<DialogCollaborationRoomsChoice> {
  private readonly source: DialogCollaborationRoomsSource;
  private readonly search: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly status: HTMLElement;
  private rooms: SessionCollaborationRoomInfo[];
  private disposed: boolean;

  /**
   * Builds the dialog and subscribes to the live room list.
   *
   * @param host Modal host.
   * @param server Relay URL shown to the user.
   * @param source Live room list.
   */
  constructor(host: HTMLElement, server: string, source: DialogCollaborationRoomsSource) {
    super(host, 'Collaboration rooms', 720);
    this.source = source;
    this.rooms = [];
    this.disposed = false;
    this.search = dialogCollaborationRoomsSearch(() => this.render());
    this.list = dialogCollaborationRoomsList();
    this.status = uiCollaborationText('Loading rooms...', 'muted');
    this.body.append(
      uiCollaborationText(`Server: ${server}`, 'muted'),
      this.search,
      this.list,
      this.status,
      uiCollaborationButtons(
        uiCollaborationButton('Close', false, () => this.finish(null)),
        uiCollaborationButton('Create room...', true, () => this.finish({ action: 'create' })),
      ),
    );
    void this.subscribe();
  }

  /** Subscribes to the live list; failures show the inline Retry notice. */
  async subscribe(): Promise<void> {
    uiCollaborationTextSet(this.status, 'Loading rooms...', 'muted');
    try {
      await this.source.watch({ update: (rooms) => this.roomsSet(rooms), lost: (error) => this.failed(error) });
      if (this.disposed) this.source.unwatch();
    } catch (error) {
      this.failed(error);
    }
  }

  /** Ends the subscription and removes the dialog. */
  override dispose(): void {
    if (!this.disposed) this.source.unwatch();
    this.disposed = true;
    super.dispose();
  }

  /**
   * Stores a new room list and shows it.
   *
   * @param rooms Every listed room.
   */
  private roomsSet(rooms: SessionCollaborationRoomInfo[]): void {
    if (this.disposed) return;
    this.rooms = dialogCollaborationRoomsSort(rooms);
    this.render();
  }

  /**
   * Shows the unreachable notice in place of the list.
   *
   * @param error Failure.
   */
  private failed(error: unknown): void {
    if (this.disposed) return;
    this.rooms = [];
    this.list.replaceChildren(this.unreachable(error));
    uiCollaborationTextSet(this.status, '', 'muted');
  }

  /**
   * Builds the inline "server unreachable" notice with a Retry button, shown in
   * the list instead of a modal so the editor stays usable.
   *
   * @param error Load failure.
   * @returns Notice element.
   */
  private unreachable(error: unknown): HTMLElement {
    const notice = document.createElement('div');
    notice.dataset['collaborationUnreachable'] = 'true';
    notice.style.display = 'flex';
    notice.style.alignItems = 'center';
    notice.style.gap = '10px';
    notice.style.padding = '10px 8px';
    const text = uiCollaborationText(dialogCollaborationRoomsFailureText(error), 'bad');
    text.style.flex = '1';
    text.style.margin = '0';
    notice.append(
      text,
      uiCollaborationButton('Retry', false, () => void this.subscribe()),
    );
    return notice;
  }

  /** Shows the rooms that match the search text. */
  private render(): void {
    const shown = this.rooms.filter((room) => roomCollaborationMatches(room, this.search.value));
    this.list.replaceChildren(...shown.map((room) => this.row(room)));
    uiCollaborationTextSet(this.status, dialogCollaborationRoomsCount(shown.length, this.rooms.length), 'muted');
  }

  /**
   * Creates one room row.
   *
   * @param room Room.
   * @returns Row element.
   */
  private row(room: SessionCollaborationRoomInfo): HTMLElement {
    const row = document.createElement('div');
    row.dataset['collaborationRoom'] = room.id;
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.padding = '6px 8px';
    row.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
    row.append(dialogCollaborationRoomsName(room), dialogCollaborationRoomsUsers(room), this.joinButton(room));
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
 * Describes how many rooms are listed.
 *
 * @param shown Rooms matching the search.
 * @param total All rooms.
 * @returns Status text.
 */
function dialogCollaborationRoomsCount(shown: number, total: number): string {
  if (total === 0) return 'No rooms yet. Create one to share your scene.';
  const rooms = total === 1 ? 'room' : 'rooms';
  if (shown === total) return `${total} ${rooms}`;
  return `${shown} of ${total} ${rooms} ${shown === 1 ? 'matches' : 'match'}`;
}

/**
 * Creates the search box that filters the list as the user types.
 *
 * @param changed Called on every edit.
 * @returns Input.
 */
function dialogCollaborationRoomsSearch(changed: () => void): HTMLInputElement {
  const search = uiCollaborationInput('', DIALOG_COLLABORATION_ROOMS_SEARCH_LENGTH, 'room-search');
  search.type = 'search';
  search.placeholder = 'Search rooms or owners';
  search.setAttribute('aria-label', 'Search rooms or owners');
  search.style.display = 'block';
  search.style.width = '100%';
  search.style.boxSizing = 'border-box';
  search.style.marginTop = '8px';
  search.addEventListener('input', changed);
  return search;
}

/**
 * Creates the scrolling list container, sized to most of the viewport.
 *
 * @returns List element.
 */
function dialogCollaborationRoomsList(): HTMLElement {
  const list = document.createElement('div');
  list.dataset['collaborationRoomList'] = 'true';
  list.style.height = 'max(240px, calc(100vh - 280px))';
  list.style.overflowY = 'auto';
  list.style.border = '1px solid rgba(255,255,255,0.08)';
  list.style.borderRadius = '6px';
  list.style.background = 'rgba(0,0,0,0.25)';
  list.style.margin = '8px 0';
  return list;
}

/**
 * Creates the name label of a room, with the owner when the name lacks it.
 *
 * @param room Room.
 * @returns Label.
 */
function dialogCollaborationRoomsName(room: SessionCollaborationRoomInfo): HTMLElement {
  const name = document.createElement('span');
  name.textContent = `${room.private ? '\u{1F512} ' : ''}${roomCollaborationDisplayName(room)}`;
  name.title = `${room.private ? 'Private room (password required)' : 'Public room'}, owner ${room.owner}`;
  name.style.flex = '1';
  name.style.overflow = 'hidden';
  name.style.textOverflow = 'ellipsis';
  name.style.whiteSpace = 'nowrap';
  return name;
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

/**
 * Explains why the room list could not load: relay refusals and unreachable
 * relays get their own sentence, anything else names the raw failure.
 *
 * @param error Load failure.
 * @returns Message.
 */
export function dialogCollaborationRoomsFailureText(error: unknown): string {
  if (error instanceof SocketCollaborationClosedError) return runtimeCollaborationClosedErrorText(error);
  const detail = error instanceof Error ? error.message : String(error);
  return `Can't reach the collaboration server (${detail}).`;
}
