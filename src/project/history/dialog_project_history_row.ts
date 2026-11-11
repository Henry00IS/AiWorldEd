import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { panelProjectSizeText } from '@/project/ui/panel_project_view.js';
import { textCount } from '@/utils/utils_plural.js';
import { timeRelativeText } from '@/utils/utils_time_relative.js';
import { dialogCardButton } from '@/ui/dialog/dialog_card.js';
import type { ProjectHistoryDetails } from './project_history_details.js';
import { projectHistoryKindLabel, projectHistoryLockable, type ProjectHistoryEntry } from './project_history_entry.js';

/** Closed padlock. */
const DIALOG_PROJECT_HISTORY_LOCKED_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/>' +
  '<path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

/** Open padlock. */
const DIALOG_PROJECT_HISTORY_UNLOCKED_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
  '<path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

/** Entries younger than this also show how long ago they were written. */
const DIALOG_PROJECT_HISTORY_RELATIVE_MS = 86_400_000;

/** What a row does when used. */
export interface DialogProjectHistoryRowActions {
  details(entry: ProjectHistoryEntry): Promise<ProjectHistoryDetails>;
  lock(entry: ProjectHistoryEntry, locked: boolean): void;
  restore(entry: ProjectHistoryEntry): void;
  restoreBlocked(entry: ProjectHistoryEntry): string | null;
}

/**
 * Builds one entry row: lock, time, kind, details and Restore.
 *
 * @param entry History entry.
 * @param actions Row actions.
 * @param now Current time in milliseconds.
 * @returns Row element.
 */
export function dialogProjectHistoryRow(
  entry: ProjectHistoryEntry,
  actions: DialogProjectHistoryRowActions,
  now: number,
): HTMLElement {
  const row = document.createElement('div');
  row.dataset['historyEntry'] = entry.id;
  row.dataset['locked'] = String(entry.locked);
  Object.assign(row.style, {
    display: 'grid',
    gridTemplateColumns: '32px 128px 150px 1fr auto',
    alignItems: 'center',
    columnGap: '10px',
    padding: '5px 10px 5px 6px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    background: entry.locked ? 'rgba(232, 106, 23, 0.07)' : 'transparent',
  });
  const details = dialogProjectHistoryText('', '#9a9a9a');
  row.append(
    dialogProjectHistoryLockButton(entry, actions),
    dialogProjectHistoryTime(entry, now),
    dialogProjectHistoryKind(entry),
    details,
    dialogProjectHistoryRestore(entry, actions),
  );
  dialogProjectHistoryDetailsFill(details, entry, actions);
  return row;
}

/**
 * Builds the lock toggle; entries that cannot be locked get a faint placeholder
 * that explains why.
 *
 * @param entry History entry.
 * @param actions Row actions.
 * @returns Button.
 */
function dialogProjectHistoryLockButton(
  entry: ProjectHistoryEntry,
  actions: DialogProjectHistoryRowActions,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset['historyLock'] = String(entry.locked);
  button.innerHTML = entry.locked ? DIALOG_PROJECT_HISTORY_LOCKED_ICON : DIALOG_PROJECT_HISTORY_UNLOCKED_ICON;
  const lockable = projectHistoryLockable(entry);
  button.disabled = !lockable;
  button.setAttribute('aria-label', entry.locked ? 'Unlock' : 'Lock');
  button.title = dialogProjectHistoryLockTip(entry, lockable);
  Object.assign(button.style, {
    width: '28px',
    height: '26px',
    display: 'grid',
    placeItems: 'center',
    border: '1px solid transparent',
    borderRadius: '5px',
    background: 'transparent',
    color: entry.locked ? hexToRgb(Theme.selectionColor) : lockable ? '#8a8a8a' : 'rgba(255,255,255,0.18)',
    cursor: lockable ? 'pointer' : 'default',
  });
  button.addEventListener('click', () => actions.lock(entry, !entry.locked));
  return button;
}

/**
 * Explains the lock toggle.
 *
 * @param entry History entry.
 * @param lockable Whether the entry can be locked.
 * @returns Tooltip.
 */
function dialogProjectHistoryLockTip(entry: ProjectHistoryEntry, lockable: boolean): string {
  if (entry.locked) return 'Locked: kept until you unlock it. Click to unlock.';
  if (lockable) return 'Lock to keep this entry; no cleanup deletes locked entries.';
  if (entry.kind === 'latest')
    return 'The latest autosave is replaced as you work. Take a snapshot to keep this state.';
  return 'Kept only for this session. Open a project folder to keep room snapshots.';
}

/**
 * Builds the time cell: clock time, and how long ago within the last day (older
 * entries sit under their day heading).
 *
 * @param entry History entry.
 * @param now Current time in milliseconds.
 * @returns Cell.
 */
function dialogProjectHistoryTime(entry: ProjectHistoryEntry, now: number): HTMLElement {
  const cell = document.createElement('div');
  cell.title = new Date(entry.time).toLocaleString();
  const clock = dialogProjectHistoryText(
    new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    '#ececec',
  );
  clock.style.fontVariantNumeric = 'tabular-nums';
  clock.style.fontWeight = '600';
  cell.append(clock);
  if (now - entry.time < DIALOG_PROJECT_HISTORY_RELATIVE_MS)
    cell.append(dialogProjectHistoryText(` ${timeRelativeText(entry.time, now)}`, '#8a8a8a'));
  return cell;
}

/**
 * Builds the kind badge; snapshots and locked entries stand out.
 *
 * @param entry History entry.
 * @returns Badge.
 */
function dialogProjectHistoryKind(entry: ProjectHistoryEntry): HTMLElement {
  const badge = dialogProjectHistoryText(projectHistoryKindLabel(entry), '#d8d8d8');
  const byHand = entry.kind === 'snapshot' || entry.reason === 'manual';
  Object.assign(badge.style, {
    justifySelf: 'start',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    background: byHand ? 'rgba(232, 106, 23, 0.22)' : 'rgba(255,255,255,0.07)',
    border: byHand ? '1px solid rgba(232, 106, 23, 0.55)' : '1px solid rgba(255,255,255,0.1)',
    whiteSpace: 'nowrap',
  });
  return badge;
}

/**
 * Builds the Restore button, disabled with the reason when it cannot run.
 *
 * @param entry History entry.
 * @param actions Row actions.
 * @returns Button.
 */
function dialogProjectHistoryRestore(
  entry: ProjectHistoryEntry,
  actions: DialogProjectHistoryRowActions,
): HTMLButtonElement {
  const button = dialogCardButton('Restore\u2026', false, () => actions.restore(entry));
  const blocked = actions.restoreBlocked(entry);
  button.disabled = blocked !== null;
  button.title = blocked ?? 'Restore this entry; you confirm before anything changes.';
  if (blocked !== null) Object.assign(button.style, { opacity: '0.4', cursor: 'default' });
  return button;
}

/**
 * Shows what is known now and fills in the object count and room once read.
 *
 * @param cell Details cell.
 * @param entry History entry.
 * @param actions Row actions.
 */
function dialogProjectHistoryDetailsFill(
  cell: HTMLElement,
  entry: ProjectHistoryEntry,
  actions: DialogProjectHistoryRowActions,
): void {
  cell.textContent = dialogProjectHistoryDetailsText(entry, {
    objectCount: entry.objectCount,
    sourcePath: null,
    room: null,
  });
  void actions
    .details(entry)
    .then((details) => (cell.textContent = dialogProjectHistoryDetailsText(entry, details)))
    .catch(() => undefined);
}

/**
 * Words the details of an entry ("3,000 objects · 1.2 MB · Room Castle Jam").
 *
 * @param entry History entry.
 * @param details Details read from the file.
 * @returns Details text.
 */
export function dialogProjectHistoryDetailsText(entry: ProjectHistoryEntry, details: ProjectHistoryDetails): string {
  const count = details.objectCount ?? entry.objectCount;
  const parts = [
    count === null ? null : textCount(count, 'object'),
    entry.size === null ? 'In Memory Only' : panelProjectSizeText(entry.size),
    details.room === null ? null : `Room \u201c${details.room}\u201d`,
  ];
  return parts.filter((part): part is string => part !== null).join(' \u00b7 ');
}

/**
 * Creates a text span.
 *
 * @param text Text.
 * @param color Text color.
 * @returns Span.
 */
export function dialogProjectHistoryText(text: string, color: string): HTMLElement {
  const span = document.createElement('span');
  span.textContent = text;
  Object.assign(span.style, {
    color,
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });
  return span;
}
