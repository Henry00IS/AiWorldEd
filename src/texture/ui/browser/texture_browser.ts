import { textCount } from '@/utils/utils_plural.js';
import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { styleFloatingPanelStatusBar } from '@/ui/floating_panel/panel_floating_status_bar.js';
import { createFloatingPanelResizeGrip } from '@/ui/floating_panel/panel_floating_resize.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';
import { styleFloatingPanelChromeButton } from '@/ui/floating_panel/panel_floating_title_bar.js';
import { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { MISSING_TEXTURE_CSS_BACKGROUND } from '@/texture/library/factory_missing_texture.js';
import {
  TEXTURE_BROWSER_GRID_CLASS,
  TEXTURE_BROWSER_NAME_CLASS,
  TEXTURE_BROWSER_ROOT_CLASS,
  TEXTURE_BROWSER_THUMB_CLASS,
  TEXTURE_BROWSER_MIN_TRACK_PX,
  TEXTURE_BROWSER_TILE_CLASS,
  ensureTextureBrowserStylesheet,
} from './texture_browser_styles.js';
import { TEXTURE_BROWSER_TILE_CHROME_PX, TEXTURE_BROWSER_TILE_GAP_PX } from './texture_browser_layout.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';
import { ThumbnailGrid, thumbnailGridThumbCreate } from '@/ui/thumbnail_grid/thumbnail_grid.js';
import {
  VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS,
  virtualListScrollbarBind,
  virtualListScrollbarBindStylesEnsure,
  virtualListScrollbarGutterSync,
  type VirtualListScrollbarBinding,
} from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';

/** Default outer width of the texture browser panel in pixels. */
export const TEXTURE_BROWSER_DEFAULT_WIDTH_PX = 480;

/** Default outer height of the texture browser panel in pixels. */
export const TEXTURE_BROWSER_DEFAULT_HEIGHT_PX = 560;

/** Minimum outer width when resizing the panel. */
export const TEXTURE_BROWSER_MIN_WIDTH_PX = 280;

/** Minimum outer height when resizing the panel. */
export const TEXTURE_BROWSER_MIN_HEIGHT_PX = 240;

/** Height shared by the search box and the toolbar buttons. */
export const TEXTURE_BROWSER_TOOLBAR_CONTROL_HEIGHT_PX = 24;

/** Arrow step of the grid scrollbar in CSS pixels. */
const TEXTURE_BROWSER_SCROLL_STEP_PX = 24;

/** Horizontal padding of the grid in CSS pixels. */
const TEXTURE_BROWSER_GRID_PADDING_PX = 10;

/** A tile that was in view before a rebuild and where it sat in the viewport. */
interface TextureBrowserScrollAnchor {
  id: string;
  offset: number;
}

/**
 * Where textures come from: no project yet, the open project, or the room
 * owner.
 */
export type TextureBrowserSource = 'none' | 'project' | 'remote';

/** Why a room member cannot add textures, shown on the source label. */
export const TEXTURE_BROWSER_ROOM_TOOLTIP =
  "In a room only the room owner's textures are used; members cannot add textures. Send a texture to the owner another way (for example in chat), and faces using it update once the owner adds it.";

/** Callbacks the texture browser panel uses for user actions. */
export interface TextureBrowserHandlers {
  onOpenProject: () => void;
  onSelectTexture: (entryId: string) => void;
  /** Turns listing of imported (embedded) textures on or off. */
  onShowImportedChange?: (show: boolean) => void;
}

/**
 * Floating texture browser with a grid of texture tiles. Tiles come from the
 * shared thumbnail grid: whole-pixel columns, thumbnails drawn at device
 * resolution. Placement and windowing come from {@link FloatingPanel}.
 */
export class TextureBrowser extends PanelFloating {
  private handlers: TextureBrowserHandlers;
  private gridElement: HTMLElement;
  private statusLabel: HTMLElement;
  private folderLabel: HTMLElement;
  private openButton: HTMLButtonElement;
  private searchInput: HTMLInputElement;
  private showImportedButton: HTMLButtonElement;
  private showImported: boolean;
  private source: TextureBrowserSource;
  private selectedId: string | null;
  private tileElements: Map<string, HTMLElement>;
  private gridHost: HTMLElement;
  private scrollbar: VirtualListScrollbarBinding | null;
  private scrollObserver: ResizeObserver | null;
  private thumbnails: ThumbnailGrid | null = null;
  private anchorsKept: TextureBrowserScrollAnchor[] | null;
  private scrollSet: number;
  private restoring: boolean;

  /**
   * Creates a texture browser attached to the host element.
   *
   * @param host Parent element (editor root).
   * @param handlers Open-project and select callbacks.
   * @param defaultAnchor Element used for default open position.
   */
  constructor(host: HTMLElement, handlers: TextureBrowserHandlers, defaultAnchor: HTMLElement | null = null) {
    ensureTextureBrowserStylesheet();
    super(host, { corner: 'bottom-right' }, defaultAnchor);
    this.handlers = handlers;
    this.selectedId = null;
    this.tileElements = new Map();
    this.gridElement = document.createElement('div');
    this.gridHost = document.createElement('div');
    this.scrollbar = null;
    this.scrollObserver = null;
    this.anchorsKept = null;
    this.scrollSet = -1;
    this.restoring = false;
    this.statusLabel = document.createElement('div');
    this.folderLabel = document.createElement('div');
    this.openButton = document.createElement('button');
    this.searchInput = document.createElement('input');
    this.showImportedButton = document.createElement('button');
    this.showImported = false;
    this.source = 'none';
    this.populateRoot();
    this.scrollbarBind();
    this.thumbnails = new ThumbnailGrid(this.gridElement, {
      minColumnPx: TEXTURE_BROWSER_MIN_TRACK_PX,
      gapPx: TEXTURE_BROWSER_TILE_GAP_PX,
      tileChromePx: TEXTURE_BROWSER_TILE_CHROME_PX,
    });
    this.setEmptyState();
  }

  /**
   * Returns the scrollable grid element (for tests).
   *
   * @returns Grid HTML element.
   */
  getGridElement(): HTMLElement {
    return this.gridElement;
  }

  /**
   * Rebuilds the grid from texture entries.
   *
   * @param entries Textures to show.
   * @param selectedId Currently selected entry id, or null.
   * @param folderName Opened folder name, or null.
   * @param missingIds Texture ids the level uses whose files are missing;
   *   listed last, in pink.
   *
   *   The tiles in view stay in view: the first one still listed keeps its place,
   *   so listing or hiding textures above it does not move the grid.
   */
  setEntries(
    entries: TextureBrowserEntry[],
    selectedId: string | null,
    folderName: string | null,
    missingIds: readonly string[] = [],
  ): void {
    const scrollTop = this.gridElement.scrollTop;
    // The tiles the user scrolled to, even when a shorter list made the browser clamp the offset since.
    const anchors =
      this.anchorsKept !== null && Math.abs(scrollTop - this.scrollSet) <= 1 ? this.anchorsKept : this.scrollAnchors();
    this.restoring = true;
    this.selectedId = selectedId;
    this.tileElements.clear();
    this.gridElement.replaceChildren();
    this.updateFolderLabel(folderName);
    if (entries.length + missingIds.length === 0) {
      this.setEmptyState();
      this.scrollLayout();
      this.scrollKeep(anchors);
      return;
    }
    entries.forEach((entry) => this.appendTile(entry));
    this.missingAppend(missingIds);
    this.filterApply();
    const missing = missingIds.length > 0 ? ` · ${missingIds.length} missing` : '';
    this.statusLabel.textContent = `${textCount(entries.length, 'texture')}${missing}`;
    this.gridElement.scrollTop = scrollTop;
    this.scrollRestore(anchors);
    this.scrollLayout();
    this.scrollKeep(anchors);
    this.thumbnails?.draw();
  }

  /**
   * Keeps the anchors until the user scrolls, so a later rebuild (for example
   * listing imported textures again) returns to them after an offset the
   * browser had to clamp.
   *
   * @param anchors Anchors used for this rebuild.
   */
  private scrollKeep(anchors: TextureBrowserScrollAnchor[]): void {
    this.anchorsKept = anchors;
    this.scrollSet = this.gridElement.scrollTop;
    this.restoring = false;
  }

  /** Forgets the kept anchors once the user scrolled somewhere else. */
  private scrolled(): void {
    if (!this.restoring && Math.abs(this.gridElement.scrollTop - this.scrollSet) > 1) this.anchorsKept = null;
  }

  /**
   * Shows where textures come from; the open-project button only appears while
   * no project is open.
   *
   * @param source Texture source.
   */
  setSource(source: TextureBrowserSource): void {
    this.source = source;
    this.openButton.style.display = source === 'none' ? '' : 'none';
  }

  /**
   * Shows the "Show Imported" toggle state; the toggle only appears while the
   * project holds imported textures.
   *
   * @param show Whether imported textures are listed.
   * @param importedCount Imported textures in the project.
   */
  setShowImported(show: boolean, importedCount: number): void {
    this.showImported = show;
    const button = this.showImportedButton;
    button.setAttribute('aria-pressed', show ? 'true' : 'false');
    button.style.display = importedCount > 0 || show ? '' : 'none';
    const palette = getActiveUiThemePalette();
    button.style.background = show ? palette.selectionBackground : hexToRgb(Theme.buttonBackground);
    button.style.borderColor = show ? palette.selectionBorderColor : Theme.inputBorderColor;
    button.title = show
      ? `Listing ${textCount(importedCount, 'texture')} imported from models; click to hide ${importedCount === 1 ? 'it' : 'them'}`
      : `Also list the ${textCount(importedCount, 'texture')} imported from models (character skins, props)`;
  }

  /**
   * Returns the shown texture source (for tests).
   *
   * @returns Texture source.
   */
  getSource(): TextureBrowserSource {
    return this.source;
  }

  /**
   * Updates which tile appears selected without rebuilding the grid.
   *
   * @param selectedId Entry id to highlight, or null.
   */
  setSelectedId(selectedId: string | null): void {
    this.selectedId = selectedId;
    this.tileElements.forEach((tile, id) => {
      this.styleTileSelection(tile, id === selectedId);
    });
  }

  /**
   * Sets a status message (loading / error / info).
   *
   * @param message Status text.
   */
  setStatusMessage(message: string): void {
    this.statusLabel.textContent = message;
  }

  /** Disposes tiles, the scrollbar and the shared floating-panel shell. */
  override dispose(): void {
    this.tileElements.clear();
    this.scrollObserver?.disconnect();
    this.thumbnails?.dispose();
    this.scrollbar?.dispose();
    this.scrollbar = null;
    super.dispose();
  }

  /** Puts the outliner's custom scrollbar on the grid. */
  private scrollbarBind(): void {
    virtualListScrollbarBindStylesEnsure();
    this.scrollbar = virtualListScrollbarBind(this.gridHost, this.gridElement, TEXTURE_BROWSER_SCROLL_STEP_PX);
    this.scrollObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.scrollLayout());
    this.scrollObserver?.observe(this.gridElement);
    this.gridElement.addEventListener('scroll', () => this.scrolled());
  }

  /**
   * Reserves the scrollbar gutter while the grid overflows, so the bar never
   * covers a tile, and syncs the bar.
   */
  private scrollLayout(): void {
    virtualListScrollbarGutterSync(this.gridElement, this.scrollbar, TEXTURE_BROWSER_GRID_PADDING_PX);
  }

  /**
   * Lists the shown tiles from the first one in view onwards, with their
   * distance from the top of the viewport.
   *
   * @returns Anchors in grid order.
   */
  private scrollAnchors(): TextureBrowserScrollAnchor[] {
    const top = this.gridElement.getBoundingClientRect().top;
    const anchors: TextureBrowserScrollAnchor[] = [];
    this.tileElements.forEach((tile, id) => {
      if (tile.style.display === 'none') return;
      const rect = tile.getBoundingClientRect();
      if (rect.bottom > top || anchors.length > 0) anchors.push({ id, offset: rect.top - top });
    });
    return anchors;
  }

  /**
   * Scrolls the rebuilt grid so the first anchor tile still shown sits where it
   * was; without one the scroll offset stays (the browser clamps it when the
   * grid got shorter).
   *
   * @param anchors Anchors taken before the rebuild.
   */
  private scrollRestore(anchors: readonly TextureBrowserScrollAnchor[]): void {
    const top = this.gridElement.getBoundingClientRect().top;
    for (const anchor of anchors) {
      const tile = this.tileElements.get(anchor.id);
      if (tile === undefined || tile.style.display === 'none') continue;
      const moved = tile.getBoundingClientRect().top - top - anchor.offset;
      this.gridElement.scrollTop = Math.max(0, this.gridElement.scrollTop + moved);
      return;
    }
  }

  /** Fills the shared floating-panel shell with texture browser chrome. */
  private populateRoot(): void {
    this.root.className = TEXTURE_BROWSER_ROOT_CLASS;
    this.styleRoot(this.root);
    this.root.appendChild(this.buildTitleBar());
    this.root.appendChild(this.buildToolbarRow());
    this.root.appendChild(this.buildFolderLabel());
    this.root.appendChild(this.buildGridHost());
    this.root.appendChild(this.buildStatusLabel());
    this.root.appendChild(this.buildResizeHandle());
  }

  /**
   * Applies chrome styles to the floating panel.
   *
   * @param root Panel root.
   */
  private styleRoot(root: HTMLElement): void {
    applyFloatingPanelToolChrome(root, {
      width: `${TEXTURE_BROWSER_DEFAULT_WIDTH_PX}px`,
      height: `${TEXTURE_BROWSER_DEFAULT_HEIGHT_PX}px`,
      minWidth: `${TEXTURE_BROWSER_MIN_WIDTH_PX}px`,
      minHeight: `${TEXTURE_BROWSER_MIN_HEIGHT_PX}px`,
      borderBox: true,
      overflowHidden: true,
    });
  }

  /**
   * Builds the draggable title bar with close control.
   *
   * @returns Title bar element.
   */
  private buildTitleBar(): HTMLElement {
    const parts = this.createStandardTitleBar({
      titleText: 'Texture Browser',
      monospaceTitle: true,
      flexShrinkZero: true,
    });
    return parts.bar;
  }

  /**
   * Builds the toolbar row with the search box and the open-project button.
   *
   * @returns Toolbar row element.
   */
  private buildToolbarRow(): HTMLElement {
    const row = document.createElement('div');
    this.styleChromeRow(row);
    row.style.padding = '8px 10px 4px';
    row.style.flexShrink = '0';
    row.appendChild(this.buildSearchInput());
    row.appendChild(this.buildShowImportedButton());
    row.appendChild(this.buildOpenButton());
    return row;
  }

  /**
   * Builds the toggle that also lists imported (embedded) textures.
   *
   * @returns Button element.
   */
  private buildShowImportedButton(): HTMLButtonElement {
    const button = this.showImportedButton;
    button.type = 'button';
    button.textContent = 'Show Imported';
    button.setAttribute('aria-label', 'Show Imported');
    button.dataset['textureBrowserShowImported'] = 'true';
    this.styleActionButton(button);
    button.style.flexShrink = '0';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handlers.onShowImportedChange?.(!this.showImported);
    });
    this.setShowImported(false, 0);
    return button;
  }

  /**
   * Builds the name filter.
   *
   * @returns Search input.
   */
  private buildSearchInput(): HTMLInputElement {
    const input = this.searchInput;
    input.type = 'search';
    input.placeholder = 'Search textures';
    input.setAttribute('aria-label', 'Search textures');
    input.style.flex = '1 1 auto';
    input.style.minWidth = '0';
    input.style.font = '11px monospace';
    input.style.padding = '3px 6px';
    input.style.background = hexToRgb(Theme.buttonBackground);
    input.style.color = Theme.buttonTextColor;
    input.style.border = `1px solid ${Theme.inputBorderColor}`;
    input.style.borderRadius = '3px';
    input.style.boxSizing = 'border-box';
    input.style.height = `${TEXTURE_BROWSER_TOOLBAR_CONTROL_HEIGHT_PX}px`;
    input.addEventListener('input', () => this.filterApply());
    input.addEventListener('keydown', (event) => event.stopPropagation());
    return input;
  }

  /**
   * Builds the button that opens a project folder (textures come from it).
   *
   * @returns Button element.
   */
  private buildOpenButton(): HTMLButtonElement {
    const button = this.openButton;
    button.type = 'button';
    button.textContent = 'Open Project Folder…';
    button.title = 'Open a project folder; its images become the textures';
    button.setAttribute('aria-label', 'Open Project Folder');
    this.styleActionButton(button);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handlers.onOpenProject();
    });
    return button;
  }

  /**
   * Hides tiles whose path and name do not contain the search text, and the
   * missing heading when none of its tiles match; says so when nothing
   * matches.
   */
  private filterApply(): void {
    const text = this.searchInput.value.trim();
    const needle = text.toLowerCase();
    this.gridElement.querySelector('[data-search-empty]')?.remove();
    let heading: HTMLElement | null = null;
    let headingShown = false;
    let shown = 0;
    const headingClose = () => {
      if (heading !== null) heading.style.display = headingShown ? '' : 'none';
    };
    for (const child of [...this.gridElement.children] as HTMLElement[]) {
      if (child.dataset['missingHeading'] !== undefined) {
        headingClose();
        heading = child;
        headingShown = false;
        continue;
      }
      const id = child.dataset['entryId'];
      if (id === undefined) continue;
      const name = (child.dataset['entryName'] ?? '').toLowerCase();
      const match = needle === '' || id.toLowerCase().includes(needle) || name.includes(needle);
      child.style.display = match ? '' : 'none';
      if (!match) continue;
      headingShown = true;
      shown += 1;
    }
    headingClose();
    if (shown > 0 || needle === '' || this.tileElements.size === 0) return;
    const empty = document.createElement('div');
    empty.dataset['searchEmpty'] = 'true';
    empty.textContent = `Nothing matches “${text}”`;
    empty.style.cssText = `grid-column:1 / -1;font:11px monospace;padding:12px 2px;color:${Theme.buttonTextColor};opacity:0.75`;
    this.gridElement.appendChild(empty);
  }

  /**
   * Applies shared flex row styles for chrome sections.
   *
   * @param row Row element.
   */
  private styleChromeRow(row: HTMLElement): void {
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.padding = '8px 10px';
    row.style.boxSizing = 'border-box';
  }

  /**
   * Builds the folder name label under the toolbar.
   *
   * @returns Folder label element.
   */
  private buildFolderLabel(): HTMLElement {
    this.folderLabel.style.padding = '0 10px 6px';
    this.folderLabel.style.color = Theme.statusBarTextColor;
    this.folderLabel.style.fontFamily = 'monospace';
    this.folderLabel.style.fontSize = '10px';
    this.folderLabel.style.overflow = 'hidden';
    this.folderLabel.style.textOverflow = 'ellipsis';
    this.folderLabel.style.whiteSpace = 'nowrap';
    this.folderLabel.style.flexShrink = '0';
    this.folderLabel.style.boxSizing = 'border-box';
    return this.folderLabel;
  }

  /**
   * Builds the positioned area holding the grid and its custom scrollbar.
   *
   * @returns Grid host element.
   */
  private buildGridHost(): HTMLElement {
    Object.assign(this.gridHost.style, {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      flex: '1 1 auto',
      minHeight: '0',
    });
    this.gridHost.appendChild(this.buildGrid());
    return this.gridHost;
  }

  /**
   * Builds the scrollable thumbnail grid container; its native scrollbar is
   * hidden under the custom one.
   *
   * @returns Grid element.
   */
  private buildGrid(): HTMLElement {
    this.gridElement.className = `${TEXTURE_BROWSER_GRID_CLASS} ${VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS}`;
    this.gridElement.style.padding = `8px ${TEXTURE_BROWSER_GRID_PADDING_PX}px`;
    this.gridElement.style.flex = '1 1 auto';
    this.gridElement.style.minHeight = '0';
    this.gridElement.setAttribute('role', 'listbox');
    this.gridElement.setAttribute('aria-label', 'Texture browser grid');
    return this.gridElement;
  }

  /**
   * Builds the bottom status label.
   *
   * @returns Status element.
   */
  private buildStatusLabel(): HTMLElement {
    styleFloatingPanelStatusBar(this.statusLabel);
    return this.statusLabel;
  }

  /**
   * Builds the southeast resize grip.
   *
   * @returns Resize handle element.
   */
  private buildResizeHandle(): HTMLElement {
    const handle = createFloatingPanelResizeGrip(this.root, {
      minWidth: TEXTURE_BROWSER_MIN_WIDTH_PX,
      minHeight: TEXTURE_BROWSER_MIN_HEIGHT_PX,
      place: (left, top) => this.setTopLeftPosition(left, top),
      done: () => this.clampToScreen(),
    });
    handle.setAttribute('aria-label', 'Resize browser');
    return handle;
  }

  /**
   * Appends one texture tile to the grid.
   *
   * @param entry Texture entry to display.
   */
  private appendTile(entry: TextureBrowserEntry): void {
    const tile = this.createTile(entry);
    this.tileElements.set(entry.id, tile);
    this.styleTileSelection(tile, entry.id === this.selectedId);
    this.gridElement.appendChild(tile);
  }

  /**
   * Lists the level's missing textures under a heading: pink checker tiles that
   * keep their id, so the level still shows what it uses.
   *
   * @param ids Missing texture ids.
   */
  private missingAppend(ids: readonly string[]): void {
    if (ids.length === 0) return;
    const heading = document.createElement('div');
    heading.dataset['missingHeading'] = 'true';
    heading.textContent = 'Used in the level, missing on disk';
    heading.style.cssText = 'grid-column:1 / -1;font:10px monospace;padding:8px 2px 2px;color:#ff7cff';
    this.gridElement.appendChild(heading);
    ids.forEach((id) => {
      const tile = this.createTile(textureBrowserMissingEntry(id));
      tile.dataset['missing'] = 'true';
      tile.title = `${id}\nMissing: stays assigned and comes back as soon as the file is in the project.`;
      (tile.firstElementChild as HTMLElement).style.background = MISSING_TEXTURE_CSS_BACKGROUND;
      this.tileElements.set(id, tile);
      this.styleTileSelection(tile, id === this.selectedId);
      this.gridElement.appendChild(tile);
    });
  }

  /**
   * Creates a single thumbnail + name tile.
   *
   * @param entry Texture entry.
   * @returns Tile element.
   */
  private createTile(entry: TextureBrowserEntry): HTMLElement {
    const tile = document.createElement('div');
    tile.className = TEXTURE_BROWSER_TILE_CLASS;
    tile.setAttribute('role', 'option');
    tile.setAttribute('aria-label', entry.id);
    tile.tabIndex = 0;
    tile.dataset['entryId'] = entry.id;
    tile.dataset['entryName'] = entry.displayName;
    tile.title =
      entry.displayName === entry.relativePath ? entry.relativePath : `${entry.displayName}\n${entry.relativePath}`;
    tile.style.background = hexToRgb(Theme.buttonBackground);
    tile.style.border = `1px solid ${Theme.inputBorderColor}`;
    tile.style.borderRadius = '4px';
    tile.appendChild(this.createPreviewThumb(entry));
    tile.appendChild(this.createNameLabel(entry.displayName));
    tile.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handlers.onSelectTexture(entry.id);
    });
    tile.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      this.handlers.onSelectTexture(entry.id);
    });
    return tile;
  }

  /**
   * Creates a square preview: the shared thumbnail, drawn at device resolution.
   *
   * @param entry Texture entry with object URL.
   * @returns Thumbnail element.
   */
  private createPreviewThumb(entry: TextureBrowserEntry): HTMLElement {
    const thumb = thumbnailGridThumbCreate(TEXTURE_BROWSER_THUMB_CLASS, entry.previewObjectUrl || null, 'cover');
    thumb.dataset['previewThumb'] = 'true';
    thumb.setAttribute('role', 'img');
    thumb.setAttribute('aria-label', entry.displayName);
    return thumb;
  }

  /**
   * Creates the name label under a thumbnail.
   *
   * @param displayName Texture display name.
   * @returns Name element.
   */
  private createNameLabel(displayName: string): HTMLElement {
    const name = document.createElement('span');
    name.className = TEXTURE_BROWSER_NAME_CLASS;
    name.textContent = displayName;
    name.style.color = Theme.buttonTextColor;
    return name;
  }

  /**
   * Applies selected or idle border styles to a tile.
   *
   * @param tile Tile element.
   * @param selected Whether the tile is selected.
   */
  private styleTileSelection(tile: HTMLElement, selected: boolean): void {
    const palette = getActiveUiThemePalette();
    tile.style.border = selected
      ? `1px solid ${palette.selectionBorderColor}`
      : `1px solid ${palette.controlBorderColor}`;
    tile.style.background = selected ? palette.selectionBackground : palette.controlBackground;
    tile.setAttribute('aria-selected', selected ? 'true' : 'false');
  }

  /**
   * Updates the folder path label.
   *
   * @param folderName Folder name or null.
   */
  private updateFolderLabel(folderName: string | null): void {
    if (this.source === 'remote') this.folderLabel.textContent = 'Textures From the Room Owner';
    else this.folderLabel.textContent = folderName ? `Project: ${folderName}` : 'No project open';
    this.folderLabel.title = this.source === 'remote' ? TEXTURE_BROWSER_ROOM_TOOLTIP : '';
  }

  /** Shows the empty-state message in the grid area. */
  private setEmptyState(): void {
    this.gridElement.replaceChildren();
    this.tileElements.clear();
    const empty = document.createElement('div');
    empty.textContent = 'Open a project folder to browse textures';
    empty.style.gridColumn = '1 / -1';
    empty.style.color = Theme.statusBarTextColor;
    empty.style.fontFamily = 'monospace';
    empty.style.fontSize = '11px';
    empty.style.padding = '24px 8px';
    empty.style.textAlign = 'center';
    this.gridElement.appendChild(empty);
    this.statusLabel.textContent = '0 textures';
    if (!this.folderLabel.textContent) {
      this.updateFolderLabel(null);
    }
  }

  /**
   * Styles a primary action button.
   *
   * @param button Button element.
   */
  private styleActionButton(button: HTMLButtonElement): void {
    styleFloatingPanelChromeButton(button);
    button.style.padding = '0 10px';
    button.style.boxSizing = 'border-box';
    button.style.height = `${TEXTURE_BROWSER_TOOLBAR_CONTROL_HEIGHT_PX}px`;
  }
}

/**
 * Builds a stand-in entry for a texture whose file is missing.
 *
 * @param id Texture id.
 * @returns Entry without a file or preview.
 */
function textureBrowserMissingEntry(id: string): TextureBrowserEntry {
  const name = id.slice(id.lastIndexOf('/') + 1);
  return {
    id,
    displayName: `${name.replace(/\.[^.]+$/, '')} (missing)`,
    fileName: name,
    relativePath: id,
    previewObjectUrl: '',
    mimeType: '',
    byteSize: 0,
    sourceFile: new File([], name),
  };
}
