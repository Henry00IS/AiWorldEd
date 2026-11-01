import { afterEach, describe, expect, it } from 'vitest';
import type { SnapshotCollaborationMeta } from '@/collaboration/snapshot/store_collaboration_snapshot.js';
import {
  DialogCollaborationSnapshots,
  dialogCollaborationSnapshotsLabel,
} from '@/collaboration/ui/dialog_collaboration_snapshots.js';

/**
 * Builds a snapshot entry.
 *
 * @param id Snapshot id.
 * @param savedAt Save time.
 * @param stored Where it is kept.
 * @returns Snapshot.
 */
function meta(id: string, savedAt: number, stored: 'memory' | 'project' = 'memory'): SnapshotCollaborationMeta {
  return { id, savedAt, count: 42, reason: 'periodic', stored };
}

/**
 * Settles pending promises.
 *
 * @returns Promise.
 */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Finds a dialog button by its text.
 *
 * @param text Button text.
 * @returns Button.
 */
function button(text: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (candidate) => candidate.textContent === text,
  )!;
}

/** The owner's snapshot picker. */
describe('dialog_collaboration_snapshots', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('labels snapshots with age, object count, reason and where they are kept', () => {
    const now = Date.UTC(2026, 10, 1, 12, 0, 0);
    expect(dialogCollaborationSnapshotsLabel(meta('a', now - 5 * 60_000), now)).toContain('5 min ago');
    expect(dialogCollaborationSnapshotsLabel(meta('a', now), now)).toContain('just now');
    expect(dialogCollaborationSnapshotsLabel(meta('a', now - 3 * 3_600_000), now)).toContain('3 h ago');
    const label = dialogCollaborationSnapshotsLabel(meta('a', now, 'project'), now);
    expect(label).toContain('42 object(s)');
    expect(label).toContain('in project folder');
  });

  it('lists snapshots, takes one on request and resolves the chosen snapshot', async () => {
    const list = [meta('one', Date.now())];
    let takes = 0;
    const source = {
      list: async () => [...list],
      take: async () => {
        takes++;
        list.unshift(meta('two', Date.now()));
      },
    };
    const pending = new DialogCollaborationSnapshots(document.body, source).open();
    await tick();
    expect(document.querySelectorAll('[data-collaboration-snapshot]').length).toBe(1);
    button('Take snapshot now').click();
    await tick();
    await tick();
    expect(takes).toBe(1);
    const rows = [...document.querySelectorAll<HTMLElement>('[data-collaboration-snapshot]')];
    expect(rows.map((row) => row.dataset['collaborationSnapshot'])).toEqual(['two', 'one']);
    rows[1]!.querySelector('button')!.click();
    expect((await pending)?.id).toBe('one');
  });

  it('says so when there are no snapshots and resolves null on Close', async () => {
    const pending = new DialogCollaborationSnapshots(document.body, {
      list: async () => [],
      take: async () => undefined,
    }).open();
    await tick();
    expect(document.body.textContent).toContain('No snapshots yet.');
    button('Close').click();
    expect(await pending).toBeNull();
  });
});
