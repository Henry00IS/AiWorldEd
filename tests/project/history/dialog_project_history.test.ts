import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DialogProjectHistory,
  dialogProjectHistorySummary,
  type DialogProjectHistorySource,
} from '@/project/history/dialog_project_history.js';
import { dialogProjectHistoryDetailsText } from '@/project/history/dialog_project_history_row.js';
import type { ProjectHistoryEntry } from '@/project/history/project_history_entry.js';

const NOW = Date.now();

/**
 * Builds an entry.
 *
 * @param overrides Entry fields.
 * @returns Entry.
 */
function entryOf(overrides: Partial<ProjectHistoryEntry>): ProjectHistoryEntry {
  return {
    id: 'a',
    path: 'a',
    kind: 'autosave',
    level: 'maps__start',
    time: NOW - 60_000,
    locked: false,
    size: 2048,
    objectCount: null,
    reason: null,
    snapshotId: null,
    ...overrides,
  };
}

/**
 * Builds a dialog source.
 *
 * @param entries Entries.
 * @returns Source with spies.
 */
function sourceOf(entries: ProjectHistoryEntry[]): DialogProjectHistorySource {
  return {
    projectName: () => 'game',
    current: () => 'maps__start',
    entries: vi.fn(async () => entries),
    details: vi.fn(async () => ({ objectCount: 12, sourcePath: null, room: null })),
    lock: vi.fn(async () => undefined),
    restoreBlocked: (entry) => (entry.kind === 'room' ? 'Room snapshots restore while you own a room.' : null),
    take: vi.fn(async () => undefined),
    takeLabel: () => 'Take Snapshot',
  };
}

afterEach(() => document.body.replaceChildren());

describe('DialogProjectHistory', () => {
  it('shows levels, days, kinds, details, lock state and why a restore is blocked', async () => {
    const entries = [
      entryOf({ id: 'a', locked: true, kind: 'snapshot' }),
      entryOf({
        id: 'b',
        kind: 'room',
        level: null,
        path: null,
        size: null,
        objectCount: 5,
        reason: 'periodic',
        snapshotId: 'r',
      }),
    ];
    const pending = new DialogProjectHistory(document.body, sourceOf(entries)).open();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-history-entry]')).toHaveLength(2));
    const text = document.querySelector('[data-project-history]')?.textContent ?? '';
    expect(text).toContain('maps/start');
    expect(text).toContain('Open Level');
    expect(text).toContain('TODAY');
    expect(text).toContain('Room Autosave');
    expect(text).toContain('2 entries \u00b7 1 locked');
    const room = document.querySelector<HTMLElement>('[data-history-entry="b"]');
    const restore = [...(room?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Restore\u2026',
    );
    expect(restore?.disabled).toBe(true);
    expect(restore?.title).toContain('own a room');
    expect(room?.querySelector<HTMLButtonElement>('[data-history-lock]')?.disabled).toBe(true);
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'Close')?.click();
    expect(await pending).toBeNull();
  });

  it('locks through the source and reloads the list', async () => {
    const source = sourceOf([entryOf({ id: 'a' })]);
    const pending = new DialogProjectHistory(document.body, source).open();
    await vi.waitFor(() => expect(document.querySelector('[data-history-lock]')).not.toBeNull());
    const lock = document.querySelector<HTMLButtonElement>('[data-history-lock]');
    expect(lock?.getAttribute('aria-label')).toBe('Lock');
    lock?.click();
    await vi.waitFor(() => expect(source.lock).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), true));
    await vi.waitFor(() => expect(source.entries).toHaveBeenCalledTimes(2));
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'Close')?.click();
    await pending;
  });

  it('runs a lock and a snapshot clicked in quick succession one after another', async () => {
    const source = sourceOf([entryOf({ id: 'a' })]);
    let release = (): void => undefined;
    vi.mocked(source.lock).mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    const pending = new DialogProjectHistory(document.body, source).open();
    await vi.waitFor(() => expect(document.querySelector('[data-history-lock]')).not.toBeNull());
    document.querySelector<HTMLButtonElement>('[data-history-lock]')?.click();
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'Take Snapshot')?.click();
    expect(document.querySelector('[data-project-history]')?.textContent).toContain('Saving\u2026');
    await vi.waitFor(() => expect(source.lock).toHaveBeenCalled());
    expect(source.take).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(source.take).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(source.entries).toHaveBeenCalledTimes(2));
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'Close')?.click();
    await pending;
  });

  it('closes with Escape while a control inside has focus', async () => {
    const pending = new DialogProjectHistory(document.body, sourceOf([entryOf({ id: 'a' })])).open();
    await vi.waitFor(() => expect(document.querySelector('[data-history-entry]')).not.toBeNull());
    const button = document.querySelector<HTMLButtonElement>('[data-history-lock]');
    button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await pending).toBeNull();
    expect(document.querySelector('[data-project-history]')).toBeNull();
  });

  it('returns the entry to restore', async () => {
    const pending = new DialogProjectHistory(document.body, sourceOf([entryOf({ id: 'a' })])).open();
    await vi.waitFor(() => expect(document.querySelector('[data-history-entry]')).not.toBeNull());
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'Restore\u2026')?.click();
    expect((await pending)?.id).toBe('a');
  });

  it('words details and the summary', () => {
    const entry = entryOf({ size: 1536 });
    expect(dialogProjectHistoryDetailsText(entry, { objectCount: 3000, sourcePath: null, room: 'Jam' })).toBe(
      '3000 objects \u00b7 1.5 KB \u00b7 Room \u201cJam\u201d',
    );
    expect(
      dialogProjectHistoryDetailsText(entryOf({ size: null }), { objectCount: null, sourcePath: null, room: null }),
    ).toBe('In Memory Only');
    expect(dialogProjectHistorySummary([])).toBe('0 entries');
  });
});
