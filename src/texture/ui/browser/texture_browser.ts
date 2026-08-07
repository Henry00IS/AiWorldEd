import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { clampFloatingPanelRectToScreen } from '@/ui/floating_panel/panel_floating_screen_bounds.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';
import { styleFloatingPanelChromeButton } from '@/ui/floating_panel/panel_floating_title_bar.js';
import { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
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

/** Callbacks the texture browser panel uses for user actions. */
export interface TextureBrowserHandlers {
  onOpenFolder: () => void;
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
  private selectedId: string | null;
  private tileElements: Map<string, HTMLElement>;
  private isResizing: boolean;
  private resizeStartX: number;
  private resizeStartY: number;
  private resizeStartWidth: number;
  private resizeStartHeight: number;

  /**
   * Creates a texture browser attached to the host element.
   *
   * @param host Parent element (editor root).
   * @param handlers Open-folder and select callbacks.
   * @param defaultAnchor Element used for default open position.
   */
  constructor(host: HTMLElement, handlers: TextureBrowserHandlers, defaultAnchor: HTMLElement | null = null) {
    ensureTextureBrowserStylesheet();
    super(host, { corner: 'bottom-right' }, defaultAnchor);
    this.handlers = handlers;
    this.isResizing = false;
    this.resizeStartX = 0;
    this.resizeStartY = 0;
    this.resizeStartWidth = TEXTURE_BROWSER_DEFAULT_WIDTH_PX;
    this.resizeStartHeight = TEXTURE_BROWSER_DEFAULT_HEIGHT_PX;
    this.selectedId = null;
    this.tileElements = new Map();
    this.gridElement = document.createElement('div');
    this.statusLabel = document.createElement('div');
    this.folderLabel = document.createElement('div');
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
   */
  setEntries(entries: TextureBrowserEntry[], selectedId: string | null, folderName: string | null): void {
    this.selectedId = selectedId;
    this.tileElements.clear();
    this.gridElement.replaceChildren();
    this.updateFolderLabel(folderName);
    if (entries.length === 0) {
      this.setEmptyState();
      return;
    }
    entries.forEach((entry) => this.appendTile(entry));
    this.statusLabel.textContent = `${entries.length} texture(s)`;
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
   * Builds the Open Folder toolbar row.
   *
   * @returns Toolbar row element.
   */
  private buildToolbarRow(): HTMLElement {
    const row = document.createElement('div');
    this.styleChromeRow(row);
    row.style.padding = '8px 10px 4px';
    row.style.flexShrink = '0';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.textContent = 'Open Folder…';
    openButton.title = 'Open a local texture folder';
    openButton.setAttribute('aria-label', 'Open Folder');
    this.styleActionButton(openButton);
    openButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handlers.onOpenFolder();
    });
    row.appendChild(openButton);
    return row;
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
    const handle = document.createElement('div');
    handle.setAttribute('aria-label', 'Resize browser');
    handle.title = 'Resize';
    handle.style.position = 'absolute';
    handle.style.right = '0';
    handle.style.bottom = '0';
    handle.style.width = '14px';
    handle.style.height = '14px';
    handle.style.cursor = 'nwse-resize';
    handle.style.boxSizing = 'border-box';
    handle.style.background = 'linear-gradient(135deg, transparent 50%, rgba(232,106,23,0.55) 50%)';
    handle.style.borderBottomRightRadius = '5px';
    this.bindResize(handle);
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
    this.folderLabel.textContent = folderName ? `Folder: ${folderName}` : 'No folder open';
  }

  /** Shows the empty-state message in the grid area. */
  private setEmptyState(): void {
    this.gridElement.replaceChildren();
    this.tileElements.clear();
    const empty = document.createElement('div');
    empty.textContent = 'Open a folder to browse textures';
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

  /**
   * Enables southeast resize from the handle.
   *
   * @param handle Resize grip element.
   */
  private bindResize(handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      this.beginResize(event);
    });
  }

  /**
   * Starts a resize session from a pointer event.
   *
   * @param event Pointer down event on the resize handle.
   */
  private beginResize(event: PointerEvent): void {
    this.isResizing = true;
    const rect = this.root.getBoundingClientRect();
    this.resizeStartX = event.clientX;
    this.resizeStartY = event.clientY;
    this.resizeStartWidth = rect.width;
    this.resizeStartHeight = rect.height;
    this.convertBottomToTopPosition(rect);
    const onMove = (moveEvent: PointerEvent) => this.onResizeMove(moveEvent);
    const onUp = () => {
      this.isResizing = false;
      this.clampToScreen();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /**
   * Updates panel size while resizing and keeps the window on screen.
   *
   * @param moveEvent Pointer move event.
   */
  private onResizeMove(moveEvent: PointerEvent): void {
    if (!this.isResizing) return;
    const deltaX = moveEvent.clientX - this.resizeStartX;
    const deltaY = moveEvent.clientY - this.resizeStartY;
    const nextWidth = Math.max(TEXTURE_BROWSER_MIN_WIDTH_PX, this.resizeStartWidth + deltaX);
    const nextHeight = Math.max(TEXTURE_BROWSER_MIN_HEIGHT_PX, this.resizeStartHeight + deltaY);
    this.root.style.width = `${nextWidth}px`;
    this.root.style.height = `${nextHeight}px`;
    const rect = this.root.getBoundingClientRect();
    const clamped = clampFloatingPanelRectToScreen(
      { left: rect.left, top: rect.top, width: nextWidth, height: nextHeight },
      window.innerWidth,
      window.innerHeight,
    );
    this.setTopLeftPosition(clamped.left, clamped.top);
  }
}
