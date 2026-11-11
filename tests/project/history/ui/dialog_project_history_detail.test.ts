import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectHistoryIndexCreate } from '@/project/history/tree/project_history_tree.js';
import { projectHistoryTreeSnapshot } from '@/project/history/tree/project_history_tree_edit.js';
import { DialogProjectHistoryDetail } from '@/project/history/ui/dialog_project_history_detail.js';
import type { DialogProjectHistoryTree } from '@/project/history/ui/dialog_project_history_types.js';

/**
 * Builds a level tree with one named snapshot.
 *
 * @param note Note of the snapshot.
 * @returns Tree and node.
 */
function treeCreate(note: string) {
  const index = projectHistoryIndexCreate('level', 'maps/keep.aiworld');
  const node = projectHistoryTreeSnapshot(index, 1_000, 3, 'Gate');
  node.note = note;
  node.thumbnail = 'view';
  const tree: DialogProjectHistoryTree = {
    id: 'level/keep',
    kind: 'level',
    label: index.label,
    index,
    current: true,
    pending: false,
  };
  return { tree, node };
}

/**
 * Renders the panel of the snapshot into the document.
 *
 * @param note Note of the snapshot.
 * @returns Panel container.
 */
function panelRender(note: string): HTMLElement {
  const { tree, node } = treeCreate(note);
  const detail = new DialogProjectHistoryDetail({
    restore: vi.fn(),
    copy: vi.fn(),
    renameStart: vi.fn(),
    rename: vi.fn(),
    note: vi.fn(),
    remove: vi.fn(),
    thumbnail: vi.fn(),
    focusTree: vi.fn(),
  });
  const target = document.createElement('div');
  document.body.append(target);
  detail.render(target, tree, node, { mode: 'view', now: 2_000 });
  return target;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('DialogProjectHistoryDetail', () => {
  it('gives the note field its full height while rendering, before the pane is measured', () => {
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
      this: HTMLTextAreaElement,
    ) {
      return this.value.split('\n').length * 18;
    });
    const note = Array.from({ length: 12 }, (_, line) => `Line ${line + 1}`).join('\n');
    const area = panelRender(note).querySelector('textarea');
    expect(area?.style.height).toBe(`${12 * 18 + 2}px`);
  });

  it('does not word where the thumbnail came from', () => {
    const text = panelRender('').textContent ?? '';
    expect(text).not.toMatch(/Perspective|framed|thumbnail/i);
  });
});
