import { FOLDER_TREE_CLASS, folderTreeStylesheetEnsure } from './folder_tree_styles.js';
import { IconFolderTree } from './icon_folder_tree.js';
import {
  VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS,
  virtualListScrollbarBind,
  virtualListScrollbarBindStylesEnsure,
  virtualListScrollbarGutterSync,
  type VirtualListScrollbarBinding,
} from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';

/** Default scrollbar arrow step of a folder tree, about one row. */
const FOLDER_TREE_SCROLL_STEP_PX = 18;

/** Indent of one nesting level, in pixels. */
const FOLDER_TREE_INDENT_PX = 12;

/** One folder of a folder tree, in display order (depth-first). */
export interface FolderTreeRow {
  /** Folder key ('' for the root). */
  path: string;
  name: string;
  depth: number;
  /** True when subfolders follow (the row shows an expand arrow). */
  hasChildren: boolean;
}

/** How a folder tree shows its rows and reports clicks. */
export interface FolderTreeOptions<Row extends FolderTreeRow> {
  /** Receives the folder the user clicked. */
  onSelect: (path: string) => void;

  /** Row tooltip; defaults to the path, or the name for the root. */
  rowTitle?: (row: Row) => string;
  /** Number shown after the name when above zero; none when omitted. */
  rowCount?: (row: Row) => number;
  /** Adds extra behavior to a row element, such as drop targets. */
  rowBind?: (element: HTMLElement, row: Row) => void;
}

/**
 * Collapsible folder tree with folder icons and the outliner's custom
 * scrollbar. Only top-level folders start expanded. Expanded and collapsed
 * folders and the scroll position survive redraws; selecting a folder never
 * rebuilds or scrolls the list.
 */
export class FolderTree<Row extends FolderTreeRow> {
  /** Positioned element holding the scroller and its scrollbar. */
  readonly host: HTMLElement;
  /** Element that scrolls and holds the rows. */
  readonly scroller: HTMLElement;
  private readonly options: FolderTreeOptions<Row>;
  private readonly expansion = new Map<string, boolean>();
  private readonly binding: VirtualListScrollbarBinding;
  private readonly observer: ResizeObserver | null;
  private rows: readonly Row[] = [];
  private selected: string | null = null;

  /**
   * Creates an empty tree.
   *
   * @param options Row display and click handling.
   */
  constructor(options: FolderTreeOptions<Row>) {
    folderTreeStylesheetEnsure();
    virtualListScrollbarBindStylesEnsure();
    this.options = options;
    this.host = folderTreeDiv('host');
    this.scroller = document.createElement('div');
    this.scroller.className = `${FOLDER_TREE_CLASS} ${VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS}`;
    this.scroller.setAttribute('role', 'tree');
    this.host.append(this.scroller);
    this.binding = virtualListScrollbarBind(this.host, this.scroller, FOLDER_TREE_SCROLL_STEP_PX);
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.scrollLayout());
    this.observer?.observe(this.scroller);
  }

  /**
   * Shows new folders and selection, keeping expansion and scroll position.
   *
   * @param rows Folders in display order.
   * @param selected Selected folder, or null for none.
   */
  render(rows: readonly Row[], selected: string | null): void {
    this.rows = rows;
    this.selected = selected;
    this.draw();
  }

  /**
   * Highlights one folder without rebuilding the rows.
   *
   * @param path Folder to select, or null for none.
   */
  select(path: string | null): void {
    this.selected = path;
    this.scroller.querySelectorAll<HTMLElement>('[data-folder-path]').forEach((element) => {
      element.setAttribute('aria-selected', String(element.dataset['folderPath'] === path));
    });
  }

  /**
   * Expands or collapses a folder.
   *
   * @param path Folder path.
   */
  toggle(path: string): void {
    const row = this.rows.find((candidate) => candidate.path === path);
    if (row === undefined) return;
    this.expansion.set(path, !this.isExpanded(row));
    this.draw();
  }

  /**
   * Expands every folder above one, so it shows.
   *
   * @param path Folder path.
   */
  reveal(path: string): void {
    const index = this.rows.findIndex((row) => row.path === path);
    let depth = this.rows[index]?.depth ?? 0;
    for (let ancestor = index - 1; ancestor >= 0 && depth > 0; ancestor--) {
      const row = this.rows[ancestor]!;
      if (row.depth >= depth) continue;
      this.expansion.set(row.path, true);
      depth = row.depth;
    }
    this.draw();
  }

  /** Scrolls the least needed to show the selected folder. */
  selectedScrollIntoView(): void {
    const row = [...this.scroller.querySelectorAll<HTMLElement>('[data-folder-path]')].find(
      (element) => element.dataset['folderPath'] === this.selected,
    );
    if (row === undefined) return;
    const top = row.offsetTop - this.scroller.offsetTop;
    if (top < this.scroller.scrollTop) this.scroller.scrollTop = top;
    else if (top + row.offsetHeight > this.scroller.scrollTop + this.scroller.clientHeight)
      this.scroller.scrollTop = top + row.offsetHeight - this.scroller.clientHeight;
  }

  /** Removes the scrollbar and stops observing sizes. */
  dispose(): void {
    this.observer?.disconnect();
    this.binding.dispose();
  }

  /** Rebuilds the visible rows in place. */
  private draw(): void {
    const scroll = this.scroller.scrollTop;
    this.scroller.replaceChildren(...this.visibleRows().map((row) => this.rowElement(row)));
    this.scroller.scrollTop = scroll;
    this.scrollLayout();
  }

  /** Reserves the scrollbar gutter while rows overflow, and syncs the bar. */
  private scrollLayout(): void {
    virtualListScrollbarGutterSync(this.scroller, this.binding, 0);
  }

  /** @returns Rows whose ancestors are all expanded. */
  private visibleRows(): Row[] {
    const visible: Row[] = [];
    let hiddenBelow = Infinity;
    for (const row of this.rows) {
      if (row.depth > hiddenBelow) continue;
      hiddenBelow = row.hasChildren && !this.isExpanded(row) ? row.depth : Infinity;
      visible.push(row);
    }
    return visible;
  }

  /**
   * Tells whether a folder is expanded: the user's choice, else only top-level
   * folders such as the root.
   *
   * @param row Folder.
   * @returns True when its subfolders show.
   */
  private isExpanded(row: Row): boolean {
    return this.expansion.get(row.path) ?? row.depth === 0;
  }

  /**
   * Creates one folder row: arrow, icon, name and count.
   *
   * @param row Folder.
   * @returns Row element.
   */
  private rowElement(row: Row): HTMLElement {
    const element = folderTreeDiv('row');
    const expanded = row.hasChildren && this.isExpanded(row);
    element.dataset['folderPath'] = row.path;
    element.setAttribute('role', 'treeitem');
    element.setAttribute('aria-selected', String(row.path === this.selected));
    if (row.hasChildren) element.setAttribute('aria-expanded', String(expanded));
    element.style.paddingLeft = `${8 + row.depth * FOLDER_TREE_INDENT_PX}px`;
    element.title = this.options.rowTitle?.(row) ?? (row.path || row.name);
    element.append(this.arrowElement(row, expanded), folderTreeIcon(expanded), folderTreeName(row.name));
    const count = this.options.rowCount?.(row) ?? 0;
    if (count > 0) element.append(folderTreeCount(count));
    element.addEventListener('click', () => this.options.onSelect(row.path));
    this.options.rowBind?.(element, row);
    return element;
  }

  /**
   * Creates the expand arrow of a row: the outliner's glyph, turned when
   * expanded, and an empty slot for folders without subfolders.
   *
   * @param row Folder.
   * @param expanded Whether it is expanded.
   * @returns Arrow element.
   */
  private arrowElement(row: Row, expanded: boolean): HTMLElement {
    const arrow = folderTreeDiv('arrow');
    arrow.textContent = row.hasChildren ? '▶' : '';
    arrow.style.transform = expanded ? 'rotate(90deg)' : 'none';
    if (!row.hasChildren) return arrow;
    arrow.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggle(row.path);
    });
    return arrow;
  }
}

/**
 * Creates a div with a folder tree class.
 *
 * @param part Class suffix.
 * @returns Element.
 */
function folderTreeDiv(part: string): HTMLElement {
  const element = document.createElement('div');
  element.className = `${FOLDER_TREE_CLASS}-${part}`;
  return element;
}

/**
 * Creates the folder icon of a row.
 *
 * @param open Whether to show the open folder.
 * @returns Icon element.
 */
function folderTreeIcon(open: boolean): HTMLElement {
  const icon = document.createElement('span');
  icon.className = `${FOLDER_TREE_CLASS}-icon`;
  icon.dataset['folderIcon'] = open ? 'open' : 'closed';
  icon.innerHTML = open ? IconFolderTree.open() : IconFolderTree.closed();
  return icon;
}

/**
 * Creates the name of a row.
 *
 * @param name Folder name.
 * @returns Name element.
 */
function folderTreeName(name: string): HTMLElement {
  const element = document.createElement('span');
  element.className = `${FOLDER_TREE_CLASS}-name`;
  element.textContent = name;
  return element;
}

/**
 * Creates the count after a row's name.
 *
 * @param count Number shown.
 * @returns Count element.
 */
function folderTreeCount(count: number): HTMLElement {
  const element = document.createElement('span');
  element.className = `${FOLDER_TREE_CLASS}-count`;
  element.textContent = String(count);
  return element;
}
