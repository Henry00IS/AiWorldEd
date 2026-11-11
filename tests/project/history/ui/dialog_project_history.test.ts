import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  projectHistoryDay,
  projectHistoryDayLabel,
  type ProjectHistoryEntry,
} from '@/project/history/core/project_history_entry.js';
import { DialogProjectHistory } from '@/project/history/ui/dialog_project_history.js';
import {
  DialogProjectHistorySlideshow,
  DIALOG_PROJECT_HISTORY_SLIDE_MS,
  dialogProjectHistorySlidePhase,
} from '@/project/history/ui/dialog_project_history_slideshow.js';
import {
  DIALOG_PROJECT_HISTORY_PREVIEW_DELAY_MS,
  dialogProjectHistoryPreviewPlace,
} from '@/project/history/ui/dialog_project_history_preview.js';
import { DIALOG_PROJECT_HISTORY_STAR_TIP } from '@/project/history/ui/dialog_project_history_text.js';
import type { DialogProjectHistorySource } from '@/project/history/ui/dialog_project_history_types.js';

const TODAY = new Date(2026, 10, 11, 15, 0).getTime();
const YESTERDAY = new Date(2026, 10, 10, 11, 0).getTime();

/**
 * Builds a save.
 *
 * @param id Id.
 * @param time Save time.
 * @param fields Fields to set.
 * @returns Save.
 */
function entryOf(id: string, time: number, fields: Partial<ProjectHistoryEntry> = {}): ProjectHistoryEntry {
  return {
    id,
    day: projectHistoryDay(time),
    kind: 'snapshot',
    starred: false,
    time,
    source: 'level',
    path: 'maps/keep.aiworld',
    title: 'keep',
    room: null,
    objectCount: 12,
    thumbnail: true,
    ...fields,
  };
}

/**
 * Builds a source with two saves today (a snapshot and a newer autosave of a
 * room) and one starred save yesterday.
 *
 * @returns Source and its saves.
 */
function sourceCreate() {
  const snapshot = entryOf('s1', TODAY);
  const autosave = entryOf('a1', TODAY - 3_600_000, { kind: 'autosave', source: 'room', room: 'Jam', title: null });
  const starred = entryOf('y1', YESTERDAY, { starred: true });
  const done = async () => ({ message: 'Done.' });
  const source = {
    entries: vi.fn(async () => [snapshot, autosave, starred]),
    thumbnail: vi.fn(async (entry: ProjectHistoryEntry) => `blob:${entry.id}`),
    release: vi.fn(),
    restore: vi.fn(done),
    star: vi.fn(done),
    remove: vi.fn(done),
    watch: vi.fn(() => () => undefined),
  } satisfies DialogProjectHistorySource;
  return { source, snapshot, autosave, starred };
}

/**
 * Builds a source over a list of saves that its actions change, like the store
 * does, and that tells the dialog about changes made elsewhere.
 *
 * @returns Source, its saves and a way to change them from outside.
 */
function sourceLive() {
  const { snapshot, autosave, starred } = sourceCreate();
  let list: ProjectHistoryEntry[] = [snapshot, autosave, starred];
  const listeners = new Set<() => void>();
  const changed = (next: ProjectHistoryEntry[]) => {
    list = next;
    listeners.forEach((listener) => listener());
  };
  const source = {
    entries: vi.fn(async () => list.map((entry) => ({ ...entry }))),
    thumbnail: vi.fn(async (entry: ProjectHistoryEntry) => `blob:${entry.id}`),
    release: vi.fn(),
    restore: vi.fn(async () => ({ message: 'Done.' })),
    star: vi.fn(async (entry: ProjectHistoryEntry, value: boolean) => {
      list = list.map((item) => (item.id === entry.id ? { ...item, starred: value } : item));
      return { message: 'Starred.' };
    }),
    remove: vi.fn(async (entry: ProjectHistoryEntry) => {
      list = list.filter((item) => item.id !== entry.id);
      return { message: 'Deleted.' };
    }),
    watch: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  } satisfies DialogProjectHistorySource;
  return { source, changed, list: () => list };
}

/**
 * Returns the slideshow in a date row.
 *
 * @param day Day key.
 * @returns Slideshow, or null.
 */
function slidesOf(day: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-history-day="${day}"] [data-history-slideshow]`);
}

/**
 * Deletes a save through its trash button and the confirmation.
 *
 * @param id Save id.
 */
async function trash(id: string): Promise<void> {
  find(`[data-history-trash="${id}"]`).click();
  find('[data-history-confirm="delete"]').click();
  await vi.waitFor(() => expect(document.querySelector(`[data-history-entry="${id}"]`)).toBeNull());
}

/**
 * Opens the dialog and waits for its first render.
 *
 * @param source Source.
 * @returns Dialog root.
 */
async function dialogOpen(source: DialogProjectHistorySource): Promise<HTMLElement> {
  void new DialogProjectHistory(document.body, source).open();
  await vi.waitFor(() => expect(document.querySelectorAll('[data-history-entry]').length).toBeGreaterThan(0));
  return document.querySelector<HTMLElement>('[data-project-history]')!;
}

/**
 * Presses a key on the focused element.
 *
 * @param key Key name.
 */
function press(key: string): void {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

/**
 * Lists the ids of the shown saves.
 *
 * @returns Ids in order.
 */
function shownIds(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-history-entry]')].map((row) => row.dataset['historyEntry']!);
}

/**
 * Returns an element or fails.
 *
 * @param selector CSS selector.
 * @returns Element.
 */
function find(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`missing ${selector}`);
  return element;
}

/**
 * Lets a running action finish.
 *
 * @returns Resolves after a macrotask.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  press('Escape');
  press('Escape');
  document.body.replaceChildren();
});

describe('DialogProjectHistory', () => {
  it('lists the days newest first by their date, and the autosaves of a day first', async () => {
    const root = await dialogOpen(sourceCreate().source);
    const days = [...root.querySelectorAll<HTMLElement>('[data-history-day]')];
    expect(days.map((day) => day.dataset['historyDay'])).toEqual(['2026-11-11', '2026-11-10']);
    expect(days[0]?.textContent).toContain(projectHistoryDayLabel('2026-11-11'));
    expect(days[0]?.textContent).toContain('2 saves');
    expect(days[1]?.textContent).toContain('1 save \u00b7 1 starred');
    expect(shownIds()).toEqual(['a1', 's1']);
    expect(find('[data-history-entry="a1"] [data-history-pill]').textContent).toBe('AUTOSAVE');
    expect(root.querySelector('[data-history-entry="s1"] [data-history-pill]')).toBeNull();
    expect(find('[data-history-entry="a1"]').textContent).toContain('Collaborative Room \u00b7 12 objects');
    expect(find('[data-history-entry="s1"]').textContent).toContain('keep \u00b7 12 objects');
    expect(root.querySelectorAll('.editor-custom-scroller')).toHaveLength(2);
    expect(root.textContent).not.toContain('Open As Copy');
  });

  it('shows the saves of another day when it is picked', async () => {
    await dialogOpen(sourceCreate().source);
    find('[data-history-day="2026-11-10"]').click();
    expect(shownIds()).toEqual(['y1']);
    expect(find('[data-history-star="y1"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles the star, which explains that a starred save is never deleted', async () => {
    const { source, snapshot } = sourceCreate();
    await dialogOpen(source);
    const star = find('[data-history-star="s1"]');
    expect(star.title).toBe(DIALOG_PROJECT_HISTORY_STAR_TIP);
    expect(star.getAttribute('aria-pressed')).toBe('false');
    star.click();
    await vi.waitFor(() => expect(source.star).toHaveBeenCalledWith(snapshot, true));
  });

  it('deletes a save only after the confirmation is accepted', async () => {
    const { source, snapshot } = sourceCreate();
    await dialogOpen(source);
    find('[data-history-trash="s1"]').click();
    expect(find('[data-history-entry="s1"]').textContent).toContain('Delete this save?');
    press('Escape');
    expect(document.querySelector('[data-history-confirm]')).toBeNull();
    expect(document.querySelector('[data-project-history]')).not.toBeNull();
    find('[data-history-trash="s1"]').click();
    expect(source.remove).not.toHaveBeenCalled();
    find('[data-history-confirm="delete"]').click();
    await vi.waitFor(() => expect(source.remove).toHaveBeenCalledWith(snapshot));
  });

  it('restores with the Restore button, a double-click or Enter', async () => {
    const { source, snapshot, autosave } = sourceCreate();
    await dialogOpen(source);
    find('[data-history-restore="s1"]').click();
    await vi.waitFor(() => expect(source.restore).toHaveBeenLastCalledWith(snapshot));
    await settle();
    find('[data-history-entry="a1"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await vi.waitFor(() => expect(source.restore).toHaveBeenLastCalledWith(autosave));
    await settle();
    find('[data-history-entry="a1"]').focus();
    press('ArrowDown');
    press('Enter');
    await vi.waitFor(() => expect(source.restore).toHaveBeenCalledTimes(3));
    expect(source.restore).toHaveBeenLastCalledWith(snapshot);
  });

  it("shows a thumbnail's enlarged preview after a short wait, never taking the pointer", async () => {
    await dialogOpen(sourceCreate().source);
    vi.useFakeTimers();
    const preview = find('[data-history-preview]');
    expect(preview.style.pointerEvents).toBe('none');
    const first = find('[data-history-thumb="a1"]');
    first.dispatchEvent(new MouseEvent('pointerenter'));
    await vi.advanceTimersByTimeAsync(DIALOG_PROJECT_HISTORY_PREVIEW_DELAY_MS - 1);
    expect(preview.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(preview.hidden).toBe(false);
    expect(preview.dataset['historyPreview']).toBe('a1');
    expect(preview.style.backgroundImage).toContain('blob:a1');
    first.dispatchEvent(new MouseEvent('pointerleave'));
    expect(preview.hidden).toBe(true);
    const next = find('[data-history-thumb="s1"]');
    next.dispatchEvent(new MouseEvent('pointerenter'));
    await vi.advanceTimersByTimeAsync(0);
    expect(preview.hidden).toBe(false);
    expect(preview.dataset['historyPreview']).toBe('s1');
    expect(preview.style.backgroundImage).toContain('blob:s1');
    expect(preview.style.pointerEvents).toBe('none');
    next.dispatchEvent(new MouseEvent('pointerleave'));
    expect(preview.hidden).toBe(true);
  });

  it('gives every date row its own slideshow in its icon slot, and none above the list', async () => {
    const root = await dialogOpen(sourceCreate().source);
    expect(root.querySelectorAll('[data-history-slideshow]')).toHaveLength(2);
    await vi.waitFor(() => expect(slidesOf('2026-11-11')?.dataset['historySlideshow']).toBe('blob:s1'));
    await vi.waitFor(() => expect(slidesOf('2026-11-10')?.dataset['historySlideshow']).toBe('blob:y1'));
    expect(slidesOf('2026-11-11')?.dataset['historySlides']).toBe('2');
    const row = find('[data-history-day="2026-11-11"]');
    expect(row.firstElementChild).toBe(slidesOf('2026-11-11'));
    expect(row.textContent).toBe(`${projectHistoryDayLabel('2026-11-11')}2 saves`);
  });

  it('fades between pictures, and holds still with reduced motion', async () => {
    await dialogOpen(sourceCreate().source);
    const slideshow = slidesOf('2026-11-11')!;
    await vi.waitFor(() => expect(slideshow.dataset['historySlideshow']).toBe('blob:s1'));
    expect((slideshow.firstElementChild as HTMLElement).style.transition).toContain('opacity');
    press('Escape');
    document.body.replaceChildren();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    await dialogOpen(sourceCreate().source);
    const still = slidesOf('2026-11-11')!;
    await vi.waitFor(() => expect(still.dataset['historySlideshow']).toBe('blob:s1'));
    expect((still.firstElementChild as HTMLElement).style.transition).toBe('none');
  });

  it('drops a deleted save from its date slideshow, and the date once its last save is gone', async () => {
    const { source } = sourceLive();
    await dialogOpen(source);
    const today = slidesOf('2026-11-11')!;
    await vi.waitFor(() => expect(today.dataset['historySlideshow']).toBe('blob:s1'));
    await trash('s1');
    await vi.waitFor(() => expect(slidesOf('2026-11-11')?.dataset['historySlideshow']).toBe('blob:a1'));
    expect(slidesOf('2026-11-11')?.dataset['historySlides']).toBe('1');
    find('[data-history-day="2026-11-10"]').click();
    await trash('y1');
    expect(document.querySelector('[data-history-day="2026-11-10"]')).toBeNull();
    expect(document.querySelectorAll('[data-history-slideshow]')).toHaveLength(1);
  });

  it('keeps a date slideshow running when a save is starred or unstarred', async () => {
    const { source } = sourceLive();
    await dialogOpen(source);
    const today = slidesOf('2026-11-11')!;
    await vi.waitFor(() => expect(today.dataset['historySlideshow']).toBe('blob:s1'));
    find('[data-history-star="s1"]').click();
    await vi.waitFor(() => expect(find('[data-history-day="2026-11-11"]').textContent).toContain('1 starred'));
    expect(slidesOf('2026-11-11')).toBe(today);
    expect(today.dataset['historySlides']).toBe('2');
    find('[data-history-star="s1"]').click();
    await vi.waitFor(() => expect(find('[data-history-day="2026-11-11"]').textContent).not.toContain('starred'));
    expect(slidesOf('2026-11-11')).toBe(today);
  });

  it('follows saves made and pruned while it is open', async () => {
    const { source, changed, list } = sourceLive();
    await dialogOpen(source);
    await vi.waitFor(() => expect(slidesOf('2026-11-10')?.dataset['historySlideshow']).toBe('blob:y1'));
    const fresh = entryOf('s2', TODAY + 60_000);
    changed([fresh, ...list().filter((entry) => entry.day !== '2026-11-10')]);
    await vi.waitFor(() => expect(slidesOf('2026-11-11')?.dataset['historySlideshow']).toBe('blob:s2'));
    expect(slidesOf('2026-11-11')?.dataset['historySlides']).toBe('3');
    expect(document.querySelector('[data-history-day="2026-11-10"]')).toBeNull();
    expect(shownIds()).toEqual(['a1', 's2', 's1']);
    press('Escape');
    await vi.waitFor(() => expect(document.querySelector('[data-project-history]')).toBeNull());
    changed([]);
    expect(source.entries).toHaveBeenCalledTimes(2);
  });
});

describe('DialogProjectHistorySlideshow', () => {
  afterEach(() => vi.useRealTimers());

  it('starts each date at its own moment, so the slideshows never change together', async () => {
    const phases = Array.from({ length: 14 }, (_, index) => dialogProjectHistorySlidePhase(index));
    expect(phases[0]).toBe(0);
    expect(new Set(phases).size).toBe(14);
    expect(phases.every((phase) => phase >= 0 && phase < DIALOG_PROJECT_HISTORY_SLIDE_MS)).toBe(true);
    vi.useFakeTimers();
    const pictures = (prefix: string) => [async () => `blob:${prefix}1`, async () => `blob:${prefix}2`];
    const first = new DialogProjectHistorySlideshow(40, phases[0]!);
    const second = new DialogProjectHistorySlideshow(40, phases[1]!);
    first.show('a', pictures('a'));
    second.show('b', pictures('b'));
    await vi.advanceTimersByTimeAsync(0);
    expect([first.current(), second.current()]).toEqual(['blob:a1', 'blob:b1']);
    await vi.advanceTimersByTimeAsync(DIALOG_PROJECT_HISTORY_SLIDE_MS);
    expect([first.current(), second.current()]).toEqual(['blob:a2', 'blob:b1']);
    await vi.advanceTimersByTimeAsync(phases[1]!);
    expect([first.current(), second.current()]).toEqual(['blob:a2', 'blob:b2']);
    first.dispose();
    second.dispose();
  });

  it('loads each picture only when it is due, and keeps going when the same pictures are shown again', async () => {
    vi.useFakeTimers();
    const loads = [vi.fn(async () => 'blob:1'), vi.fn(async () => 'blob:2'), vi.fn(async () => 'blob:3')];
    const slideshow = new DialogProjectHistorySlideshow(40, 0);
    slideshow.show('k', loads);
    await vi.advanceTimersByTimeAsync(0);
    expect(loads.map((load) => load.mock.calls.length)).toEqual([1, 0, 0]);
    await vi.advanceTimersByTimeAsync(DIALOG_PROJECT_HISTORY_SLIDE_MS);
    slideshow.show('k', loads);
    await vi.advanceTimersByTimeAsync(0);
    expect(slideshow.current()).toBe('blob:2');
    expect(loads.map((load) => load.mock.calls.length)).toEqual([1, 1, 0]);
    slideshow.dispose();
  });
});

describe('dialogProjectHistoryPreviewPlace', () => {
  const list = new DOMRect(400, 100, 500, 500);
  const thumb = new DOMRect(410, 520, 64, 64);

  it('goes right of the list, centred on the thumbnail and inside the window', () => {
    expect(dialogProjectHistoryPreviewPlace(thumb, list, 1600, 900)).toEqual({ left: 912, top: 424, size: 256 });
    expect(dialogProjectHistoryPreviewPlace(thumb, list, 1600, 640).top).toBe(640 - 8 - 256);
  });

  it('flips left of the list when the right side has no room, never over the rows', () => {
    const place = dialogProjectHistoryPreviewPlace(thumb, list, 1000, 900);
    expect(place.left + place.size).toBeLessThanOrEqual(list.left);
    expect(place.left).toBe(400 - 12 - 256);
  });
});
