import { dialogCardButton, dialogCardStyle, dialogCardTitle } from '@/ui/dialog/dialog_card.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import type { ProjectHistoryDetails } from './project_history_details.js';
import type { ProjectHistoryEntry } from './project_history_entry.js';
import { projectHistoryGroups, type ProjectHistoryGroup } from './project_history_group.js';
import { dialogProjectHistoryRow, dialogProjectHistoryText } from './dialog_project_history_row.js';

/** What the Level History dialog reads and does. */
export interface DialogProjectHistorySource {
  projectName(): string;
  /** Level key of the open level. */
  current(): string | null;
  entries(): Promise<ProjectHistoryEntry[]>;
  details(entry: ProjectHistoryEntry): Promise<ProjectHistoryDetails>;
  lock(entry: ProjectHistoryEntry, locked: boolean): Promise<void>;
  restoreBlocked(entry: ProjectHistoryEntry): string | null;
  take(): Promise<void>;
  takeLabel(): string;
}

/** Dialog title. */
export const DIALOG_PROJECT_HISTORY_TITLE = 'Level History';

/**
 * Lists the autosaves and snapshots by level and day, locks entries and returns
 * the one to restore.
 */
export class DialogProjectHistory extends PanelFloating {
  private readonly source: DialogProjectHistorySource;
  private readonly list = document.createElement('div');
  private readonly summary = dialogProjectHistoryText('Loading\u2026', '#9a9a9a');
  private readonly takeButton: HTMLButtonElement;
  private resolver: ((entry: ProjectHistoryEntry | null) => void) | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;

  /**
   * Builds the dialog.
   *
   * @param host Modal host.
   * @param source Entries and actions.
   */
  constructor(host: HTMLElement, source: DialogProjectHistorySource) {
    super(host, {
      corner: 'top-left',
      modal: true,
      centered: true,
      draggable: false,
      closeOnEscape: true,
      closeOnBackdropClick: false,
      stackLayer: 'modal',
      backdropClassName: 'editor-message-box-backdrop',
    });
    this.source = source;
    this.takeButton = dialogCardButton(source.takeLabel(), true, () => void this.take());
    this.takeButton.title = 'Saves the scene as it is now and locks it, so it is kept until you unlock it.';
    this.build();
  }

  /**
   * Shows the dialog and loads the entries.
   *
   * @returns The entry to restore, or null when closed.
   */
  open(): Promise<ProjectHistoryEntry | null> {
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.show();
      this.takeButton.focus();
      void this.refresh();
    });
  }

  /** Builds the card. */
  private build(): void {
    dialogCardStyle(this.root, 'min(760px, calc(100vw - 32px))', 'project-history-title');
    this.root.dataset['projectHistory'] = 'true';
    this.root.addEventListener('keydown', (event) => this.keyDown(event));
    const intro = dialogProjectHistoryText(dialogProjectHistoryIntro(this.source.projectName()), '#a8a8a8');
    Object.assign(intro.style, { whiteSpace: 'normal', display: 'block', lineHeight: '1.45', margin: '-6px 0 12px' });
    Object.assign(this.list.style, {
      maxHeight: 'max(260px, calc(100vh - 300px))',
      minHeight: '160px',
      overflowY: 'auto',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px',
      background: 'rgba(0,0,0,0.22)',
    });
    this.list.dataset['projectHistoryList'] = 'true';
    this.root.append(
      dialogCardTitle('project-history-title', DIALOG_PROJECT_HISTORY_TITLE),
      intro,
      this.list,
      this.footer(),
    );
  }

  /**
   * Keeps keys away from the editor behind the dialog; Escape closes it.
   *
   * @param event Key event inside the dialog.
   */
  private keyDown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.finish(null);
  }

  /**
   * Builds the footer: summary, Take Snapshot and Close.
   *
   * @returns Footer element.
   */
  private footer(): HTMLElement {
    const footer = document.createElement('div');
    Object.assign(footer.style, { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' });
    this.summary.style.flex = '1';
    footer.append(
      this.summary,
      this.takeButton,
      dialogCardButton('Close', false, () => this.finish(null)),
    );
    return footer;
  }

  /** Reloads and shows the entries. */
  private async refresh(): Promise<void> {
    const entries = await this.source.entries().catch(() => []);
    const now = Date.now();
    const groups = projectHistoryGroups(entries, this.source.current(), now);
    this.list.replaceChildren(...groups.map((group) => this.group(group, now)));
    if (entries.length === 0) this.list.append(dialogProjectHistoryEmpty());
    this.summary.textContent = dialogProjectHistorySummary(entries);
  }

  /**
   * Builds one level group with its day sections.
   *
   * @param group Level group.
   * @param now Current time in milliseconds.
   * @returns Group element.
   */
  private group(group: ProjectHistoryGroup, now: number): HTMLElement {
    const section = document.createElement('section');
    section.dataset['historyLevel'] = group.level ?? '';
    section.append(dialogProjectHistoryLevelHeader(group));
    const actions = {
      details: (entry: ProjectHistoryEntry) => this.source.details(entry),
      lock: (entry: ProjectHistoryEntry, locked: boolean) => void this.lock(entry, locked),
      restore: (entry: ProjectHistoryEntry) => this.finish(entry),
      restoreBlocked: (entry: ProjectHistoryEntry) => this.source.restoreBlocked(entry),
    };
    group.days.forEach((day) => {
      section.append(dialogProjectHistoryDayHeader(day.label));
      day.entries.forEach((entry) => section.append(dialogProjectHistoryRow(entry, actions, now)));
    });
    return section;
  }

  /**
   * Locks or unlocks an entry and shows the result.
   *
   * @param entry History entry.
   * @param locked Wanted lock state.
   */
  private async lock(entry: ProjectHistoryEntry, locked: boolean): Promise<void> {
    await this.run(() => this.source.lock(entry, locked));
  }

  /** Takes a snapshot and shows it. */
  private async take(): Promise<void> {
    await this.run(() => this.source.take());
  }

  /**
   * Runs actions one after another in click order, showing that work is under
   * way, then reloads the list.
   *
   * @param action Action.
   * @returns Resolves once this action and the reload are done.
   */
  private run(action: () => Promise<void>): Promise<void> {
    this.pending += 1;
    this.summary.textContent = 'Saving\u2026';
    this.queue = this.queue.then(async () => {
      await action().catch((error: unknown) => console.warn('[AiWorldEd] Level History action failed.', error));
      this.pending -= 1;
      if (this.pending === 0) await this.refresh();
    });
    return this.queue;
  }

  /**
   * Closes the dialog with an answer.
   *
   * @param entry Entry to restore, or null.
   */
  private finish(entry: ProjectHistoryEntry | null): void {
    const resolver = this.resolver;
    this.resolver = null;
    this.dispose();
    resolver?.(entry);
  }

  /** Answers null when closed with Escape. */
  protected override onAfterHide(): void {
    if (this.resolver !== null) queueMicrotask(() => this.finish(null));
  }
}

/**
 * Words the dialog introduction.
 *
 * @param projectName Project folder name.
 * @returns Introduction.
 */
function dialogProjectHistoryIntro(projectName: string): string {
  const where = projectName === '' ? 'this project' : `\u201c${projectName}\u201d`;
  return (
    `Every autosave and snapshot kept in ${where}. Autosaves are thinned out to one per hour and removed ` +
    'after 48 hours; locked entries are kept until you unlock them.'
  );
}

/**
 * Builds a level header.
 *
 * @param group Level group.
 * @returns Header element.
 */
function dialogProjectHistoryLevelHeader(group: ProjectHistoryGroup): HTMLElement {
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    padding: '10px 10px 6px',
    position: 'sticky',
    top: '0',
    zIndex: '1',
    background: 'rgb(30, 30, 32)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  });
  const title = dialogProjectHistoryText(group.label, '#f2f2f2');
  Object.assign(title.style, { fontSize: '13px', fontWeight: '600' });
  header.append(title);
  if (group.current) header.append(dialogProjectHistoryText('Open Level', '#e8a06a'));
  return header;
}

/**
 * Builds a day header.
 *
 * @param label Day label.
 * @returns Header element.
 */
function dialogProjectHistoryDayHeader(label: string): HTMLElement {
  const header = dialogProjectHistoryText(label.toUpperCase(), '#7c7c7c');
  Object.assign(header.style, { display: 'block', fontSize: '10px', letterSpacing: '0.08em', padding: '8px 12px 4px' });
  return header;
}

/**
 * Builds the empty list notice.
 *
 * @returns Notice element.
 */
function dialogProjectHistoryEmpty(): HTMLElement {
  const empty = dialogProjectHistoryText(
    'Nothing here yet. Autosaves appear a few seconds after you change the level; Take Snapshot keeps the level as it is now.',
    '#9a9a9a',
  );
  Object.assign(empty.style, { display: 'block', whiteSpace: 'normal', padding: '28px 20px', textAlign: 'center' });
  return empty;
}

/**
 * Words the list summary ("24 entries · 3 locked").
 *
 * @param entries History entries.
 * @returns Summary.
 */
export function dialogProjectHistorySummary(entries: readonly ProjectHistoryEntry[]): string {
  const locked = entries.filter((entry) => entry.locked).length;
  const count = entries.length === 1 ? '1 entry' : `${entries.length} entries`;
  return locked === 0 ? count : `${count} \u00b7 ${locked} locked`;
}
