import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';
import { styleFloatingPanelChromeButton } from '@/ui/floating_panel/panel_floating_title_bar.js';
import {
  sharedAiCaptureDebugStore,
  type AiCaptureDebugEntry,
  type StoreAiCaptureDebug,
} from '@/ai/client/store_ai_capture_debug.js';

/**
 * Floating debug window listing every AI capture_view image for visual
 * inspection. Uses the same {@link PanelFloating} base as Tools / Solid Model.
 */
export class PanelAiCaptureDebug extends PanelFloating {
  private readonly store: StoreAiCaptureDebug;
  private readonly listHost: HTMLElement;
  private readonly statusLabel: HTMLElement;
  private readonly clearButton: HTMLButtonElement;
  private unsubscribe: (() => void) | null;

  /**
   * Creates the AI capture debug panel.
   *
   * @param host Parent element (editor root / toolbar container).
   * @param defaultAnchor Element used for default open position.
   * @param store Optional store override (defaults to the shared process
   *   store).
   */
  constructor(
    host: HTMLElement,
    defaultAnchor: HTMLElement | null = null,
    store: StoreAiCaptureDebug = sharedAiCaptureDebugStore,
  ) {
    super(host, { corner: 'bottom-right', insetBelowViewportToolbar: false }, defaultAnchor);
    this.store = store;
    this.listHost = document.createElement('div');
    this.statusLabel = document.createElement('div');
    this.clearButton = document.createElement('button');
    this.unsubscribe = null;
    this.populateRoot();
    this.unsubscribe = this.store.subscribe(() => this.refresh());
    this.refresh();
  }

  /** Rebuilds the list from the current store contents. */
  refresh(): void {
    this.statusLabel.textContent = this.buildStatusText();
    this.listHost.replaceChildren();
    const entries = this.store.list();
    if (entries.length === 0) {
      this.listHost.appendChild(this.buildEmptyState());
      return;
    }
    for (const entry of entries) {
      this.listHost.appendChild(this.buildEntryCard(entry));
    }
  }

  /** Removes DOM listeners and the panel shell. */
  override dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    super.dispose();
  }

  /** Fills the floating-panel shell with chrome and list content. */
  private populateRoot(): void {
    this.styleRoot(this.root);
    this.root.appendChild(this.buildTitleBar());
    this.root.appendChild(this.buildToolbar());
    this.root.appendChild(this.buildListHost());
  }

  /**
   * Applies chrome styles to the floating panel root.
   *
   * @param root Panel root.
   */
  private styleRoot(root: HTMLElement): void {
    root.classList.add('editor-ai-capture-debug-panel');
    applyFloatingPanelToolChrome(root, {
      width: '320px',
      maxHeight: '70vh',
      borderRadiusPx: 8,
      boxShadow: '0 10px 28px rgba(0,0,0,0.55)',
      overflowHidden: true,
    });
  }

  /**
   * Builds the draggable title bar with close control.
   *
   * @returns Title bar element.
   */
  private buildTitleBar(): HTMLElement {
    const parts = this.createStandardTitleBar({ titleText: 'AI Captures' });
    return parts.bar;
  }

  /**
   * Builds the status line and Clear action row.
   *
   * @returns Toolbar element.
   */
  private buildToolbar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.gap = '8px';
    bar.style.padding = '8px 10px';
    bar.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    this.statusLabel.style.flex = '1';
    this.statusLabel.style.color = Theme.statusBarTextColor;
    this.statusLabel.style.fontSize = '11px';
    this.clearButton.type = 'button';
    this.clearButton.textContent = 'Clear';
    this.clearButton.title = 'Remove all stored AI captures';
    this.styleChromeButton(this.clearButton);
    this.clearButton.addEventListener('click', () => this.store.clear());
    bar.appendChild(this.statusLabel);
    bar.appendChild(this.clearButton);
    return bar;
  }

  /**
   * Builds the scrollable list host.
   *
   * @returns List container.
   */
  private buildListHost(): HTMLElement {
    this.listHost.style.flex = '1';
    this.listHost.style.overflowY = 'auto';
    this.listHost.style.padding = '8px 10px 10px';
    this.listHost.style.display = 'flex';
    this.listHost.style.flexDirection = 'column';
    this.listHost.style.gap = '10px';
    this.listHost.style.minHeight = '120px';
    this.listHost.style.maxHeight = 'calc(70vh - 88px)';
    return this.listHost;
  }

  /**
   * Builds the empty-list placeholder.
   *
   * @returns Empty state element.
   */
  private buildEmptyState(): HTMLElement {
    const empty = document.createElement('div');
    empty.textContent = 'No AI captures yet. Call capture_view from MCP to see images here.';
    empty.style.color = Theme.statusBarTextColor;
    empty.style.fontSize = '11px';
    empty.style.lineHeight = '1.4';
    empty.style.opacity = '0.85';
    return empty;
  }

  /**
   * Builds one capture card with thumbnail and metadata.
   *
   * @param entry Store entry.
   * @returns Card element.
   */
  private buildEntryCard(entry: AiCaptureDebugEntry): HTMLElement {
    const card = document.createElement('div');
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '6px';
    card.style.padding = '8px';
    card.style.borderRadius = '6px';
    card.style.background = hexToRgb(Theme.buttonBackground);
    card.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    card.appendChild(this.buildEntryImage(entry));
    card.appendChild(this.buildEntryMeta(entry));
    return card;
  }

  /**
   * Builds the preview image for one capture.
   *
   * @param entry Store entry.
   * @returns Image element.
   */
  private buildEntryImage(entry: AiCaptureDebugEntry): HTMLImageElement {
    const image = document.createElement('img');
    image.alt = `AI capture ${entry.id}`;
    image.src = `data:${entry.mimeType};base64,${entry.base64}`;
    image.style.width = '100%';
    image.style.height = 'auto';
    image.style.display = 'block';
    image.style.borderRadius = '4px';
    image.style.background = hexToRgb(Theme.viewportBackground);
    image.style.imageRendering = 'auto';
    return image;
  }

  /**
   * Builds the text metadata block under a thumbnail.
   *
   * @param entry Store entry.
   * @returns Meta element.
   */
  private buildEntryMeta(entry: AiCaptureDebugEntry): HTMLElement {
    const meta = document.createElement('div');
    meta.style.display = 'flex';
    meta.style.flexDirection = 'column';
    meta.style.gap = '2px';
    meta.style.color = Theme.buttonTextColor;
    meta.style.fontSize = '11px';
    meta.style.lineHeight = '1.35';
    const line1 = document.createElement('div');
    line1.textContent = `${entry.width}×${entry.height} · ${entry.shading} · ${formatCaptureTime(entry.createdAtMs)}`;
    const line2 = document.createElement('div');
    line2.textContent = entry.cameraSummary;
    line2.style.opacity = '0.85';
    line2.style.wordBreak = 'break-word';
    const line3 = document.createElement('div');
    line3.textContent = `${entry.message} · framed ${entry.framedBrushCount}`;
    line3.style.opacity = '0.75';
    meta.appendChild(line1);
    meta.appendChild(line2);
    meta.appendChild(line3);
    return meta;
  }

  /**
   * Styles a small chrome button (Clear).
   *
   * @param button Button element.
   */
  private styleChromeButton(button: HTMLButtonElement): void {
    styleFloatingPanelChromeButton(button);
    button.style.padding = '2px 8px';
    button.style.fontSize = '12px';
  }

  /**
   * Builds the status line text for the current store size.
   *
   * @returns Status string.
   */
  private buildStatusText(): string {
    const count = this.store.count();
    if (count === 0) {
      return '0 captures';
    }
    return `${count} capture${count === 1 ? '' : 's'} (newest first)`;
  }
}

/**
 * Formats a capture timestamp for the list row.
 *
 * @param createdAtMs Epoch milliseconds.
 * @returns Local time string.
 */
function formatCaptureTime(createdAtMs: number): string {
  try {
    return new Date(createdAtMs).toLocaleTimeString();
  } catch {
    return String(createdAtMs);
  }
}
