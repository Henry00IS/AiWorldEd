import type { ProjectFileRecord } from '@/project/scan/project_snapshot.js';
import { MenuContext, type MenuContextItem } from '@/ui/menu/menu_context.js';
import { ThumbnailGrid, thumbnailGridThumbCreate, thumbnailGridThumbSet } from '@/ui/thumbnail_grid/thumbnail_grid.js';
import {
  VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS,
  virtualListScrollbarBind,
  virtualListScrollbarBindStylesEnsure,
  virtualListScrollbarGutterSync,
  type VirtualListScrollbarBinding,
} from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';
import { PANEL_PROJECT_CLASS, panelProjectStylesheetEnsure } from './panel_project_styles.js';
import { panelProjectTileDragBind } from './panel_project_drag.js';
import { panelProjectSizeText } from './panel_project_view.js';

/**
 * Narrowest file grid column, gap between tiles, and tile padding plus border
 * (both sides).
 */
const PANEL_PROJECT_TILE_MIN_PX = 84;
const PANEL_PROJECT_TILE_GAP_PX = 6;
const PANEL_PROJECT_TILE_CHROME_PX = 10;

/** File grid padding while it does not scroll. */
const PANEL_PROJECT_GRID_PADDING_PX = 8;

/** Scrollbar arrow step of the file grid. */
const PANEL_PROJECT_GRID_STEP_PX = 40;

/** Kinds whose tiles show an image preview instead of a label. */
const PANEL_PROJECT_PREVIEW_KINDS: ReadonlySet<string> = new Set(['texture', 'curve', 'scene']);

/** Labels shown on file tiles that have no image preview. */
const PANEL_PROJECT_KIND_LABELS: Readonly<Record<string, string>> = {
  scene: 'LEVEL',
  vmf: 'VMF',
  obj: 'OBJ',
  glb: 'GLB',
  fbx: 'FBX',
  curve: 'CURVE',
  script: 'SCRIPT',
  path: 'PATH',
};

/** What the file grid does with the user's actions on its tiles. */
export interface PanelProjectGridHandlers {
  /** Opens a file (double-click or Enter). */
  onActivate: (record: ProjectFileRecord) => void;
  /** Gives the preview image of a file, or null while it has none. */
  thumbnail: (record: ProjectFileRecord) => string | null;
  /** Context menu items of a tile; none means no menu. */
  menu?: (record: ProjectFileRecord) => MenuContextItem[];
  /** Runs when a file tile is clicked and so selected. */
  select?: (record: ProjectFileRecord) => void;
  /** Runs when a file tile gets a key press, such as Delete. */
  key?: (record: ProjectFileRecord, event: KeyboardEvent) => void;
}

/**
 * The file grid of the project panel: thumbnail tiles that open, drag out and
 * have a context menu, with the outliner's scrollbar. The Resources tab of the
 * script editor shows a script's files with it too.
 */
export class PanelProjectGrid {
  /** Holds the grid and its scrollbar. */
  readonly host = panelProjectDiv('grid-host');
  /** The grid of tiles. */
  readonly grid = panelProjectDiv('grid');
  private readonly binding: VirtualListScrollbarBinding;
  private readonly observer: ResizeObserver | null;
  private readonly thumbnails: ThumbnailGrid;
  private selectedPath: string | null = null;
  private menu: MenuContext | null = null;

  /**
   * Builds the grid.
   *
   * @param handlers What tiles do.
   * @param menuHost Element context menus open in.
   */
  constructor(
    private readonly handlers: PanelProjectGridHandlers,
    private readonly menuHost: HTMLElement,
  ) {
    panelProjectStylesheetEnsure();
    virtualListScrollbarBindStylesEnsure();
    this.host.append(this.grid);
    this.grid.classList.add(VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS);
    this.binding = virtualListScrollbarBind(this.host, this.grid, PANEL_PROJECT_GRID_STEP_PX);
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.layout());
    this.observer?.observe(this.grid);
    this.thumbnails = new ThumbnailGrid(this.grid, {
      minColumnPx: PANEL_PROJECT_TILE_MIN_PX,
      gapPx: PANEL_PROJECT_TILE_GAP_PX,
      tileChromePx: PANEL_PROJECT_TILE_CHROME_PX,
    });
  }

  /**
   * Shows tiles, keeping the scroll position.
   *
   * @param tiles Tiles.
   */
  show(tiles: readonly HTMLElement[]): void {
    const scroll = this.grid.scrollTop;
    this.grid.replaceChildren(...tiles);
    this.grid.scrollTop = scroll;
    this.layout();
    this.thumbnails.draw();
  }

  /**
   * Shows a message instead of tiles.
   *
   * @param text Message.
   */
  empty(text: string): void {
    const empty = panelProjectDiv('empty');
    empty.textContent = text;
    this.grid.replaceChildren(empty);
    this.layout();
  }

  /**
   * Fills in thumbnails that finished loading since the tiles were made.
   *
   * @param find Finds the file of a tile by its path.
   */
  thumbnailsRefresh(find: (path: string) => ProjectFileRecord | undefined): void {
    this.grid.querySelectorAll<HTMLElement>('[data-file-path]').forEach((tile) => {
      const record = find(tile.dataset['filePath'] ?? '');
      const thumb = tile.firstElementChild as HTMLElement | null;
      if (!record || !thumb || !PANEL_PROJECT_PREVIEW_KINDS.has(record.kind)) return;
      this.thumbShow(thumb, record);
    });
    this.thumbnails.draw();
  }

  /**
   * Tells whether a tile is the selected one.
   *
   * @param path File or folder path.
   * @returns True when selected.
   */
  selected(path: string): boolean {
    return path === this.selectedPath;
  }

  /**
   * Creates one file tile.
   *
   * @param record File record.
   * @returns Tile element.
   */
  fileTile(record: ProjectFileRecord): HTMLElement {
    const tile = panelProjectDiv('tile');
    tile.dataset['filePath'] = record.path;
    tile.setAttribute('role', 'option');
    tile.setAttribute('aria-label', record.path);
    tile.setAttribute('aria-selected', String(this.selected(record.path)));
    tile.tabIndex = 0;
    tile.title = `${record.path}\n${panelProjectSizeText(record.size)} · ${new Date(record.lastModified).toLocaleString()}`;
    const name = panelProjectDiv('name');
    name.textContent = record.name;
    tile.append(this.thumbElement(record), name);
    tile.addEventListener('click', () => {
      this.select(record.path);
      this.handlers.select?.(record);
    });
    panelProjectTileDragBind(tile, record.path);
    tile.addEventListener('dblclick', () => this.handlers.onActivate(record));
    tile.addEventListener('keydown', (event) => this.tileKey(event, record));
    tile.addEventListener('contextmenu', (event) => this.tileMenu(event, record));
    return tile;
  }

  /**
   * Highlights one tile.
   *
   * @param path File or folder path.
   */
  select(path: string): void {
    this.selectedPath = path;
    this.grid.querySelectorAll<HTMLElement>('[data-file-path], [data-folder-tile]').forEach((tile) => {
      const tilePath = tile.dataset['filePath'] ?? tile.dataset['folderTile'];
      tile.setAttribute('aria-selected', tilePath === path ? 'true' : 'false');
    });
  }

  /** Reserves the scrollbar gutter while content overflows, and syncs the bar. */
  layout(): void {
    virtualListScrollbarGutterSync(this.grid, this.binding, PANEL_PROJECT_GRID_PADDING_PX);
  }

  /** Lets go of the menu, the scrollbar and the thumbnails. */
  dispose(): void {
    this.menu?.dispose();
    this.menu = null;
    this.observer?.disconnect();
    this.thumbnails.dispose();
    this.binding.dispose();
  }

  /**
   * Opens a file on Enter and hands other keys to the handlers.
   *
   * @param event Key press.
   * @param record File record.
   */
  private tileKey(event: KeyboardEvent, record: ProjectFileRecord): void {
    if (event.key === 'Enter') this.handlers.onActivate(record);
    else this.handlers.key?.(record, event);
  }

  /**
   * Opens the context menu of a tile, when it has one.
   *
   * @param event Context menu event.
   * @param record File record.
   */
  private tileMenu(event: MouseEvent, record: ProjectFileRecord): void {
    const items = this.handlers.menu?.(record) ?? [];
    if (items.length === 0) return;
    event.preventDefault();
    this.select(record.path);
    this.menu?.dispose();
    this.menu = new MenuContext(this.menuHost, items);
    this.menu.show(event.clientX, event.clientY);
  }

  /**
   * Creates the thumbnail or kind badge of a tile.
   *
   * @param record File record.
   * @returns Thumbnail element.
   */
  private thumbElement(record: ProjectFileRecord): HTMLElement {
    const fit = record.kind === 'texture' ? 'cover' : 'contain';
    const thumb = thumbnailGridThumbCreate(`${PANEL_PROJECT_CLASS}-thumb`, null, fit);
    thumb.dataset['kind'] = record.kind;
    this.thumbShow(thumb, record);
    return thumb;
  }

  /**
   * Shows a file's preview in its thumbnail, or its kind label while it has
   * none.
   *
   * @param thumb Thumbnail element.
   * @param record File record.
   */
  private thumbShow(thumb: HTMLElement, record: ProjectFileRecord): void {
    const url = PANEL_PROJECT_PREVIEW_KINDS.has(record.kind) ? this.handlers.thumbnail(record) : null;
    thumbnailGridThumbSet(thumb, url || null);
    if (url) {
      if (thumb.firstChild?.nodeType === Node.TEXT_NODE) thumb.firstChild.remove();
    } else thumb.textContent = PANEL_PROJECT_KIND_LABELS[record.kind] ?? '…';
  }
}

/**
 * Creates a div with a project panel class.
 *
 * @param part Class suffix.
 * @returns Element.
 */
export function panelProjectDiv(part: string): HTMLElement {
  const element = document.createElement('div');
  element.className = `${PANEL_PROJECT_CLASS}-${part}`;
  return element;
}
