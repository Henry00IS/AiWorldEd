import { afterEach, describe, expect, it, vi } from 'vitest';
import { FolderTree, type FolderTreeRow } from '@/ui/folder_tree/folder_tree.js';
import { VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS } from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';

/** A small project: Game > Levels > Basement, Game > Models. */
const ROWS: readonly FolderTreeRow[] = [
  { path: '', name: 'Game', depth: 0, hasChildren: true },
  { path: 'Levels', name: 'Levels', depth: 1, hasChildren: true },
  { path: 'Levels/Basement', name: 'Basement', depth: 2, hasChildren: false },
  { path: 'Models', name: 'Models', depth: 1, hasChildren: false },
];

/**
 * Builds a tree in the document that starts with only the root expanded.
 *
 * @returns Tree and its select spy.
 */
function treeCreate() {
  const onSelect = vi.fn();
  const tree = new FolderTree<FolderTreeRow>({ onSelect });
  document.body.append(tree.host);
  tree.render(ROWS, '');
  return { tree, onSelect };
}

/**
 * Lists the shown folder paths.
 *
 * @param tree Tree.
 * @returns Paths in display order.
 */
function shown(tree: FolderTree<FolderTreeRow>): string[] {
  return [...tree.scroller.querySelectorAll<HTMLElement>('[data-folder-path]')].map(
    (row) => row.dataset['folderPath'] ?? '',
  );
}

/**
 * Returns the row element of a folder.
 *
 * @param tree Tree.
 * @param path Folder path.
 * @returns Row.
 */
function row(tree: FolderTree<FolderTreeRow>, path: string): HTMLElement {
  const element = tree.scroller.querySelector<HTMLElement>(`[data-folder-path="${path}"]`);
  if (element === null) throw new Error(`missing ${path}`);
  return element;
}

describe('FolderTree', () => {
  afterEach(() => document.body.replaceChildren());

  it('starts with the default expansion and toggles folders with the arrow', () => {
    const { tree } = treeCreate();
    expect(shown(tree)).toEqual(['', 'Levels', 'Models']);
    expect(row(tree, '').getAttribute('aria-expanded')).toBe('true');
    expect(row(tree, 'Levels').getAttribute('aria-expanded')).toBe('false');
    expect(row(tree, 'Models').hasAttribute('aria-expanded')).toBe(false);
    (row(tree, 'Levels').firstElementChild as HTMLElement).click();
    expect(shown(tree)).toEqual(['', 'Levels', 'Levels/Basement', 'Models']);
    tree.render(ROWS, '');
    expect(shown(tree)).toEqual(['', 'Levels', 'Levels/Basement', 'Models']);
  });

  it('shows an open folder icon for expanded folders and a closed one otherwise', () => {
    const { tree } = treeCreate();
    const icon = (path: string) =>
      row(tree, path).querySelector<HTMLElement>('[data-folder-icon]')?.dataset['folderIcon'];
    expect(['', 'Levels', 'Models'].map(icon)).toEqual(['open', 'closed', 'closed']);
    expect(row(tree, '').querySelector('[data-folder-icon] svg')).not.toBeNull();
    tree.toggle('Levels');
    expect(icon('Levels')).toBe('open');
  });

  it('selects without rebuilding the rows, so the list stays where it is', () => {
    const { tree, onSelect } = treeCreate();
    const models = row(tree, 'Models');
    models.click();
    expect(onSelect).toHaveBeenCalledWith('Models');
    tree.select('Models');
    expect(row(tree, 'Models')).toBe(models);
    expect(models.getAttribute('aria-selected')).toBe('true');
    expect(row(tree, '').getAttribute('aria-selected')).toBe('false');
  });

  it('reveals a nested folder by expanding the folders above it', () => {
    const { tree } = treeCreate();
    tree.reveal('Levels/Basement');
    expect(shown(tree)).toEqual(['', 'Levels', 'Levels/Basement', 'Models']);
  });

  it('shows counts only when asked and scrolls with the custom scrollbar', () => {
    const counted = new FolderTree<FolderTreeRow>({
      onSelect: () => undefined,
      rowCount: (folder) => (folder.path === 'Models' ? 3 : 0),
    });
    counted.render(ROWS, null);
    expect(counted.scroller.querySelector('[data-folder-path="Models"]')?.textContent).toBe('Models3');
    expect(counted.scroller.querySelector('[data-folder-path="Levels"]')?.textContent).toBe('▶Levels');
    expect(counted.scroller.classList.contains(VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS)).toBe(true);
    expect(counted.host.children.length).toBe(2);
    const { tree } = treeCreate();
    expect(row(tree, 'Models').textContent).toBe('Models');
    counted.dispose();
    expect(counted.host.children.length).toBe(1);
  });
});
