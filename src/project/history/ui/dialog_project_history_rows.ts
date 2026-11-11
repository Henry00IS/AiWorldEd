import { dialogCardButton } from '@/ui/dialog/dialog_card.js';
import { textCount } from '@/utils/utils_plural.js';
import {
  projectHistoryDayLabel,
  projectHistoryEntryName,
  type ProjectHistoryDayGroup,
  type ProjectHistoryEntry,
} from '@/project/history/core/project_history_entry.js';
import {
  DIALOG_PROJECT_HISTORY_DANGER_TEXT,
  DIALOG_PROJECT_HISTORY_SELECTED,
  DIALOG_PROJECT_HISTORY_STAR_COLOR,
  DIALOG_PROJECT_HISTORY_STAR_ICON,
  DIALOG_PROJECT_HISTORY_TEXT_MAIN,
  DIALOG_PROJECT_HISTORY_TEXT_SOFT,
  DIALOG_PROJECT_HISTORY_TRASH_ICON,
  dialogProjectHistoryFocusRing,
  dialogProjectHistoryIconButton,
  dialogProjectHistoryPill,
  dialogProjectHistoryText,
  dialogProjectHistoryThumb,
} from './dialog_project_history_style.js';
import {
  DIALOG_PROJECT_HISTORY_STAR_TIP,
  dialogProjectHistoryClock,
  dialogProjectHistoryDayLine,
} from './dialog_project_history_text.js';

/** Edge of a save's thumbnail in the list. */
export const DIALOG_PROJECT_HISTORY_THUMB_PX = 64;

/**
 * Draws the days, newest first.
 *
 * @param list Days list.
 * @param days Days.
 * @param selected Selected day.
 * @param pick Runs when a day is clicked.
 */
export function dialogProjectHistoryDaysRender(
  list: HTMLElement,
  days: readonly ProjectHistoryDayGroup[],
  selected: string | null,
  pick: (day: string) => void,
): void {
  list.replaceChildren();
  if (days.length === 0) {
    const empty = dialogProjectHistoryText(
      'No saves yet. Your level is saved here as you work.',
      DIALOG_PROJECT_HISTORY_TEXT_SOFT,
    );
    Object.assign(empty.style, { display: 'block', whiteSpace: 'normal', padding: '10px', fontSize: '12.5px' });
    list.append(empty);
    return;
  }
  for (const group of days) {
    const current = group.day === selected;
    const row = document.createElement('div');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(current));
    row.tabIndex = current ? 0 : -1;
    row.dataset['historyDay'] = group.day;
    Object.assign(row.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      padding: '8px 10px',
      borderRadius: '6px',
      cursor: 'pointer',
      background: current ? DIALOG_PROJECT_HISTORY_SELECTED : 'transparent',
    });
    dialogProjectHistoryFocusRing(row, 'none');
    const label = dialogProjectHistoryText(projectHistoryDayLabel(group.day), DIALOG_PROJECT_HISTORY_TEXT_MAIN);
    Object.assign(label.style, { fontSize: '13.5px', fontWeight: '600' });
    const line = dialogProjectHistoryText(dialogProjectHistoryDayLine(group), DIALOG_PROJECT_HISTORY_TEXT_SOFT);
    line.style.fontSize = '12px';
    row.append(label, line);
    row.addEventListener('click', () => pick(group.day));
    list.append(row);
  }
}

/** What the rows of saves report. */
export interface DialogProjectHistoryEntriesEvents {
  /** A row was clicked. */
  select(entry: ProjectHistoryEntry): void;
  /** Restore was pressed or the row double-clicked. */
  restore(entry: ProjectHistoryEntry): void;
  /** The star was pressed. */
  star(entry: ProjectHistoryEntry): void;
  /** The trash button was pressed. */
  confirmStart(entry: ProjectHistoryEntry): void;
  /** Delete was confirmed. */
  remove(entry: ProjectHistoryEntry): void;
  /** Deleting was cancelled. */
  confirmCancel(): void;
  /**
   * Fills a thumbnail and shows its preview on hover.
   *
   * @param entry Save.
   * @param box Thumbnail box.
   */
  thumbnail(entry: ProjectHistoryEntry, box: HTMLElement): void;
}

/** What the rows show selected and confirming. */
export interface DialogProjectHistoryEntriesState {
  selected: string | null;
  /** Save whose delete waits for confirmation. */
  confirming: string | null;
  /** Locale of times, or undefined for the browser's. */
  locale?: string;
}

/**
 * Draws the saves of a day.
 *
 * @param list Saves list.
 * @param entries Saves, autosaves first.
 * @param state Selection and confirmation.
 * @param events Row callbacks.
 */
export function dialogProjectHistoryEntriesRender(
  list: HTMLElement,
  entries: readonly ProjectHistoryEntry[],
  state: DialogProjectHistoryEntriesState,
  events: DialogProjectHistoryEntriesEvents,
): void {
  list.replaceChildren(...entries.map((entry) => dialogProjectHistoryEntryRow(entry, state, events)));
}

/**
 * Builds the row of a save.
 *
 * @param entry Save.
 * @param state Selection and confirmation.
 * @param events Row callbacks.
 * @returns Row.
 */
function dialogProjectHistoryEntryRow(
  entry: ProjectHistoryEntry,
  state: DialogProjectHistoryEntriesState,
  events: DialogProjectHistoryEntriesEvents,
): HTMLElement {
  const current = entry.id === state.selected;
  const row = document.createElement('div');
  row.setAttribute('role', 'listitem');
  if (current) row.setAttribute('aria-current', 'true');
  row.tabIndex = current ? 0 : -1;
  row.dataset['historyEntry'] = entry.id;
  Object.assign(row.style, {
    display: 'grid',
    gridTemplateColumns: `${DIALOG_PROJECT_HISTORY_THUMB_PX}px minmax(0, 1fr) auto`,
    alignItems: 'center',
    gap: '12px',
    padding: '8px 10px',
    borderRadius: '8px',
    cursor: 'pointer',
    background: current ? DIALOG_PROJECT_HISTORY_SELECTED : 'transparent',
  });
  dialogProjectHistoryFocusRing(row, 'none');
  row.addEventListener('click', () => events.select(entry));
  row.addEventListener('dblclick', () => events.restore(entry));
  const thumb = dialogProjectHistoryThumb(null, DIALOG_PROJECT_HISTORY_THUMB_PX);
  thumb.dataset['historyThumb'] = entry.id;
  events.thumbnail(entry, thumb);
  row.append(
    thumb,
    dialogProjectHistoryEntryText(entry, state.locale),
    dialogProjectHistoryEntryActions(entry, state, events),
  );
  return row;
}

/**
 * Builds the time, name and object count of a save.
 *
 * @param entry Save.
 * @param locale Locale of the time.
 * @returns Text block.
 */
function dialogProjectHistoryEntryText(entry: ProjectHistoryEntry, locale: string | undefined): HTMLElement {
  const block = document.createElement('div');
  Object.assign(block.style, { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '0' });
  const head = document.createElement('div');
  Object.assign(head.style, { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '0' });
  const time = dialogProjectHistoryText(
    dialogProjectHistoryClock(entry.time, locale),
    DIALOG_PROJECT_HISTORY_TEXT_MAIN,
  );
  Object.assign(time.style, { fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' });
  head.append(time);
  if (entry.kind === 'autosave') head.append(dialogProjectHistoryPill());
  const line = dialogProjectHistoryText(
    `${projectHistoryEntryName(entry)} \u00b7 ${textCount(entry.objectCount, 'object')}`,
    DIALOG_PROJECT_HISTORY_TEXT_SOFT,
  );
  line.style.fontSize = '12.5px';
  block.append(head, line);
  return block;
}

/**
 * Builds the star, trash and Restore buttons, or the delete confirmation.
 *
 * @param entry Save.
 * @param state Selection and confirmation.
 * @param events Row callbacks.
 * @returns Actions.
 */
function dialogProjectHistoryEntryActions(
  entry: ProjectHistoryEntry,
  state: DialogProjectHistoryEntriesState,
  events: DialogProjectHistoryEntriesEvents,
): HTMLElement {
  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', alignItems: 'center', gap: '6px' });
  actions.addEventListener('dblclick', (event) => event.stopPropagation());
  if (state.confirming === entry.id) {
    const question = dialogProjectHistoryText('Delete this save?', DIALOG_PROJECT_HISTORY_TEXT_MAIN);
    question.style.fontSize = '12.5px';
    const remove = dialogCardButton('Delete', false, () => events.remove(entry));
    remove.dataset['historyConfirm'] = 'delete';
    Object.assign(remove.style, { color: DIALOG_PROJECT_HISTORY_DANGER_TEXT, borderColor: 'rgba(255,180,166,0.55)' });
    const cancel = dialogCardButton('Cancel', false, () => events.confirmCancel());
    cancel.dataset['historyConfirm'] = 'cancel';
    for (const button of [remove, cancel]) button.addEventListener('click', (event) => event.stopPropagation());
    actions.append(question, remove, cancel);
    return actions;
  }
  const star = dialogProjectHistoryIconButton(DIALOG_PROJECT_HISTORY_STAR_ICON, 'Star', 36, () => events.star(entry));
  star.dataset['historyStar'] = entry.id;
  star.setAttribute('aria-pressed', String(entry.starred));
  star.title = DIALOG_PROJECT_HISTORY_STAR_TIP;
  star.style.color = entry.starred ? DIALOG_PROJECT_HISTORY_STAR_COLOR : DIALOG_PROJECT_HISTORY_TEXT_SOFT;
  star.style.setProperty('--history-star-fill', entry.starred ? DIALOG_PROJECT_HISTORY_STAR_COLOR : 'transparent');
  const trash = dialogProjectHistoryIconButton(DIALOG_PROJECT_HISTORY_TRASH_ICON, 'Delete', 32, () =>
    events.confirmStart(entry),
  );
  trash.dataset['historyTrash'] = entry.id;
  trash.title = 'Delete this save';
  const restore = dialogCardButton('Restore', true, () => events.restore(entry));
  restore.dataset['historyRestore'] = entry.id;
  restore.addEventListener('click', (event) => event.stopPropagation());
  actions.append(star, trash, restore);
  return actions;
}
