import type { RuntimeCollaborationState } from '@/collaboration/runtime/runtime_collaboration_client.js';
import {
  memberCollaborationCss,
  type MemberCollaborationEntry,
} from '@/collaboration/sync/member_collaboration_roster.js';
import { clipboardCollaborationButton } from '@/collaboration/ui/clipboard_collaboration_copy.js';
import { PanelCollaborationUsers } from '@/collaboration/ui/panel_collaboration_users.js';
import { uiCollaborationButton, uiCollaborationDot } from '@/collaboration/ui/ui_collaboration_elements.js';
import { styleFloatingPanelChromeButton } from '@/ui/floating_panel/panel_floating_title_bar.js';
import { statusBarLabelStyle } from '@/ui/status/status_bar.js';

/** What the indicator shows. */
export interface IndicatorCollaborationView {
  state: RuntimeCollaborationState;
  room: string;
  self: number;
  members: MemberCollaborationEntry[];
  locks: ReadonlyMap<number, number>;
  password: string;
  /** Owner moderation callbacks, absent for other members. */
  permissionSet?: (user: number, allowed: boolean) => Promise<void>;
  memberKick?: (user: number) => Promise<void>;
  /** Open relay connections worldwide, when the relay reports them. */
  online?: number | null;
}

/** Most member swatches shown in the status bar chip. */
const INDICATOR_COLLABORATION_SWATCHES = 12;

/** Dot color and caption per state. */
const INDICATOR_COLLABORATION_STATES: Readonly<Record<RuntimeCollaborationState, [string, string]>> = {
  offline: ['#6a6a6a', 'Offline'],
  connecting: ['#e0c050', 'Connecting...'],
  lobby: ['#5aa0e0', 'Online'],
  joining: ['#e0c050', 'Joining...'],
  syncing: ['#e0c050', 'Synchronizing...'],
  room: ['#4ec27a', 'Room'],
  reconnecting: ['#e07050', 'Reconnecting...'],
};

/**
 * Returns the indicator caption.
 *
 * @param view Current view.
 * @returns Caption.
 */
export function indicatorCollaborationCaption(view: IndicatorCollaborationView): string {
  const caption = INDICATOR_COLLABORATION_STATES[view.state][1];
  if (view.state === 'lobby' && typeof view.online === 'number')
    return `${caption} \u00b7 ${view.online} Worldwide \u{1F310}`;
  if (view.state !== 'room') return caption;
  const viewing = view.members.find((member) => member.user === view.self)?.canEdit === false ? 'Viewing \u00b7 ' : '';
  return `${viewing}${view.room} \u00b7 ${view.members.length} User${view.members.length === 1 ? '' : 's'}`;
}

/** Connection status chip in the status bar with a floating users window. */
export class IndicatorCollaborationStatus {
  private readonly chip: HTMLButtonElement;
  private readonly dot: HTMLElement;
  private readonly label: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly users: PanelCollaborationUsers;
  private readonly onOpen: () => void;
  private view: IndicatorCollaborationView | null;

  /**
   * Creates the chip inside the status bar.
   *
   * @param statusBar Status bar root.
   * @param onOpen Opens the room browser when not in a room.
   * @param panelHost Host for the floating users window.
   */
  constructor(statusBar: HTMLElement, onOpen: () => void, panelHost: HTMLElement = statusBar) {
    this.onOpen = onOpen;
    this.view = null;
    this.dot = uiCollaborationDot('#6a6a6a');
    this.label = document.createElement('span');
    statusBarLabelStyle(this.label);
    this.strip = indicatorCollaborationStrip();
    this.chip = indicatorCollaborationChip(this.dot, this.label, this.strip);
    this.chip.addEventListener('click', (event) => this.clicked(event));
    this.users = new PanelCollaborationUsers(panelHost, () => Math.max(0, statusBar.offsetHeight));
    const panel = statusBar.lastElementChild ?? statusBar;
    panel.insertBefore(this.chip, panel.firstChild);
  }

  /**
   * Shows a new state.
   *
   * @param view Current view.
   */
  update(view: IndicatorCollaborationView): void {
    this.view = view;
    this.dot.style.background = INDICATOR_COLLABORATION_STATES[view.state][0];
    this.label.textContent = indicatorCollaborationCaption(view);
    this.chip.title = view.state === 'room' ? 'Show users in this room' : 'Open online rooms';
    this.strip.replaceChildren(...(view.state === 'room' ? indicatorCollaborationSwatches(view) : []));
    if (view.state !== 'room') {
      this.users.hide(true);
      return;
    }
    if (this.users.isOpen()) this.usersRefresh();
  }

  /** Removes the chip and users window. */
  dispose(): void {
    this.users.dispose();
    this.chip.remove();
  }

  /**
   * Toggles the users window, or opens the browser outside a room.
   *
   * @param event Click event.
   */
  private clicked(event: MouseEvent): void {
    event.stopPropagation();
    if (this.view?.state !== 'room') return this.onOpen();
    if (this.users.isOpen()) return this.users.hide(true);
    this.users.openNear(this.usersTitle(), this.usersRows(), this.chip);
  }

  /** Rebuilds the open users window from the current view. */
  private usersRefresh(): void {
    this.users.contentSet(this.usersTitle(), this.usersRows());
  }

  /**
   * Returns the users window title.
   *
   * @returns Title text.
   */
  private usersTitle(): string {
    const room = this.view?.room ?? '';
    return room === '' ? 'Users' : `Users \u00b7 ${room}`;
  }

  /**
   * Builds the member and password rows for the users window, in one grid whose
   * owner-only columns hold the edit and kick controls.
   *
   * @returns The grid element, or nothing outside a room.
   */
  private usersRows(): HTMLElement[] {
    const view = this.view;
    if (view === null) return [];
    const owner = view.members.find((member) => member.user === view.self)?.owner === true;
    const grid = document.createElement('div');
    grid.className = 'editor-collaboration-users-grid';
    grid.style.display = 'grid';
    grid.style.columnGap = '8px';
    grid.style.gridTemplateColumns = `9px minmax(120px, 1fr) max-content${owner ? ' max-content max-content' : ''}`;
    grid.append(...view.members.map((member) => indicatorCollaborationMember(member, view)));
    if (view.password !== '') grid.append(indicatorCollaborationPassword(view.password));
    return [grid];
  }
}

/**
 * Creates the chip button.
 *
 * @param dot Status dot.
 * @param label Caption.
 * @param strip Member color strip.
 * @returns Button.
 */
function indicatorCollaborationChip(dot: HTMLElement, label: HTMLElement, strip: HTMLElement): HTMLButtonElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'editor-collaboration-status';
  chip.style.display = 'inline-flex';
  chip.style.alignItems = 'center';
  chip.style.gap = '6px';
  chip.style.padding = '0 8px';
  chip.style.marginRight = '10px';
  chip.style.background = 'transparent';
  chip.style.border = 'none';
  statusBarLabelStyle(chip);
  chip.style.cursor = 'pointer';
  chip.append(dot, label, strip);
  return chip;
}

/**
 * Creates the always visible strip of member colors next to the caption.
 *
 * @returns Strip element.
 */
function indicatorCollaborationStrip(): HTMLElement {
  const strip = document.createElement('span');
  strip.className = 'editor-collaboration-strip';
  strip.style.display = 'inline-flex';
  strip.style.alignItems = 'center';
  strip.style.gap = '3px';
  return strip;
}

/**
 * Creates one swatch per member in user order, then a count of the rest.
 *
 * @param view Current view.
 * @returns Swatch elements.
 */
export function indicatorCollaborationSwatches(view: IndicatorCollaborationView): HTMLElement[] {
  const shown = view.members.slice(0, INDICATOR_COLLABORATION_SWATCHES);
  const swatches = shown.map((member) => {
    const swatch = uiCollaborationDot(memberCollaborationCss(member.color));
    swatch.title = member.user === view.self ? `${member.name} (you)` : member.name;
    if (member.user === view.self) swatch.style.boxShadow = '0 0 0 1px #ffffff';
    return swatch;
  });
  const hidden = view.members.length - shown.length;
  if (hidden <= 0) return swatches;
  const more = document.createElement('span');
  more.textContent = `+${hidden}`;
  statusBarLabelStyle(more);
  return [...swatches, more];
}

/**
 * /** Creates one member row.
 *
 * @param member Member.
 * @param view Current view.
 * @returns Row element.
 */
function indicatorCollaborationMember(member: MemberCollaborationEntry, view: IndicatorCollaborationView): HTMLElement {
  const row = document.createElement('div');
  row.className = 'editor-collaboration-member';
  row.style.cssText = 'display:grid;grid-template-columns:subgrid;grid-column:1 / -1;align-items:center;height:24px';
  const name = document.createElement('span');
  const tags = [member.user === view.self ? 'you' : '', member.owner ? 'owner' : ''].filter((tag) => tag !== '');
  name.textContent = `${member.name}${tags.length > 0 ? ` (${tags.join(', ')})` : ''}`;
  name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  name.title = name.textContent;
  const locks = document.createElement('span');
  const count = view.locks.get(member.user) ?? 0;
  locks.textContent = count > 0 ? `editing ${count}` : member.canEdit ? 'Editor' : 'Viewer';
  locks.style.color = '#9a9a9a';
  locks.style.whiteSpace = 'nowrap';
  row.append(uiCollaborationDot(memberCollaborationCss(member.color)), name, locks);
  if (!member.owner && view.members.find((entry) => entry.user === view.self)?.owner)
    row.append(...indicatorCollaborationControls(member, view));
  return row;
}

/**
 * Creates the room password row with reveal and copy buttons, so it can be
 * shared.
 *
 * @param password Room password.
 * @returns Row element.
 */
export function indicatorCollaborationPassword(password: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'editor-collaboration-password';
  row.style.cssText =
    'grid-column:1 / -1;display:flex;align-items:center;gap:6px;padding:6px 0;margin-top:4px;border-top:1px solid rgba(255,255,255,0.1)';
  const value = document.createElement('span');
  value.textContent = '\u2022'.repeat(8);
  value.style.flex = '1';
  value.style.fontFamily = 'monospace';
  const reveal = uiCollaborationButton('Show', false, () => {
    const hidden = reveal.textContent === 'Show';
    value.textContent = hidden ? password : '\u2022'.repeat(8);
    reveal.textContent = hidden ? 'Hide' : 'Show';
  });
  reveal.style.minWidth = '0';
  const copy = clipboardCollaborationButton(() => password, 'Copy the room password to share it');
  row.append(document.createTextNode('Password'), value, reveal, copy);
  return row;
}

/**
 * Creates owner-only edit and kick controls, resolved by authoritative replies.
 *
 * @param member Target current member.
 * @param view Current room UI state.
 * @returns Controls for the member row.
 */
function indicatorCollaborationControls(
  member: MemberCollaborationEntry,
  view: IndicatorCollaborationView,
): HTMLElement[] {
  const label = document.createElement('label');
  label.style.cssText = 'display:inline-flex;align-items:center;gap:4px;height:20px;white-space:nowrap';
  const checkbox = document.createElement('input');
  checkbox.style.margin = '0';
  checkbox.type = 'checkbox';
  checkbox.checked = member.canEdit;
  checkbox.setAttribute('aria-label', `Allow ${member.name} to edit`);
  checkbox.addEventListener('change', () => {
    checkbox.disabled = true;
    view
      .permissionSet?.(member.user, checkbox.checked)
      .catch(() => {
        checkbox.checked = member.canEdit;
      })
      .finally(() => {
        checkbox.disabled = false;
      });
  });
  label.append(checkbox, document.createTextNode('Edit'));
  const kick = uiCollaborationButton('Kick', false, () => {
    kick.disabled = true;
    view
      .memberKick?.(member.user)
      .finally(() => {
        kick.disabled = false;
      })
      .catch(() => undefined);
  });
  styleFloatingPanelChromeButton(kick);
  kick.style.height = label.style.height;
  kick.setAttribute('aria-label', `Kick ${member.name} from room`);
  kick.style.minWidth = '0';
  return [label, kick];
}
