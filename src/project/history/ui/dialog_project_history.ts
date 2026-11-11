import { dialogCardButton, dialogCardStyle, dialogCardTitle } from '@/ui/dialog/dialog_card.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import {
  projectHistoryDayLabel,
  projectHistoryDays,
  type ProjectHistoryDayGroup,
  type ProjectHistoryEntry,
} from '@/project/history/core/project_history_entry.js';
import { DialogProjectHistoryPreview } from './dialog_project_history_preview.js';
import {
  DIALOG_PROJECT_HISTORY_DAY_ICON_PX,
  dialogProjectHistoryDaysRender,
  dialogProjectHistoryEntriesRender,
} from './dialog_project_history_rows.js';
import { DialogProjectHistorySlideshow, dialogProjectHistorySlidePhase } from './dialog_project_history_slideshow.js';
import {
  DIALOG_PROJECT_HISTORY_TEXT_SOFT,
  dialogProjectHistoryPane,
  dialogProjectHistoryText,
  type DialogProjectHistoryPane,
} from './dialog_project_history_style.js';
import { DIALOG_PROJECT_HISTORY_INTRO } from './dialog_project_history_text.js';
import type { DialogProjectHistoryResult, DialogProjectHistorySource } from './dialog_project_history_types.js';

/** How long a status line stays. */
const DIALOG_PROJECT_HISTORY_STATUS_MS = 8000;

/**
 * Level History: the days that hold saves, newest first, each with a slideshow
 * of its pictures, and the selected day's saves beside them. Clicking a save
 * only selects it; Restore or a double-click loads it.
 */
export class DialogProjectHistory extends PanelFloating {
  private readonly source: DialogProjectHistorySource;
  private readonly panes: Record<'days' | 'entries', DialogProjectHistoryPane>;
  /** Slideshow of each listed day, kept across redraws. */
  private readonly slideshows = new Map<string, DialogProjectHistorySlideshow>();
  private readonly preview: DialogProjectHistoryPreview;
  private readonly status = document.createElement('span');
  private days: ProjectHistoryDayGroup[] = [];
  private day: string | null = null;
  private selected: string | null = null;
  private confirming: string | null = null;
  private unwatch: (() => void) | null = null;
  private refreshing: Promise<void> | null = null;
  private refreshAgain = false;
  private busy = false;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private resolver: (() => void) | null = null;

  /**
   * Builds the dialog.
   *
   * @param host Modal host.
   * @param source Saves and actions.
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
    this.panes = { days: dialogProjectHistoryPane('4px'), entries: dialogProjectHistoryPane('4px') };
    this.preview = new DialogProjectHistoryPreview(() => this.panes.entries.host);
    this.build();
  }

  /**
   * Shows the dialog.
   *
   * @returns Resolves when closed.
   */
  open(): Promise<void> {
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.unwatch = this.source.watch(() => void this.refresh());
      this.show();
      void this.refresh().then(() => this.focusSelected());
    });
  }

  /** Builds the card. */
  private build(): void {
    dialogCardStyle(this.root, 'min(820px, calc(100vw - 32px))', 'project-history-title');
    this.root.dataset['projectHistory'] = 'days';
    this.root.addEventListener('keydown', (event) => this.keyDown(event));
    const intro = dialogProjectHistoryText(DIALOG_PROJECT_HISTORY_INTRO, DIALOG_PROJECT_HISTORY_TEXT_SOFT);
    Object.assign(intro.style, {
      display: 'block',
      whiteSpace: 'normal',
      lineHeight: '1.5',
      margin: '-6px 0 14px',
      fontSize: '12.5px',
    });
    const body = document.createElement('div');
    Object.assign(body.style, {
      display: 'grid',
      gridTemplateColumns: '220px minmax(0, 1fr)',
      gap: '12px',
      height: 'min(580px, calc(100vh - 220px))',
      minHeight: '360px',
    });
    const side = document.createElement('div');
    Object.assign(side.style, { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0' });
    this.panes.days.host.style.flex = '1';
    this.panes.days.content.setAttribute('role', 'listbox');
    this.panes.days.content.setAttribute('aria-label', 'Days');
    this.panes.days.content.dataset['historyDays'] = 'true';
    this.panes.entries.content.setAttribute('role', 'list');
    this.panes.entries.content.setAttribute('aria-label', 'Saves');
    this.panes.entries.content.dataset['historyEntries'] = 'true';
    this.panes.entries.scroller.addEventListener('scroll', () => this.preview.hide(), { passive: true });
    side.append(this.panes.days.host);
    body.append(side, this.panes.entries.host);
    const footer = document.createElement('div');
    Object.assign(footer.style, { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' });
    Object.assign(this.status.style, { flex: '1', color: DIALOG_PROJECT_HISTORY_TEXT_SOFT, fontSize: '12px' });
    this.status.setAttribute('role', 'status');
    footer.append(
      this.status,
      dialogCardButton('Close', false, () => this.finish()),
    );
    this.root.append(
      dialogCardTitle('project-history-title', 'Level History'),
      intro,
      body,
      footer,
      this.preview.element,
    );
  }

  /**
   * Reads the saves again and redraws; a refresh asked for while one runs runs
   * once more after it.
   *
   * @returns Resolves once redrawn.
   */
  private refresh(): Promise<void> {
    if (this.refreshing !== null) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        await this.reload();
      } while (this.refreshAgain && this.resolver !== null);
    })().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /** Reads the saves once and redraws. */
  private async reload(): Promise<void> {
    const entries = await this.source.entries();
    if (this.resolver === null) return;
    this.days = projectHistoryDays(entries);
    const group = this.days.find((item) => item.day === this.day) ?? this.days[0] ?? null;
    this.day = group?.day ?? null;
    if (group === null || !group.entries.some((entry) => entry.id === this.selected))
      this.selected = group?.entries[0]?.id ?? null;
    if (!this.entries().some((entry) => entry.id === this.confirming)) this.confirming = null;
    this.render();
  }

  /**
   * Saves of the selected day.
   *
   * @returns Saves, autosaves first.
   */
  private entries(): ProjectHistoryEntry[] {
    return this.days.find((group) => group.day === this.day)?.entries ?? [];
  }

  /**
   * Selected save.
   *
   * @returns Save, or null.
   */
  private entry(): ProjectHistoryEntry | null {
    return this.entries().find((entry) => entry.id === this.selected) ?? null;
  }

  /** Redraws both lists and the slideshows. */
  private render(): void {
    this.preview.hide();
    dialogProjectHistoryDaysRender(
      this.panes.days.content,
      this.days,
      this.day,
      (day) => this.dayPick(day),
      (group, index) => this.slideshowOf(group, index),
    );
    this.slideshowsPrune();
    this.panes.entries.content.setAttribute(
      'aria-label',
      this.day === null ? 'Saves' : `Saves Of ${projectHistoryDayLabel(this.day)}`,
    );
    dialogProjectHistoryEntriesRender(
      this.panes.entries.content,
      this.entries(),
      { selected: this.selected, confirming: this.confirming },
      {
        select: (entry) => this.select(entry.id),
        restore: (entry) => void this.act(() => this.source.restore(entry)),
        star: (entry) => void this.act(() => this.source.star(entry, !entry.starred)),
        confirmStart: (entry) => this.confirmSet(entry.id),
        remove: (entry) => void this.act(() => this.source.remove(entry)),
        confirmCancel: () => this.confirmSet(null),
        thumbnail: (entry, box) => this.thumbnail(entry, box),
      },
    );
    this.panes.days.sync();
    this.panes.entries.sync();
  }

  /**
   * Returns the slideshow of a day with its current pictures, newest first. A
   * day keeps its slideshow, which starts again only when its pictures change.
   *
   * @param group Day.
   * @param index Row position, which staggers the slideshows.
   * @returns Slideshow element.
   */
  private slideshowOf(group: ProjectHistoryDayGroup, index: number): HTMLElement {
    let slideshow = this.slideshows.get(group.day);
    if (slideshow === undefined) {
      slideshow = new DialogProjectHistorySlideshow(
        DIALOG_PROJECT_HISTORY_DAY_ICON_PX,
        dialogProjectHistorySlidePhase(index),
      );
      this.slideshows.set(group.day, slideshow);
    }
    const pictures = group.entries.filter((entry) => entry.thumbnail).sort((left, right) => right.time - left.time);
    slideshow.show(
      pictures.map((entry) => entry.id).join(' '),
      pictures.map((entry) => () => this.source.thumbnail(entry)),
    );
    return slideshow.element;
  }

  /** Stops the slideshows of days no longer listed. */
  private slideshowsPrune(): void {
    for (const [day, slideshow] of this.slideshows)
      if (!this.days.some((group) => group.day === day)) {
        slideshow.dispose();
        this.slideshows.delete(day);
      }
  }

  /**
   * Shows another day.
   *
   * @param day Day.
   */
  private dayPick(day: string): void {
    this.day = day;
    this.selected = this.entries()[0]?.id ?? null;
    this.confirming = null;
    this.panes.entries.scroller.scrollTop = 0;
    this.render();
    this.panes.days.content.querySelector<HTMLElement>(`[data-history-day="${day}"]`)?.focus({ preventScroll: true });
  }

  /**
   * Selects a save; it never loads anything.
   *
   * @param id Save id.
   */
  private select(id: string): void {
    this.selected = id;
    if (this.confirming !== id) this.confirming = null;
    this.render();
    this.focusSelected();
  }

  /**
   * Asks to confirm deleting a save, or stops asking.
   *
   * @param id Save id, or null.
   */
  private confirmSet(id: string | null): void {
    this.confirming = id;
    if (id !== null) this.selected = id;
    this.render();
    const button = this.panes.entries.content.querySelector<HTMLElement>('[data-history-confirm="cancel"]');
    if (button !== null) button.focus();
    else this.focusSelected();
  }

  /**
   * Runs an action, then shows its outcome.
   *
   * @param run Action.
   */
  private async act(run: () => Promise<DialogProjectHistoryResult>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const result = await run();
      this.confirming = null;
      this.statusShow(result.message);
      await this.refresh();
    } finally {
      this.busy = false;
    }
    this.focusSelected();
  }

  /**
   * Shows a status line for a while.
   *
   * @param message Status.
   */
  private statusShow(message: string): void {
    this.status.textContent = message;
    if (this.statusTimer !== null) clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      this.statusTimer = null;
      if (this.status.textContent === message) this.status.textContent = '';
    }, DIALOG_PROJECT_HISTORY_STATUS_MS);
  }

  /**
   * Fills a thumbnail once its picture is loaded and shows its enlarged preview
   * on hover.
   *
   * @param entry Save.
   * @param box Thumbnail box.
   */
  private thumbnail(entry: ProjectHistoryEntry, box: HTMLElement): void {
    if (!entry.thumbnail) return;
    const url = () => this.source.thumbnail(entry);
    void url().then((value) => {
      if (value !== null) box.style.background = `#232323 center / cover no-repeat url("${value}")`;
    });
    this.preview.bind(box, entry.id, url);
  }

  /** Moves keyboard focus to the selected save. */
  private focusSelected(): void {
    if (this.selected === null) return;
    const row = this.panes.entries.content.querySelector<HTMLElement>(
      `[data-history-entry="${CSS.escape(this.selected)}"]`,
    );
    row?.focus({ preventScroll: false });
  }

  /**
   * Keyboard: arrows move through days or saves, Enter restores the selected
   * save, Delete asks to delete it; Escape stops asking, else closes.
   *
   * @param event Key event.
   */
  private keyDown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.confirming !== null) this.confirmSet(null);
      else this.finish();
      return;
    }
    if (!(event.target instanceof HTMLElement)) return;
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (event.target.dataset['historyDay'] !== undefined) {
      if (step === 0) return;
      event.preventDefault();
      const index = this.days.findIndex((group) => group.day === this.day);
      const next = this.days[Math.min(this.days.length - 1, Math.max(0, index + step))];
      if (next !== undefined) this.dayPick(next.day);
      return;
    }
    if (event.target.dataset['historyEntry'] === undefined) return;
    const entries = this.entries();
    const entry = this.entry();
    if (step !== 0) {
      event.preventDefault();
      const index = entries.findIndex((item) => item.id === this.selected);
      const next = entries[Math.min(entries.length - 1, Math.max(0, index + step))];
      if (next !== undefined) this.select(next.id);
    } else if (event.key === 'Enter' && entry !== null) {
      event.preventDefault();
      void this.act(() => this.source.restore(entry));
    } else if (event.key === 'Delete' && entry !== null) {
      event.preventDefault();
      this.confirmSet(entry.id);
    }
  }

  /** Closes the dialog and frees its thumbnails. */
  private finish(): void {
    const resolver = this.resolver;
    this.resolver = null;
    for (const pane of Object.values(this.panes)) pane.dispose();
    this.unwatch?.();
    this.unwatch = null;
    this.slideshows.forEach((slideshow) => slideshow.dispose());
    this.slideshows.clear();
    this.preview.dispose();
    if (this.statusTimer !== null) clearTimeout(this.statusTimer);
    this.source.release();
    this.dispose();
    resolver?.();
  }

  /** Answers when closed with Escape from outside the card. */
  protected override onAfterHide(): void {
    if (this.resolver !== null) queueMicrotask(() => this.finish());
  }
}
