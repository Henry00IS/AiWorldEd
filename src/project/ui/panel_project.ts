import { textCount } from '@/utils/utils_plural.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { createFloatingPanelResizeGrip } from '@/ui/floating_panel/panel_floating_resize.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';
import { styleFloatingPanelChromeButton } from '@/ui/floating_panel/panel_floating_title_bar.js';
import type { ProjectFileRecord, ProjectSnapshot } from '@/project/scan/project_snapshot.js';
import { projectSnapshotEmpty } from '@/project/scan/project_snapshot.js';
import type { ProjectFileSystemWatchMode } from '@/project/fs/project_file_system.js';
import { PANEL_PROJECT_CLASS, panelProjectStylesheetEnsure } from './panel_project_styles.js';
import { PANEL_PROJECT_PATH_DRAG_TYPE, panelProjectTileDragBind } from './panel_project_drag.js';
import { MenuContext, type MenuContextItem } from '@/ui/menu/menu_context.js';
import { ThumbnailGrid, thumbnailGridThumbCreate, thumbnailGridThumbSet } from '@/ui/thumbnail_grid/thumbnail_grid.js';
import {
  VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS,
  virtualListScrollbarBind,
  virtualListScrollbarBindStylesEnsure,
  virtualListScrollbarGutterSync,
  type VirtualListScrollbarBinding,
} from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';
import { FolderTree } from '@/ui/folder_tree/folder_tree.js';
import { IconFolderTree } from '@/ui/folder_tree/icon_folder_tree.js';
import {
  PANEL_PROJECT_VIRTUAL_CURVES,
  panelProjectFiles,
  panelProjectFolderChildRows,
  panelProjectFolderExists,
  panelProjectFolderHoldsFiles,
  panelProjectFolderRows,
  panelProjectSizeText,
  type PanelProjectFolderRow,
} from './panel_project_view.js';

/** Default outer width of the project panel in pixels. */
export const PANEL_PROJECT_DEFAULT_WIDTH_PX = 560;

/** Default outer height of the project panel in pixels. */
export const PANEL_PROJECT_DEFAULT_HEIGHT_PX = 380;

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
};

/** Everything the project panel shows. */
export interface PanelProjectState {
  name: string | null;
  pending: string | null;
  snapshot: ProjectSnapshot;
  notice: string | null;
  watchMode: ProjectFileSystemWatchMode;
  writable: boolean;
  /**
   * True while a room owner provides the project: browse only, no open, import
   * or close.
   */
  room?: boolean;
  /**
   * Notice shown instead of {@link notice} while the selected or hovered folder
   * is this folder or inside it (a member's own Local curves in a room).
   */
  noticeLocal?: { folder: string; text: string } | undefined;
}

/** Callbacks the project panel uses for user actions. */
export interface PanelProjectHandlers {
  onOpen: () => void;
  onReopen: () => void;
  onClose: () => void;
  onActivate: (record: ProjectFileRecord) => void;
  thumbnail: (record: ProjectFileRecord) => string | null;
  /** Context menu items of a tile; none means no menu. */
  menu?: (record: ProjectFileRecord) => MenuContextItem[];
  /**
   * Whether a folder row takes dragged tiles (such as copying a curve between
   * Remote and Local).
   */
  folderDropAccepts?: (folder: string) => boolean;
  /** Handles a tile dropped onto a folder row that takes it. */
  folderDrop?: (folder: string, path: string) => void;
}

/**
 * Project panel: folder tree on the left; on the right the selected folder's
 * subfolders, then its compatible files with thumbnails; a search box over the
 * whole project.
 */
export class PanelProject extends PanelFloating {
  private readonly handlers: PanelProjectHandlers;
  private readonly searchInput: HTMLInputElement;
  private readonly openButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly label: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly noticeMain: HTMLElement;
  private readonly noticeLocal: HTMLElement;
  /** Folder row under the pointer or keyboard focus, or null. */
  private hoverFolder: string | null = null;
  private readonly tree: FolderTree<PanelProjectFolderRow>;
  private readonly grid: HTMLElement;
  private readonly gridHost: HTMLElement;
  private readonly scrollbars: { scroller: HTMLElement; binding: VirtualListScrollbarBinding; padding: number }[] = [];
  private scrollObserver: ResizeObserver | null = null;
  private thumbnails: ThumbnailGrid | null = null;
  private readonly statusLabel: HTMLElement;
  private state: PanelProjectState;
  private folder: string;
  private selectedPath: string | null;
  private menu: MenuContext | null = null;

  /**
   * Creates the project panel attached to the host element.
   *
   * @param host Parent element (editor root).
   * @param handlers User action callbacks.
   * @param defaultAnchor Element used for the default open position.
   */
  constructor(host: HTMLElement, handlers: PanelProjectHandlers, defaultAnchor: HTMLElement | null = null) {
    panelProjectStylesheetEnsure();
    super(host, { corner: 'bottom-left' }, defaultAnchor);
    this.handlers = handlers;
    this.searchInput = document.createElement('input');
    this.openButton = document.createElement('button');
    this.closeButton = document.createElement('button');
    this.label = panelProjectDiv('label');
    this.notice = panelProjectDiv('notice');
    this.noticeMain = panelProjectDiv('notice-text');
    this.noticeLocal = panelProjectDiv('notice-text');
    // Both texts share one cell, so switching between them keeps the height.
    this.notice.append(this.noticeMain, this.noticeLocal);
    this.tree = this.treeCreate();
    this.grid = panelProjectDiv('grid');
    this.gridHost = panelProjectDiv('grid-host');
    this.statusLabel = panelProjectDiv('status');
    this.state = {
      name: null,
      pending: null,
      snapshot: projectSnapshotEmpty(),
      notice: null,
      watchMode: 'none',
      writable: false,
    };
    this.folder = '';
    this.selectedPath = null;
    this.populateRoot();
    this.scrollbarsBind();
    this.render(this.state);
  }

  /**
   * Shows a new project state; keeps the selected folder when it still exists.
   *
   * @param state Project state.
   */
  render(state: PanelProjectState): void {
    this.state = state;
    if (!panelProjectFolderExists(state.snapshot, this.folder)) this.folder = '';
    this.buttonsRender();
    this.label.textContent = panelProjectLabelText(state);
    this.noticeMain.textContent = state.notice ?? '';
    this.noticeLocal.textContent = state.noticeLocal?.text ?? '';
    this.notice.style.display = state.notice ? '' : 'none';
    this.noticeRender();
    this.treeRender();
    this.gridRender();
  }

  /**
   * Shows a status line message.
   *
   * @param message Status text.
   */
  setStatusMessage(message: string): void {
    this.statusLabel.textContent = message;
  }

  /** Fills in thumbnails that finished loading since the last render. */
  thumbnailsRefresh(): void {
    this.grid.querySelectorAll<HTMLElement>('[data-file-path]').forEach((tile) => {
      const record = this.state.snapshot.files.get(tile.dataset['filePath'] ?? '');
      const thumb = tile.firstElementChild as HTMLElement | null;
      if (!record || !thumb || !PANEL_PROJECT_PREVIEW_KINDS.has(record.kind)) return;
      this.thumbShow(thumb, record);
    });
    this.thumbnails?.draw();
  }

  /**
   * Returns the selected folder path (for tests).
   *
   * @returns Folder path, empty for the root.
   */
  folderSelected(): string {
    return this.folder;
  }

  /**
   * Selects a folder and shows its files.
   *
   * @param path Folder path, empty for the root.
   */
  folderSelect(path: string): void {
    this.folder = path;
    this.searchInput.value = '';
    this.noticeRender();
    this.treeRender();
    this.gridRender();
  }

  /**
   * Shows the Local notice while the hovered, else the selected, folder is the
   * Local one (or inside it), and the room notice otherwise.
   */
  private noticeRender(): void {
    const local = this.state.noticeLocal?.folder;
    const focus = this.hoverFolder ?? this.folder;
    const inLocal = local !== undefined && (focus === local || focus.startsWith(`${local}/`));
    this.notice.dataset['notice'] = inLocal ? 'local' : 'room';
    this.noticeMain.style.visibility = inLocal ? 'hidden' : '';
    this.noticeLocal.style.visibility = inLocal ? '' : 'hidden';
  }

  /**
   * Follows the folder row under the pointer or keyboard focus.
   *
   * @param event Pointer or focus event inside the tree.
   */
  private folderHover(event: Event): void {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-folder-path]') : null;
    const folder = row?.dataset['folderPath'] ?? null;
    if (folder === this.hoverFolder) return;
    this.hoverFolder = folder;
    this.noticeRender();
  }

  /**
   * Sets the search text and refreshes the grid (also used by tests).
   *
   * @param query Search text.
   */
  searchSet(query: string): void {
    this.searchInput.value = query;
    this.gridRender();
  }

  /** Closes the tile menu and removes the panel. */
  override dispose(): void {
    this.menu?.dispose();
    this.menu = null;
    this.scrollObserver?.disconnect();
    this.thumbnails?.dispose();
    this.tree.dispose();
    this.scrollbars.forEach(({ binding }) => binding.dispose());
    super.dispose();
  }

  /** Fills the floating panel with the project panel chrome. */
  private populateRoot(): void {
    this.root.classList.add(PANEL_PROJECT_CLASS);
    applyFloatingPanelToolChrome(this.root, {
      width: `${PANEL_PROJECT_DEFAULT_WIDTH_PX}px`,
      height: `${PANEL_PROJECT_DEFAULT_HEIGHT_PX}px`,
      minWidth: '300px',
      minHeight: '220px',
      borderBox: true,
      overflowHidden: true,
    });
    const title = this.createStandardTitleBar({ titleText: 'Project', monospaceTitle: true, flexShrinkZero: true });
    const body = panelProjectDiv('body');
    this.gridHost.append(this.grid);
    body.append(this.tree.host, this.gridHost);
    const scroller = this.tree.scroller;
    for (const type of ['mouseover', 'focusin'] as const) scroller.addEventListener(type, (e) => this.folderHover(e));
    for (const type of ['mouseleave', 'focusout'] as const)
      scroller.addEventListener(type, () => this.folderHover(new Event(type)));
    this.root.append(title.bar, this.buildToolbarRow(), this.label, this.notice, body, this.statusLabel);
    this.root.appendChild(this.buildResizeGrip());
  }

  /**
   * Creates the folder tree: rows show their file counts and take dropped
   * tiles.
   *
   * @returns Folder tree.
   */
  private treeCreate(): FolderTree<PanelProjectFolderRow> {
    const tree = new FolderTree<PanelProjectFolderRow>({
      onSelect: (path) => this.folderSelect(path),
      rowTitle: panelProjectFolderTitle,
      rowCount: (row) => row.fileCount,
      rowBind: (element, row) => this.folderDropBind(element, row.path),
    });
    tree.host.classList.add(`${PANEL_PROJECT_CLASS}-tree-host`);
    return tree;
  }

  /**
   * Puts the outliner's custom scrollbar on the file grid (the same one the
   * texture browser and the folder tree use), and keeps the grid's columns and
   * thumbnails on whole pixels.
   */
  private scrollbarsBind(): void {
    virtualListScrollbarBindStylesEnsure();
    this.grid.classList.add(VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS);
    const binding = virtualListScrollbarBind(this.gridHost, this.grid, PANEL_PROJECT_GRID_STEP_PX);
    this.scrollbars.push({ scroller: this.grid, binding, padding: PANEL_PROJECT_GRID_PADDING_PX });
    this.scrollObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.scrollLayout());
    this.scrollObserver?.observe(this.grid);
    this.thumbnails = new ThumbnailGrid(this.grid, {
      minColumnPx: PANEL_PROJECT_TILE_MIN_PX,
      gapPx: PANEL_PROJECT_TILE_GAP_PX,
      tileChromePx: PANEL_PROJECT_TILE_CHROME_PX,
    });
  }

  /** Reserves the scrollbar gutters while content overflows, and syncs the bars. */
  private scrollLayout(): void {
    for (const { scroller, binding, padding } of this.scrollbars)
      virtualListScrollbarGutterSync(scroller, binding, padding);
  }

  /**
   * Builds the row with the search box and project buttons.
   *
   * @returns Row element.
   */
  private buildToolbarRow(): HTMLElement {
    const row = panelProjectDiv('row');
    this.searchInput.type = 'search';
    this.searchInput.className = `${PANEL_PROJECT_CLASS}-search`;
    this.searchInput.placeholder = 'Search project';
    this.searchInput.setAttribute('aria-label', 'Search project');
    this.searchInput.addEventListener('input', () => this.gridRender());
    this.searchInput.addEventListener('keydown', (event) => event.stopPropagation());
    panelProjectButton(this.openButton, 'Open Project Folder…', () => this.openClicked());
    panelProjectButton(this.closeButton, 'Close Project', () => this.handlers.onClose());
    row.append(this.searchInput, this.openButton, this.closeButton);
    return row;
  }

  /**
   * Builds the southeast resize grip.
   *
   * @returns Grip element.
   */
  private buildResizeGrip(): HTMLElement {
    return createFloatingPanelResizeGrip(this.root, {
      minWidth: 300,
      minHeight: 220,
      place: (left, top) => this.setTopLeftPosition(left, top),
      done: () => this.clampToScreen(),
    });
  }

  /** Opens or reopens depending on whether a remembered project waits. */
  private openClicked(): void {
    if (this.state.pending !== null) this.handlers.onReopen();
    else this.handlers.onOpen();
  }

  /** Updates the open and close button labels and visibility. */
  private buttonsRender(): void {
    const { name, pending, room } = this.state;
    this.root.dataset['projectRoom'] = room ? 'true' : 'false';
    this.openButton.textContent = pending !== null ? `Reopen "${pending}"` : 'Open Project Folder…';
    this.openButton.setAttribute('aria-label', pending !== null ? 'Reopen Project Folder' : 'Open Project Folder');
    this.openButton.style.display = name === null && !room ? '' : 'none';
    this.closeButton.style.display = name === null || room ? 'none' : '';
  }

  /** Shows the project's folders in the tree. */
  private treeRender(): void {
    if (this.state.name === null) {
      this.tree.render([], null);
      this.tree.host.style.display = 'none';
      return;
    }
    this.tree.host.style.display = '';
    const selected = this.searchInput.value === '' ? this.folder : null;
    this.tree.render(panelProjectFolderRows(this.state.snapshot, this.state.name), selected);
  }

  /**
   * Lets tiles be dropped onto a folder row that takes them.
   *
   * @param row Folder row.
   * @param path Folder path.
   */
  private folderDropBind(row: HTMLElement, path: string): void {
    const accepts = (event: DragEvent) =>
      event.dataTransfer?.types.includes(PANEL_PROJECT_PATH_DRAG_TYPE) === true &&
      this.handlers.folderDropAccepts?.(path) === true;
    row.addEventListener('dragover', (event) => {
      if (!accepts(event)) return;
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'copy';
      row.dataset['drop'] = 'true';
    });
    row.addEventListener('dragleave', () => delete row.dataset['drop']);
    row.addEventListener('drop', (event) => {
      delete row.dataset['drop'];
      if (!accepts(event)) return;
      event.preventDefault();
      const dragged = event.dataTransfer!.getData(PANEL_PROJECT_PATH_DRAG_TYPE);
      if (dragged) this.handlers.folderDrop?.(path, dragged);
    });
  }

  /**
   * Rebuilds the grid: the folder's subfolders, then its files, or search
   * matches.
   */
  private gridRender(): void {
    if (this.state.name === null) return this.gridEmpty(panelProjectEmptyText(this.state));
    const query = this.searchInput.value;
    const folders = query.trim() === '' ? this.gridFolderRows() : [];
    const list = panelProjectFiles(this.state.snapshot, this.folder, query);
    if (list.total === 0 && folders.length === 0)
      return this.gridEmpty(panelProjectNoFilesText(this.state, this.folder, query));
    const scroll = this.grid.scrollTop;
    const folderTiles = folders.map((row) => this.folderTileElement(row));
    this.grid.replaceChildren(...folderTiles, ...list.files.map((record) => this.tileElement(record)));
    this.grid.scrollTop = scroll;
    this.scrollLayout();
    this.thumbnails?.draw();
    this.statusLabel.textContent = this.gridStatusText(folders.length, list.total, list.files.length);
  }

  /**
   * Returns the subfolders of the selected folder. In a room the root lists
   * Curves only once it holds curves, so an empty room shows the hint that the
   * owner's textures are on their way.
   *
   * @returns Subfolder rows in tree order.
   */
  private gridFolderRows(): PanelProjectFolderRow[] {
    const rows = panelProjectFolderRows(this.state.snapshot, this.state.name ?? '');
    const children = panelProjectFolderChildRows(rows, this.folder);
    if (!this.state.room || this.folder !== '') return children;
    return children.filter((row) => row.depth > 0 || panelProjectFolderHoldsFiles(rows, row));
  }

  /**
   * Describes what the grid shows.
   *
   * @param folderCount Folder tiles shown.
   * @param fileTotal Files that matched.
   * @param fileShown Files shown.
   * @returns Status line text.
   */
  private gridStatusText(folderCount: number, fileTotal: number, fileShown: number): string {
    const folders = folderCount > 0 ? `${textCount(folderCount, 'folder')} · ` : '';
    const shown = fileTotal > fileShown ? ` (showing ${fileShown}, refine the search)` : '';
    return `${folders}${textCount(fileTotal, 'file')}${shown} · ${this.state.snapshot.files.size} in project`;
  }

  /**
   * Creates one folder tile: opens the folder on double-click or Enter and
   * takes dropped tiles like its tree row.
   *
   * @param row Subfolder row.
   * @returns Tile element.
   */
  private folderTileElement(row: PanelProjectFolderRow): HTMLElement {
    const tile = panelProjectDiv('tile');
    tile.dataset['folderTile'] = row.path;
    tile.setAttribute('role', 'option');
    tile.setAttribute('aria-label', `Folder ${row.name}`);
    tile.setAttribute('aria-selected', row.path === this.selectedPath ? 'true' : 'false');
    tile.tabIndex = 0;
    tile.title = panelProjectFolderTitle(row);
    const name = panelProjectDiv('name');
    name.textContent = row.name;
    tile.append(panelProjectFolderThumb(), name);
    tile.addEventListener('click', () => this.tileSelect(row.path));
    tile.addEventListener('dblclick', () => this.folderOpen(row.path));
    tile.addEventListener('keydown', (event) => event.key === 'Enter' && this.folderOpen(row.path));
    this.folderDropBind(tile, row.path);
    return tile;
  }

  /**
   * Opens a folder from its tile: selects it and reveals it in the tree.
   *
   * @param path Folder path.
   */
  private folderOpen(path: string): void {
    this.folderSelect(path);
    this.tree.reveal(path);
    this.tree.selectedScrollIntoView();
  }

  /**
   * Shows a message instead of files.
   *
   * @param text Message.
   */
  private gridEmpty(text: string): void {
    const empty = panelProjectDiv('empty');
    empty.textContent = text;
    this.grid.replaceChildren(empty);
    this.scrollLayout();
    this.statusLabel.textContent = this.state.name === null ? 'No project open' : '0 files';
  }

  /**
   * Creates one file tile.
   *
   * @param record File record.
   * @returns Tile element.
   */
  private tileElement(record: ProjectFileRecord): HTMLElement {
    const tile = panelProjectDiv('tile');
    tile.dataset['filePath'] = record.path;
    tile.setAttribute('role', 'option');
    tile.setAttribute('aria-label', record.path);
    tile.setAttribute('aria-selected', record.path === this.selectedPath ? 'true' : 'false');
    tile.tabIndex = 0;
    tile.title = `${record.path}\n${panelProjectSizeText(record.size)} · ${new Date(record.lastModified).toLocaleString()}`;
    const name = panelProjectDiv('name');
    name.textContent = record.name;
    tile.append(this.thumbElement(record), name);
    tile.addEventListener('click', () => this.tileSelect(record.path));
    panelProjectTileDragBind(tile, record.path);
    tile.addEventListener('dblclick', () => this.handlers.onActivate(record));
    tile.addEventListener('keydown', (event) => event.key === 'Enter' && this.handlers.onActivate(record));
    tile.addEventListener('contextmenu', (event) => this.tileMenu(event, record));
    return tile;
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
    this.tileSelect(record.path);
    this.menu?.dispose();
    this.menu = new MenuContext(this.root, items);
    this.menu.show(event.clientX, event.clientY);
  }

  /**
   * Creates the thumbnail or kind badge of a tile.
   *
   * @param record File record.
   * @returns Thumbnail element.
   */
  private thumbElement(record: ProjectFileRecord): HTMLElement {
    // The texture browser's thumbnail: textures fill it, drawn curves fit inside.
    const thumb = thumbnailGridThumbCreate(
      `${PANEL_PROJECT_CLASS}-thumb`,
      null,
      record.kind === 'texture' ? 'cover' : 'contain',
    );
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

  /**
   * Highlights one tile.
   *
   * @param path File or folder path.
   */
  private tileSelect(path: string): void {
    this.selectedPath = path;
    this.grid.querySelectorAll<HTMLElement>('[data-file-path], [data-folder-tile]').forEach((tile) => {
      const tilePath = tile.dataset['filePath'] ?? tile.dataset['folderTile'];
      tile.setAttribute('aria-selected', tilePath === path ? 'true' : 'false');
    });
  }
}

/**
 * Returns the tooltip of a folder row: what a virtual root holds, else the
 * folder path (the name for the root).
 *
 * @param row Folder row.
 * @returns Tooltip.
 */
function panelProjectFolderTitle({ path, name }: PanelProjectFolderRow): string {
  if (path === PANEL_PROJECT_VIRTUAL_CURVES) return 'Saved curves (stored in AiWorldEd/Curves)';
  return path.startsWith('//') ? name : path || name;
}

/**
 * Creates the thumbnail of a folder tile: the folder tree's closed folder,
 * drawn large.
 *
 * @returns Thumbnail element.
 */
function panelProjectFolderThumb(): HTMLElement {
  const thumb = thumbnailGridThumbCreate(`${PANEL_PROJECT_CLASS}-thumb`, null, 'contain');
  thumb.dataset['kind'] = 'folder';
  thumb.innerHTML = IconFolderTree.closed();
  return thumb;
}

/**
 * Creates a div with a project panel class.
 *
 * @param part Class suffix.
 * @returns Element.
 */
function panelProjectDiv(part: string): HTMLElement {
  const element = document.createElement('div');
  element.className = `${PANEL_PROJECT_CLASS}-${part}`;
  return element;
}

/**
 * Prepares a chrome button.
 *
 * @param button Button element.
 * @param text Label.
 * @param onClick Click handler.
 */
function panelProjectButton(button: HTMLButtonElement, text: string, onClick: () => void): void {
  button.type = 'button';
  button.textContent = text;
  button.setAttribute('aria-label', text);
  styleFloatingPanelChromeButton(button);
  button.style.padding = '4px 10px';
  button.style.whiteSpace = 'nowrap';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
}

/**
 * Describes the open project and how it is watched.
 *
 * @param state Project state.
 * @returns Label text.
 */
function panelProjectLabelText(state: PanelProjectState): string {
  if (state.room) return `Room project (${state.name ?? 'owner'}) · read-only, provided by the room owner`;
  if (state.name === null) return state.pending !== null ? `Last project: ${state.pending}` : 'No project open';
  const watch = { observer: 'live (file system observer)', poll: 'live (polling)', none: 'not watched' }[
    state.watchMode
  ];
  const truncated = state.snapshot.truncated ? ' · folder too large, list truncated' : '';
  return `Project: ${state.name} · ${watch}${state.writable ? '' : ' · read-only'}${truncated}`;
}

/**
 * Explains an empty file list.
 *
 * @param state Project state.
 * @param folder Selected folder.
 * @param query Search text.
 * @returns Message.
 */
function panelProjectNoFilesText(state: PanelProjectState, folder: string, query: string): string {
  if (query.trim()) return 'No matching files';
  if (folder === PANEL_PROJECT_VIRTUAL_CURVES || folder.startsWith(`${PANEL_PROJECT_VIRTUAL_CURVES}/`))
    return 'No curves saved here yet';
  return state.room ? "The room owner's textures appear here as they arrive" : 'No files here';
}

/**
 * Explains what to do while no project is open.
 *
 * @param state Project state.
 * @returns Message.
 */
function panelProjectEmptyText(state: PanelProjectState): string {
  if (state.pending !== null) return `Click "Reopen" to grant access to "${state.pending}" again`;
  return 'Open a project folder to browse its textures, scenes and models';
}
