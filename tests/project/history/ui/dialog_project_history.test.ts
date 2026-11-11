import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { projectHistoryIndexCreate } from '@/project/history/tree/project_history_tree.js';
import {
  projectHistoryTreeAutosave,
  projectHistoryTreeSnapshot,
} from '@/project/history/tree/project_history_tree_edit.js';
import { DialogProjectHistory } from '@/project/history/ui/dialog_project_history.js';
import type {
  DialogProjectHistorySource,
  DialogProjectHistoryTree,
} from '@/project/history/ui/dialog_project_history_types.js';

const DAY = 86_400_000;

/**
 * Builds a source with one level tree: a named snapshot and a session on it.
 *
 * @returns Source, its spies and the node ids.
 */
function sourceCreate() {
  const index = projectHistoryIndexCreate('level', 'maps/keep.aiworld');
  const named = projectHistoryTreeSnapshot(index, Date.now() - DAY, 3, 'Gate');
  const session = projectHistoryTreeAutosave(index, Date.now() - 1000, 4).node;
  const tree: DialogProjectHistoryTree = {
    id: 'level/keep',
    kind: 'level',
    label: index.label,
    index,
    current: true,
    pending: false,
  };
  const done = async () => ({ message: 'Done.' });
  const source = {
    projectName: () => 'Castle',
    now: () => Date.now(),
    trees: async () => [tree],
    thumbnail: async () => null,
    release: vi.fn(),
    restore: vi.fn(done),
    take: vi.fn(done),
    rename: vi.fn(done),
    note: vi.fn(done),
    remove: vi.fn(done),
    copy: vi.fn(done),
  } satisfies DialogProjectHistorySource;
  return { source, named, session };
}

/**
 * Opens the dialog and waits for its first render.
 *
 * @param source Source.
 * @returns Dialog root.
 */
async function dialogOpen(source: DialogProjectHistorySource): Promise<HTMLElement> {
  void new DialogProjectHistory(document.body, source).open();
  await vi.waitFor(() => expect(document.querySelectorAll('[data-history-node]').length).toBeGreaterThan(0));
  const root = document.querySelector<HTMLElement>('[data-project-history]');
  if (root === null) throw new Error('no dialog');
  return root;
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
 * Returns the label of the selected row.
 *
 * @returns Label.
 */
function selectedLabel(): string {
  return document.querySelector('[data-history-node][aria-selected="true"]')?.getAttribute('aria-label') ?? '';
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  press('Escape');
  document.body.replaceChildren();
});

describe('DialogProjectHistory', () => {
  it('scrolls its level list, tree and details with the editor scrollbar', async () => {
    const root = await dialogOpen(sourceCreate().source);
    expect(root.querySelectorAll('.editor-custom-scroller')).toHaveLength(3);
    expect(root.textContent).toContain('Every autosave and snapshot kept in project \u201cCastle\u201d');
  });

  it('says it is reading while the saved states load', async () => {
    const { source } = sourceCreate();
    let release = () => {};
    const trees = source.trees;
    source.trees = () => new Promise((resolve) => (release = () => void trees().then(resolve)));
    void new DialogProjectHistory(document.body, source).open();
    const status = () => document.querySelector('[data-project-history] [role="status"]')?.textContent;
    expect(status()).toBe('Reading saved states\u2026');
    release();
    await vi.waitFor(() => expect(status()).toMatch(/^1 history \u00b7 2 saved states/));
  });

  it('steps through the states with the arrow keys and restores the selected one with Enter', async () => {
    const { source, named } = sourceCreate();
    await dialogOpen(source);
    expect(selectedLabel()).toMatch(/^You Are Here/);
    press('End');
    expect(selectedLabel()).toMatch(/^Gate/);
    press('Enter');
    await vi.waitFor(() => expect(source.restore).toHaveBeenCalledWith(expect.anything(), named));
  });

  it('asks before deleting a named state but not an unnamed one', async () => {
    const { source, named, session } = sourceCreate();
    await dialogOpen(source);
    press('ArrowDown');
    press('Delete');
    await vi.waitFor(() => expect(source.remove).toHaveBeenCalledWith(expect.anything(), session));
    press('End');
    press('Delete');
    expect(document.body.textContent).toContain('Delete \u201cGate\u201d?');
    expect(source.remove).not.toHaveBeenCalledWith(expect.anything(), named);
  });

  it('renames with F2', async () => {
    const { source, named } = sourceCreate();
    await dialogOpen(source);
    press('End');
    press('F2');
    const input = document.activeElement;
    if (!(input instanceof HTMLInputElement)) throw new Error('no name field');
    input.value = 'Gate And Towers';
    press('Enter');
    await vi.waitFor(() => expect(source.rename).toHaveBeenCalledWith(expect.anything(), named, 'Gate And Towers'));
  });

  it('keeps the details in place when Escape leaves the note', async () => {
    await dialogOpen(sourceCreate().source);
    press('End');
    const area = document.querySelector<HTMLTextAreaElement>('[data-history-detail] textarea');
    if (area === null) throw new Error('no note field');
    area.focus();
    press('Escape');
    expect(document.querySelector('[data-history-detail] textarea')).toBe(area);
    expect(selectedLabel()).toMatch(/^Gate/);
  });

  it('keeps the details scrolled where they were when a note is saved', async () => {
    const { source } = sourceCreate();
    await dialogOpen(source);
    press('End');
    const scroller = document.querySelector<HTMLElement>('[data-history-detail]')?.parentElement;
    const area = document.querySelector<HTMLTextAreaElement>('[data-history-detail] textarea');
    if (!scroller || area === null) throw new Error('no details');
    scroller.scrollTop = 120;
    area.value = 'Towers kept';
    area.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(source.note).toHaveBeenCalled());
    await vi.waitFor(() => expect(document.querySelector('[data-history-detail] textarea')).not.toBe(area));
    expect(scroller.scrollTop).toBe(120);
  });
});
