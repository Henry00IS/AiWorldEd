import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { createFloatingPanelResizeGrip } from '@/ui/floating_panel/panel_floating_resize.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';
import { styleFloatingPanelChromeButton } from '@/ui/floating_panel/panel_floating_title_bar.js';
import type { ProjectFileRecord, ProjectSnapshot } from '@/project/scan/project_snapshot.js';
import { projectSnapshotEmpty } from '@/project/scan/project_snapshot.js';
import type { ProjectFileSystemWatchMode } from '@/project/fs/project_file_system.js';
import { PANEL_PROJECT_CLASS, panelProjectStylesheetEnsure } from './panel_project_styles.js';
import { panelProjectFiles, panelProjectFolderRows, panelProjectSizeText } from './panel_project_view.js';

/** Default outer width of the project panel in pixels. */
export const PANEL_PROJECT_DEFAULT_WIDTH_PX = 560;

/** Default outer height of the project panel in pixels. */
export const PANEL_PROJECT_DEFAULT_HEIGHT_PX = 380;

/** Labels shown on file tiles that have no image preview. */
const PANEL_PROJECT_KIND_LABELS: Readonly<Record<string, string>> = { scene: 'JSON', vmf: 'VMF', obj: 'OBJ' };

/** Everything the project panel shows. */
export interface PanelProjectState {
  name: string | null;
  pending: string | null;
  snapshot: ProjectSnapshot;
  notice: string | null;
  watchMode: ProjectFileSystemWatchMode;
  writable: boolean;
}

/** Callbacks the project panel uses for user actions. */
export interface PanelProjectHandlers {
  onOpen: () => void;
  onReopen: () => void;
  onClose: () => void;
  onActivate: (record: ProjectFileRecord) => void;
  thumbnail: (record: ProjectFileRecord) => string | null;
}

/**
 * Unity-style project panel: folder tree on the left, compatible files with
 * thumbnails on the right, a search box over the whole project.
 */
export class PanelProject extends PanelFloating {
  private readonly handlers: PanelProjectHandlers;
  private readonly searchInput: HTMLInputElement;
  private readonly openButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly label: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly tree: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly statusLabel: HTMLElement;
  private state: PanelProjectState;
  private folder: string;
  private selectedPath: string | null;

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
    this.tree = panelProjectDiv('tree');
    this.grid = panelProjectDiv('grid');
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
    this.render(this.state);
  }

  /**
   * Shows a new project state; keeps the selected folder when it still exists.
   *
   * @param state Project state.
   */
  render(state: PanelProjectState): void {
    this.state = state;
    if (!state.snapshot.directories.has(this.folder)) this.folder = '';
    this.buttonsRender();
    this.label.textContent = panelProjectLabelText(state);
    this.notice.textContent = state.notice ?? '';
    this.notice.style.display = state.notice ? '' : 'none';
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
      if (!record || !thumb || record.kind !== 'texture') return;
      const url = this.handlers.thumbnail(record);
      thumb.style.backgroundImage = url ? panelProjectCssUrl(url) : '';
      thumb.textContent = url ? '' : '…';
    });
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
    this.treeRender();
    this.gridRender();
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
    body.append(this.tree, this.grid);
    this.root.append(title.bar, this.buildToolbarRow(), this.label, this.notice, body, this.statusLabel);
    this.root.appendChild(this.buildResizeGrip());
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
    panelProjectButton(this.openButton, 'Open project folder…', () => this.openClicked());
    panelProjectButton(this.closeButton, 'Close project', () => this.handlers.onClose());
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
    const { name, pending } = this.state;
    this.openButton.textContent = pending !== null ? `Reopen "${pending}"` : 'Open project folder…';
    this.openButton.setAttribute('aria-label', pending !== null ? 'Reopen project folder' : 'Open project folder');
    this.openButton.style.display = name === null ? '' : 'none';
    this.closeButton.style.display = name === null ? 'none' : '';
  }

  /** Rebuilds the folder tree. */
  private treeRender(): void {
    if (this.state.name === null) {
      this.tree.replaceChildren();
      this.tree.style.display = 'none';
      return;
    }
    this.tree.style.display = '';
    const rows = panelProjectFolderRows(this.state.snapshot, this.state.name);
    this.tree.replaceChildren(...rows.map((row) => this.folderElement(row.path, row.name, row.depth, row.fileCount)));
  }

  /**
   * Creates one folder row.
   *
   * @param path Folder path.
   * @param name Display name.
   * @param depth Nesting depth.
   * @param fileCount Files directly inside.
   * @returns Row element.
   */
  private folderElement(path: string, name: string, depth: number, fileCount: number): HTMLElement {
    const row = panelProjectDiv('folder');
    row.dataset['folderPath'] = path;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-selected', path === this.folder && this.searchInput.value === '' ? 'true' : 'false');
    row.style.paddingLeft = `${8 + depth * 12}px`;
    row.title = path || name;
    row.textContent = `${depth === 0 ? '▣' : '▸'} ${name}`;
    const count = document.createElement('span');
    count.className = `${PANEL_PROJECT_CLASS}-count`;
    count.textContent = fileCount > 0 ? String(fileCount) : '';
    row.appendChild(count);
    row.addEventListener('click', () => this.folderSelect(path));
    return row;
  }

  /** Rebuilds the file grid for the folder or search. */
  private gridRender(): void {
    if (this.state.name === null) return this.gridEmpty(panelProjectEmptyText(this.state));
    const list = panelProjectFiles(this.state.snapshot, this.folder, this.searchInput.value);
    if (list.total === 0) return this.gridEmpty(this.searchInput.value.trim() ? 'No matching files' : 'No files here');
    const scroll = this.grid.scrollTop;
    this.grid.replaceChildren(...list.files.map((record) => this.tileElement(record)));
    this.grid.scrollTop = scroll;
    const shown = list.total > list.files.length ? ` (showing ${list.files.length}, refine the search)` : '';
    this.statusLabel.textContent = `${list.total} file(s)${shown} · ${this.state.snapshot.files.size} in project`;
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
    this.statusLabel.textContent = this.state.name === null ? 'No project open' : '0 file(s)';
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
    tile.addEventListener('dblclick', () => this.handlers.onActivate(record));
    tile.addEventListener('keydown', (event) => event.key === 'Enter' && this.handlers.onActivate(record));
    return tile;
  }

  /**
   * Creates the thumbnail or kind badge of a tile.
   *
   * @param record File record.
   * @returns Thumbnail element.
   */
  private thumbElement(record: ProjectFileRecord): HTMLElement {
    const thumb = panelProjectDiv('thumb');
    thumb.dataset['kind'] = record.kind;
    const url = record.kind === 'texture' ? this.handlers.thumbnail(record) : null;
    if (url) thumb.style.backgroundImage = panelProjectCssUrl(url);
    else thumb.textContent = PANEL_PROJECT_KIND_LABELS[record.kind] ?? '…';
    return thumb;
  }

  /**
   * Highlights one tile.
   *
   * @param path File path.
   */
  private tileSelect(path: string): void {
    this.selectedPath = path;
    this.grid.querySelectorAll<HTMLElement>('[data-file-path]').forEach((tile) => {
      tile.setAttribute('aria-selected', tile.dataset['filePath'] === path ? 'true' : 'false');
    });
  }
}

/**
 * Quotes a URL for a CSS background image.
 *
 * @param url Image URL.
 * @returns CSS url() value.
 */
function panelProjectCssUrl(url: string): string {
  return `url("${url.replace(/["\\]/g, '\\$&')}")`;
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
  if (state.name === null) return state.pending !== null ? `Last project: ${state.pending}` : 'No project open';
  const watch = { observer: 'live (file system observer)', poll: 'live (polling)', none: 'not watched' }[
    state.watchMode
  ];
  const truncated = state.snapshot.truncated ? ' · folder too large, list truncated' : '';
  return `Project: ${state.name} · ${watch}${state.writable ? '' : ' · read-only'}${truncated}`;
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
