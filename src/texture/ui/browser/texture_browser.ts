import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
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
  TEXTURE_BROWSER_TILE_CLASS,
  ensureTextureBrowserStylesheet,
} from './texture_browser_styles.js';

/** Default outer width of the texture browser panel in pixels. */
export const TEXTURE_BROWSER_DEFAULT_WIDTH_PX = 480;

/** Default outer height of the texture browser panel in pixels. */
export const TEXTURE_BROWSER_DEFAULT_HEIGHT_PX = 560;

/** Minimum outer width when resizing the panel. */
export const TEXTURE_BROWSER_MIN_WIDTH_PX = 280;

/** Minimum outer height when resizing the panel. */
export const TEXTURE_BROWSER_MIN_HEIGHT_PX = 240;

/**
 * Where textures come from: no project yet, the open project, or the room
 * owner.
 */
export type TextureBrowserSource = 'none' | 'project' | 'remote';

/** Callbacks the texture browser panel uses for user actions. */
export interface TextureBrowserHandlers {
  onOpenProject: () => void;
  onSelectTexture: (entryId: string) => void;
}

/**
 * Floating texture browser with a Hammer / UnrealEd / TrenchBroom style grid.
 * Tile size is pure CSS: auto-fill columns and cqi-based square thumbs.
 * Placement and windowing come from {@link FloatingPanel}.
 */
export class TextureBrowser extends PanelFloating {
  private handlers: TextureBrowserHandlers;
  private gridElement: HTMLElement;
  private statusLabel: HTMLElement;
  private folderLabel: HTMLElement;
  private openButton: HTMLButtonElement;
  private searchInput: HTMLInputElement;
  private source: TextureBrowserSource;
  private selectedId: string | null;
  private tileElements: Map<string, HTMLElement>;

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
    this.statusLabel = document.createElement('div');
    this.folderLabel = document.createElement('div');
    this.openButton = document.createElement('button');
    this.searchInput = document.createElement('input');
    this.source = 'none';
    this.populateRoot();
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
   */
  setEntries(
    entries: TextureBrowserEntry[],
    selectedId: string | null,
    folderName: string | null,
    missingIds: readonly string[] = [],
  ): void {
    this.selectedId = selectedId;
    this.tileElements.clear();
    this.gridElement.replaceChildren();
    this.updateFolderLabel(folderName);
    if (entries.length + missingIds.length === 0) {
      this.setEmptyState();
      return;
    }
    entries.forEach((entry) => this.appendTile(entry));
    this.missingAppend(missingIds);
    this.filterApply();
    const missing = missingIds.length > 0 ? ` · ${missingIds.length} missing` : '';
    this.statusLabel.textContent = `${entries.length} texture(s)${missing}`;
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

  /** Disposes tiles and the shared floating-panel shell. */
  override dispose(): void {
    this.tileElements.clear();
    super.dispose();
  }

  /** Fills the shared floating-panel shell with texture browser chrome. */
  private populateRoot(): void {
    this.root.className = TEXTURE_BROWSER_ROOT_CLASS;
    this.styleRoot(this.root);
    this.root.appendChild(this.buildTitleBar());
    this.root.appendChild(this.buildToolbarRow());
    this.root.appendChild(this.buildFolderLabel());
    this.root.appendChild(this.buildGrid());
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
    row.appendChild(this.buildOpenButton());
    return row;
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
    button.textContent = 'Open project folder…';
    button.title = 'Open a project folder; its images become the textures';
    button.setAttribute('aria-label', 'Open project folder');
    this.styleActionButton(button);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handlers.onOpenProject();
    });
    return button;
  }

  /** Hides tiles whose path does not contain the search text. */
  private filterApply(): void {
    const needle = this.searchInput.value.trim().toLowerCase();
    this.tileElements.forEach((tile, id) => {
      tile.style.display = needle === '' || id.toLowerCase().includes(needle) ? '' : 'none';
    });
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
   * Builds the scrollable thumbnail grid container.
   *
   * @returns Grid element.
   */
  private buildGrid(): HTMLElement {
    this.gridElement.className = TEXTURE_BROWSER_GRID_CLASS;
    this.gridElement.style.padding = '8px 10px';
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
    this.statusLabel.style.padding = '6px 10px 8px';
    this.statusLabel.style.color = Theme.statusBarTextColor;
    this.statusLabel.style.fontFamily = 'monospace';
    this.statusLabel.style.fontSize = '10px';
    this.statusLabel.style.flexShrink = '0';
    this.statusLabel.style.boxSizing = 'border-box';
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
    tile.title = entry.relativePath;
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
   * Creates a square preview using background-image (height from CSS).
   *
   * @param entry Texture entry with object URL.
   * @returns Thumbnail element.
   */
  private createPreviewThumb(entry: TextureBrowserEntry): HTMLElement {
    const thumb = document.createElement('div');
    thumb.className = TEXTURE_BROWSER_THUMB_CLASS;
    thumb.dataset['previewThumb'] = 'true';
    thumb.setAttribute('role', 'img');
    thumb.setAttribute('aria-label', entry.displayName);
    const safeUrl = entry.previewObjectUrl.replace(/"/g, '\\"');
    thumb.style.backgroundImage = `url("${safeUrl}")`;
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
    tile.style.border = selected
      ? `1px solid ${hexToRgb(Theme.selectionColor)}`
      : `1px solid ${Theme.inputBorderColor}`;
    tile.style.background = selected ? 'rgba(232, 106, 23, 0.22)' : hexToRgb(Theme.buttonBackground);
    tile.setAttribute('aria-selected', selected ? 'true' : 'false');
  }

  /**
   * Updates the folder path label.
   *
   * @param folderName Folder name or null.
   */
  private updateFolderLabel(folderName: string | null): void {
    if (this.source === 'remote') this.folderLabel.textContent = 'Textures from the room owner';
    else this.folderLabel.textContent = folderName ? `Project: ${folderName}` : 'No project open';
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
    this.statusLabel.textContent = '0 texture(s)';
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
    button.style.padding = '4px 10px';
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
