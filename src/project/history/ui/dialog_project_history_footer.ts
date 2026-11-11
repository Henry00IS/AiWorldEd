import { dialogCardButton } from '@/ui/dialog/dialog_card.js';
import { PROJECT_HISTORY_NAME_MAX } from '@/project/history/tree/project_history_tree.js';
import { DIALOG_PROJECT_HISTORY_TEXT_SOFT, dialogProjectHistoryInput } from './dialog_project_history_style.js';
import { dialogProjectHistorySummary } from './dialog_project_history_text.js';
import type { DialogProjectHistoryTree } from './dialog_project_history_types.js';

/** How long a status line replaces the summary. */
const DIALOG_PROJECT_HISTORY_STATUS_MS = 8000;

/** What the footer asks for. */
export interface DialogProjectHistoryFooterEvents {
  /**
   * A snapshot name was entered.
   *
   * @param name Snapshot name.
   */
  take(name: string): void;
  /** Close was pressed. */
  close(): void;
}

/** Footer: summary or status, Take Snapshot with inline naming, Close. */
export class DialogProjectHistoryFooter {
  readonly element = document.createElement('div');
  private readonly events: DialogProjectHistoryFooterEvents;
  private readonly summary = document.createElement('span');
  private readonly take: HTMLButtonElement;
  private readonly naming = document.createElement('div');
  private readonly name: HTMLInputElement;
  private message = '';
  private summaryText = '';

  /**
   * Builds the footer.
   *
   * @param events Footer callbacks.
   */
  constructor(events: DialogProjectHistoryFooterEvents) {
    this.events = events;
    Object.assign(this.element.style, { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' });
    Object.assign(this.summary.style, { flex: '1', color: DIALOG_PROJECT_HISTORY_TEXT_SOFT, fontSize: '12px' });
    this.summary.setAttribute('role', 'status');
    this.summary.textContent = 'Reading saved states\u2026';
    this.take = dialogCardButton('Take Snapshot', true, () => this.namingShow(true));
    this.take.disabled = true;
    this.name = dialogProjectHistoryInput('Snapshot Name', '', PROJECT_HISTORY_NAME_MAX);
    this.name.style.width = '240px';
    this.name.addEventListener('keydown', (event) => this.nameKey(event));
    Object.assign(this.naming.style, { display: 'none', alignItems: 'center', gap: '8px' });
    this.naming.append(
      this.name,
      dialogCardButton('Keep', true, () => this.submit()),
      dialogCardButton('Cancel', false, () => this.namingShow(false)),
    );
    this.element.append(
      this.summary,
      this.naming,
      this.take,
      dialogCardButton('Close', false, () => events.close()),
    );
  }

  /**
   * Updates the summary and whether a snapshot can be taken.
   *
   * @param trees Trees.
   * @param tree Shown tree.
   */
  update(trees: readonly DialogProjectHistoryTree[], tree: DialogProjectHistoryTree | null): void {
    this.summaryText = dialogProjectHistorySummary(trees.map((entry) => entry.index));
    if (this.message === '') this.summary.textContent = this.summaryText;
    const live = tree?.current === true;
    this.take.disabled = !live;
    this.take.style.opacity = live ? '1' : '0.5';
    this.take.title = live
      ? 'Keeps it as it is now under a name; named snapshots are kept until you delete them.'
      : 'Open this level (or own this room) to take a snapshot of it.';
    if (!live) this.namingShow(false);
  }

  /**
   * Shows a status line in place of the summary for a while.
   *
   * @param message Status.
   */
  status(message: string): void {
    this.message = message;
    this.summary.textContent = message === '' ? this.summaryText : message;
    window.setTimeout(() => {
      if (this.message !== message) return;
      this.message = '';
      this.summary.textContent = this.summaryText;
    }, DIALOG_PROJECT_HISTORY_STATUS_MS);
  }

  /**
   * Shows or hides the inline name field.
   *
   * @param show Whether to show it.
   */
  private namingShow(show: boolean): void {
    this.naming.style.display = show ? 'flex' : 'none';
    this.take.style.display = show ? 'none' : '';
    if (!show) return;
    this.name.value = '';
    this.name.focus();
  }

  /**
   * Enter keeps the snapshot, Escape cancels.
   *
   * @param event Key event.
   */
  private nameKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') this.submit();
    else if (event.key === 'Escape') this.namingShow(false);
    else return;
    event.preventDefault();
  }

  /** Takes the snapshot under the entered name. */
  private submit(): void {
    const name = this.name.value.trim();
    if (name === '') return this.name.focus();
    this.namingShow(false);
    this.take.focus();
    this.events.take(name);
  }
}
