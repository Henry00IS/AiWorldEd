import { Theme } from '../theme.js';
import { hexToRgb } from '../utils/color_utils.js';
import { FloatingPanelStack } from './floating_panel_stack.js';
import { TextureBrowserEntry } from '../texture/texture_browser_entry.js';
import { TEXTURE_BROWSER_MIN_THUMB_PX } from './texture_browser_layout.js';
import {
  TEXTURE_BROWSER_GRID_CLASS,
  TEXTURE_BROWSER_NAME_CLASS,
  TEXTURE_BROWSER_ROOT_CLASS,
  TEXTURE_BROWSER_THUMB_CLASS,
  TEXTURE_BROWSER_TILE_CLASS,
  ensureTextureBrowserStylesheet
} from './texture_browser_styles.js';

/**
 * Default outer width of the texture browser panel in pixels.
 */
export const TEXTURE_BROWSER_DEFAULT_WIDTH_PX = 480;

/**
 * Default outer height of the texture browser panel in pixels.
 */
export const TEXTURE_BROWSER_DEFAULT_HEIGHT_PX = 560;

/**
 * Minimum outer width when resizing the panel.
 */
export const TEXTURE_BROWSER_MIN_WIDTH_PX = 280;

/**
 * Minimum outer height when resizing the panel.
 */
export const TEXTURE_BROWSER_MIN_HEIGHT_PX = 240;

/**
 * @deprecated Use TEXTURE_BROWSER_MIN_THUMB_PX from texture_browser_layout.
 */
export const TEXTURE_BROWSER_TILE_MIN_WIDTH_PX = TEXTURE_BROWSER_MIN_THUMB_PX;

/**
 * Callbacks the texture browser panel uses for user actions.
 */
export interface TextureBrowserHandlers {
  onOpenFolder: () => void;
  onSelectTexture: (entryId: string) => void;
}

/**
 * Floating texture browser with a Hammer / UnrealEd / TrenchBroom style grid.
 * Tile size is pure CSS: auto-fill columns and cqi-based square thumbs.
 */
export class TextureBrowser {
  private root: HTMLElement;
  private host: HTMLElement;
  private handlers: TextureBrowserHandlers;
  private defaultAnchor: HTMLElement | null;
  private isVisible: boolean;
  private gridElement: HTMLElement;
  private statusLabel: HTMLElement;
  private folderLabel: HTMLElement;
  private selectedId: string | null;
  private tileElements: Map<string, HTMLElement>;
  private dragOffsetX: number;
  private dragOffsetY: number;
  private isDragging: boolean;
  private isResizing: boolean;
  private resizeStartX: number;
  private resizeStartY: number;
  private resizeStartWidth: number;
  private resizeStartHeight: number;

  /**
   * Creates a texture browser attached to the host element.
   * @param host Parent element (editor root).
   * @param handlers Open-folder and select callbacks.
   * @param defaultAnchor Element used for default open position.
   */
  constructor(
    host: HTMLElement,
    handlers: TextureBrowserHandlers,
    defaultAnchor: HTMLElement | null = null
  ) {
    ensureTextureBrowserStylesheet();
    this.host = host;
    this.handlers = handlers;
    this.defaultAnchor = defaultAnchor;
    this.isVisible = false;
    this.isDragging = false;
    this.isResizing = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.resizeStartX = 0;
    this.resizeStartY = 0;
    this.resizeStartWidth = TEXTURE_BROWSER_DEFAULT_WIDTH_PX;
    this.resizeStartHeight = TEXTURE_BROWSER_DEFAULT_HEIGHT_PX;
    this.selectedId = null;
    this.tileElements = new Map();
    this.gridElement = document.createElement('div');
    this.statusLabel = document.createElement('div');
    this.folderLabel = document.createElement('div');
    this.root = this.buildRoot();
    this.host.appendChild(this.root);
    this.setEmptyState();
  }

  /**
   * Sets the element used for the default open position.
   * @param anchor Viewport or other container, or null for host.
   */
  setDefaultAnchor(anchor: HTMLElement | null): void {
    this.defaultAnchor = anchor;
  }

  /**
   * Shows the browser panel.
   */
  show(): void {
    if (this.isVisible) {
      FloatingPanelStack.bringToFront(this.root);
      return;
    }
    this.isVisible = true;
    this.root.style.display = 'flex';
    this.positionDefault();
    FloatingPanelStack.bringToFront(this.root);
  }

  /**
   * Hides the browser panel.
   * @param _force Kept for call-site compatibility; always hides.
   */
  hide(_force: boolean = false): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.root.style.display = 'none';
  }

  /**
   * Toggles panel visibility.
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide(true);
      return;
    }
    this.show();
  }

  /**
   * Returns whether the panel is open.
   * @returns True when visible.
   */
  isOpen(): boolean {
    return this.isVisible;
  }

  /**
   * Returns the panel root element (for tests and layout introspection).
   * @returns Root HTML element.
   */
  getRootElement(): HTMLElement {
    return this.root;
  }

  /**
   * Returns the scrollable grid element (for tests).
   * @returns Grid HTML element.
   */
  getGridElement(): HTMLElement {
    return this.gridElement;
  }

  /**
   * Rebuilds the grid from texture entries.
   * @param entries Textures to show.
   * @param selectedId Currently selected entry id, or null.
   * @param folderName Opened folder name, or null.
   */
  setEntries(
    entries: TextureBrowserEntry[],
    selectedId: string | null,
    folderName: string | null
  ): void {
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
   * @param message Status text.
   */
  setStatusMessage(message: string): void {
    this.statusLabel.textContent = message;
  }

  /**
   * Disposes the panel and removes it from the DOM.
   */
  dispose(): void {
    this.hide(true);
    this.tileElements.clear();
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }

  /**
   * Builds the root panel element.
   * @returns Styled root.
   */
  private buildRoot(): HTMLElement {
    const root = document.createElement('div');
    root.className = TEXTURE_BROWSER_ROOT_CLASS;
    this.styleRoot(root);
    root.appendChild(this.buildTitleBar());
    root.appendChild(this.buildToolbarRow());
    root.appendChild(this.buildFolderLabel());
    root.appendChild(this.buildGrid());
    root.appendChild(this.buildStatusLabel());
    root.appendChild(this.buildResizeHandle());
    return root;
  }

  /**
   * Applies chrome styles to the floating panel.
   * @param root Panel root.
   */
  private styleRoot(root: HTMLElement): void {
    root.style.position = 'fixed';
    root.style.display = 'none';
    root.style.flexDirection = 'column';
    root.style.boxSizing = 'border-box';
    root.style.width = `${TEXTURE_BROWSER_DEFAULT_WIDTH_PX}px`;
    root.style.height = `${TEXTURE_BROWSER_DEFAULT_HEIGHT_PX}px`;
    root.style.minWidth = `${TEXTURE_BROWSER_MIN_WIDTH_PX}px`;
    root.style.minHeight = `${TEXTURE_BROWSER_MIN_HEIGHT_PX}px`;
    root.style.overflow = 'hidden';
    root.style.background = hexToRgb(Theme.propertiesPanelBackground);
    root.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    root.style.borderRadius = '6px';
    root.style.boxShadow = '0 8px 24px rgba(0,0,0,0.55)';
    root.style.fontFamily = Theme.uiFontFamily;
    root.style.userSelect = 'none';
    this.bindBringToFrontOnPointer(root);
  }

  /**
   * Raises this panel above other floating windows on interaction.
   * @param root Panel root element.
   */
  private bindBringToFrontOnPointer(root: HTMLElement): void {
    root.addEventListener('pointerdown', () => {
      FloatingPanelStack.bringToFront(root);
    });
  }

  /**
   * Builds the draggable title bar with close control.
   * @returns Title bar element.
   */
  private buildTitleBar(): HTMLElement {
    const bar = document.createElement('div');
    this.styleChromeRow(bar);
    bar.style.cursor = 'move';
    bar.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    bar.style.flexShrink = '0';
    const title = document.createElement('span');
    title.textContent = 'Texture Browser';
    title.style.flex = '1';
    title.style.color = Theme.buttonTextColor;
    title.style.fontSize = '12px';
    title.style.fontWeight = '600';
    title.style.fontFamily = 'monospace';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close';
    this.styleSmallButton(close);
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hide(true);
    });
    bar.appendChild(title);
    bar.appendChild(close);
    this.bindDrag(bar);
    return bar;
  }

  /**
   * Builds the Open Folder toolbar row.
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
    handle.style.background =
      'linear-gradient(135deg, transparent 50%, rgba(232,106,23,0.55) 50%)';
    handle.style.borderBottomRightRadius = '5px';
    this.bindResize(handle);
    return handle;
  }

  /**
   * Appends one texture tile to the grid.
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
   * @param entry Texture entry.
   * @returns Tile element.
   */
  private createTile(entry: TextureBrowserEntry): HTMLElement {
    const tile = document.createElement('div');
    tile.className = TEXTURE_BROWSER_TILE_CLASS;
    tile.setAttribute('role', 'option');
    tile.setAttribute('aria-label', entry.id);
    tile.tabIndex = 0;
    tile.dataset.entryId = entry.id;
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
   * @param entry Texture entry with object URL.
   * @returns Thumbnail element.
   */
  private createPreviewThumb(entry: TextureBrowserEntry): HTMLElement {
    const thumb = document.createElement('div');
    thumb.className = TEXTURE_BROWSER_THUMB_CLASS;
    thumb.dataset.previewThumb = 'true';
    thumb.setAttribute('role', 'img');
    thumb.setAttribute('aria-label', entry.displayName);
    const safeUrl = entry.previewObjectUrl.replace(/"/g, '\\"');
    thumb.style.backgroundImage = `url("${safeUrl}")`;
    return thumb;
  }

  /**
   * Creates the name label under a thumbnail.
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
   * @param tile Tile element.
   * @param selected Whether the tile is selected.
   */
  private styleTileSelection(tile: HTMLElement, selected: boolean): void {
    tile.style.border = selected
      ? `1px solid ${hexToRgb(Theme.selectionColor)}`
      : `1px solid ${Theme.inputBorderColor}`;
    tile.style.background = selected
      ? 'rgba(232, 106, 23, 0.22)'
      : hexToRgb(Theme.buttonBackground);
    tile.setAttribute('aria-selected', selected ? 'true' : 'false');
  }

  /**
   * Updates the folder path label.
   * @param folderName Folder name or null.
   */
  private updateFolderLabel(folderName: string | null): void {
    this.folderLabel.textContent = folderName
      ? `Folder: ${folderName}`
      : 'No folder open';
  }

  /**
   * Shows the empty-state message in the grid area.
   */
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
   * Styles a small title-bar button.
   * @param button Button element.
   */
  private styleSmallButton(button: HTMLButtonElement): void {
    button.style.border = `1px solid ${Theme.inputBorderColor}`;
    button.style.borderRadius = '3px';
    button.style.background = hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
    button.style.fontSize = '11px';
    button.style.padding = '2px 6px';
    button.style.cursor = 'pointer';
  }

  /**
   * Styles a primary action button.
   * @param button Button element.
   */
  private styleActionButton(button: HTMLButtonElement): void {
    button.style.border = `1px solid ${Theme.inputBorderColor}`;
    button.style.borderRadius = '3px';
    button.style.background = hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
    button.style.fontSize = '11px';
    button.style.padding = '4px 10px';
    button.style.cursor = 'pointer';
    button.style.fontFamily = Theme.uiFontFamily;
  }

  /**
   * Positions the panel near the bottom-right of the default anchor.
   */
  private positionDefault(): void {
    const paddingPx = 8;
    const panelWidthPx = TEXTURE_BROWSER_DEFAULT_WIDTH_PX;
    const anchor = this.defaultAnchor ?? this.host;
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(
      paddingPx,
      rect.right - panelWidthPx - paddingPx
    );
    const bottomInset = window.innerHeight - rect.bottom + paddingPx;
    this.root.style.left = `${left}px`;
    this.root.style.right = 'auto';
    this.root.style.top = 'auto';
    this.root.style.bottom = `${bottomInset}px`;
    this.root.style.width = `${TEXTURE_BROWSER_DEFAULT_WIDTH_PX}px`;
    this.root.style.height = `${TEXTURE_BROWSER_DEFAULT_HEIGHT_PX}px`;
  }

  /**
   * Enables dragging the panel from the title bar.
   * @param bar Title bar element.
   */
  private bindDrag(bar: HTMLElement): void {
    bar.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).tagName === 'BUTTON') return;
      this.beginDrag(event);
    });
  }

  /**
   * Starts a drag session from a pointer event.
   * @param event Pointer down event.
   */
  private beginDrag(event: PointerEvent): void {
    this.isDragging = true;
    const rect = this.root.getBoundingClientRect();
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    this.convertBottomToTopPosition(rect);
    const onMove = (moveEvent: PointerEvent) => this.onDragMove(moveEvent);
    const onUp = () => {
      this.isDragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /**
   * Moves the panel while dragging.
   * @param moveEvent Pointer move event.
   */
  private onDragMove(moveEvent: PointerEvent): void {
    if (!this.isDragging) return;
    this.root.style.left = `${moveEvent.clientX - this.dragOffsetX}px`;
    this.root.style.top = `${moveEvent.clientY - this.dragOffsetY}px`;
    this.root.style.bottom = 'auto';
    this.root.style.right = 'auto';
  }

  /**
   * Enables southeast resize from the handle.
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
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /**
   * Updates panel size while resizing.
   * @param moveEvent Pointer move event.
   */
  private onResizeMove(moveEvent: PointerEvent): void {
    if (!this.isResizing) return;
    const deltaX = moveEvent.clientX - this.resizeStartX;
    const deltaY = moveEvent.clientY - this.resizeStartY;
    const nextWidth = Math.max(
      TEXTURE_BROWSER_MIN_WIDTH_PX,
      this.resizeStartWidth + deltaX
    );
    const nextHeight = Math.max(
      TEXTURE_BROWSER_MIN_HEIGHT_PX,
      this.resizeStartHeight + deltaY
    );
    this.root.style.width = `${nextWidth}px`;
    this.root.style.height = `${nextHeight}px`;
  }

  /**
   * Converts bottom-anchored layout to top/left so drag/resize stay stable.
   * @param rect Current panel bounding rect.
   */
  private convertBottomToTopPosition(rect: DOMRect): void {
    this.root.style.left = `${rect.left}px`;
    this.root.style.top = `${rect.top}px`;
    this.root.style.bottom = 'auto';
    this.root.style.right = 'auto';
  }
}
