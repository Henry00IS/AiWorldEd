import type { RuntimeCollaborationState } from '@/collaboration/runtime/runtime_collaboration_client.js';
import {
  memberCollaborationCss,
  type MemberCollaborationEntry,
} from '@/collaboration/sync/member_collaboration_roster.js';
import { clipboardCollaborationButton } from '@/collaboration/ui/clipboard_collaboration_copy.js';
import { uiCollaborationButton, uiCollaborationDot } from '@/collaboration/ui/ui_collaboration_elements.js';
import { Theme } from '@/theme.js';
import { statusBarLabelStyle } from '@/ui/status/status_bar.js';

/** What the indicator shows. */
export interface IndicatorCollaborationView {
  state: RuntimeCollaborationState;
  room: string;
  self: number;
  members: MemberCollaborationEntry[];
  locks: ReadonlyMap<number, number>;
  password: string;
}

/** Most member swatches shown in the status bar chip. */
const INDICATOR_COLLABORATION_SWATCHES = 12;

/** Dot color and caption per state. */
const INDICATOR_COLLABORATION_STATES: Readonly<Record<RuntimeCollaborationState, [string, string]>> = {
  offline: ['#6a6a6a', 'Offline'],
  connecting: ['#e0c050', 'Connecting...'],
  lobby: ['#5aa0e0', 'Online (no room)'],
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
  if (view.state !== 'room') return caption;
  return `${view.room} \u00b7 ${view.members.length} user${view.members.length === 1 ? '' : 's'}`;
}

/** Connection status chip in the status bar with a member list popover. */
export class IndicatorCollaborationStatus {
  private readonly chip: HTMLButtonElement;
  private readonly dot: HTMLElement;
  private readonly label: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly popover: HTMLElement;
  private readonly onOpen: () => void;
  private readonly outside: (event: MouseEvent) => void;
  private view: IndicatorCollaborationView | null;

  /**
   * Creates the chip inside the status bar.
   *
   * @param statusBar Status bar root.
   * @param onOpen Opens the room browser when not in a room.
   */
  constructor(statusBar: HTMLElement, onOpen: () => void) {
    this.onOpen = onOpen;
    this.view = null;
    this.dot = uiCollaborationDot('#6a6a6a');
    this.label = document.createElement('span');
    statusBarLabelStyle(this.label);
    this.strip = indicatorCollaborationStrip();
    this.chip = indicatorCollaborationChip(this.dot, this.label, this.strip);
    this.chip.addEventListener('click', (event) => this.clicked(event));
    this.popover = indicatorCollaborationPopover();
    this.outside = (event) => {
      if (!this.popover.contains(event.target as Node)) this.popoverHide();
    };
    const panel = statusBar.lastElementChild ?? statusBar;
    panel.insertBefore(this.chip, panel.firstChild);
    document.body.appendChild(this.popover);
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
    if (this.popover.style.display !== 'none') this.popoverRender();
    if (view.state !== 'room') this.popoverHide();
  }

  /** Removes the chip and popover. */
  dispose(): void {
    this.popoverHide();
    this.chip.remove();
    this.popover.remove();
  }

  /**
   * Toggles the member list, or opens the browser outside a room.
   *
   * @param event Click event.
   */
  private clicked(event: MouseEvent): void {
    event.stopPropagation();
    if (this.view?.state !== 'room') return this.onOpen();
    if (this.popover.style.display !== 'none') return this.popoverHide();
    this.popoverRender();
    const rect = this.chip.getBoundingClientRect();
    this.popover.style.display = 'block';
    this.popover.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    this.popover.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 6)}px`;
    document.addEventListener('mousedown', this.outside, true);
  }

  /** Hides the member list. */
  private popoverHide(): void {
    this.popover.style.display = 'none';
    document.removeEventListener('mousedown', this.outside, true);
  }

  /** Renders the member rows. */
  private popoverRender(): void {
    const view = this.view;
    if (view === null) return;
    const rows = view.members.map((member) => indicatorCollaborationMember(member, view));
    if (view.password !== '') rows.push(indicatorCollaborationPassword(view.password));
    this.popover.replaceChildren(...rows);
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
  // A button does not inherit text styles: use the status bar label look.
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
 * Creates the member list popover.
 *
 * @returns Popover element.
 */
function indicatorCollaborationPopover(): HTMLElement {
  const popover = document.createElement('div');
  popover.className = 'editor-collaboration-users';
  popover.style.position = 'fixed';
  popover.style.display = 'none';
  popover.style.zIndex = '100000';
  popover.style.minWidth = '200px';
  popover.style.padding = '6px';
  popover.style.borderRadius = '8px';
  popover.style.background = 'rgba(28,28,28,0.98)';
  popover.style.border = '1px solid rgba(255,255,255,0.12)';
  popover.style.boxShadow = '0 10px 30px rgba(0,0,0,0.6)';
  popover.style.fontFamily = Theme.uiFontFamily;
  popover.style.fontSize = '12px';
  popover.style.color = Theme.buttonTextColor;
  return popover;
}

/**
 * Creates one member row.
 *
 * @param member Member.
 * @param view Current view.
 * @returns Row element.
 */
function indicatorCollaborationMember(member: MemberCollaborationEntry, view: IndicatorCollaborationView): HTMLElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '8px';
  row.style.padding = '4px 6px';
  const name = document.createElement('span');
  const tags = [member.user === view.self ? 'you' : '', member.owner ? 'owner' : ''].filter((tag) => tag !== '');
  name.textContent = `${member.name}${tags.length > 0 ? ` (${tags.join(', ')})` : ''}`;
  name.style.flex = '1';
  const locks = document.createElement('span');
  const count = view.locks.get(member.user) ?? 0;
  locks.textContent = count > 0 ? `editing ${count}` : '';
  locks.style.color = '#9a9a9a';
  row.append(uiCollaborationDot(memberCollaborationCss(member.color)), name, locks);
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
    'display:flex;align-items:center;gap:6px;padding:6px;margin-top:4px;border-top:1px solid rgba(255,255,255,0.1)';
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
