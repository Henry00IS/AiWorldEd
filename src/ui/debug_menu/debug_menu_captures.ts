import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { styleFloatingPanelChromeButton } from '@/ui/floating_panel/panel_floating_title_bar.js';
import {
  AI_CAPTURE_DEBUG_MAX_BYTES,
  AI_CAPTURE_DEBUG_MAX_ENTRIES,
  aiCaptureDebugEntryBytes,
  type AiCaptureDebugEntry,
  type StoreAiCaptureDebug,
} from '@/ai/client/store_ai_capture_debug.js';
import { bytesFormatBinary } from '@/utils/utils_bytes_format.js';
import { debugMenuNote, type DebugMenuTab } from './debug_menu_tab.js';

/**
 * Debug Menu tab listing the AI view_capture images (newest first). The images
 * exist in the page only while the tab is shown: hiding it drops them.
 */
export class DebugMenuCaptures implements DebugMenuTab {
  readonly label = 'View capture';
  readonly element = document.createElement('div');
  private readonly statusLabel = document.createElement('div');
  private readonly listHost = document.createElement('div');
  private unsubscribe: (() => void) | null = null;

  /**
   * Creates the tab.
   *
   * @param store Capture store.
   */
  constructor(private readonly store: StoreAiCaptureDebug) {
    this.element.style.display = 'flex';
    this.element.style.flexDirection = 'column';
    this.element.style.minHeight = '0';
    this.element.style.minWidth = '0';
    this.element.style.flex = '1';
    this.element.appendChild(this.toolbarBuild());
    this.listHost.style.flex = '1';
    this.listHost.style.overflowY = 'auto';
    this.listHost.style.padding = '8px 10px 10px';
    this.listHost.style.display = 'flex';
    this.listHost.style.flexDirection = 'column';
    this.listHost.style.gap = '10px';
    this.listHost.style.minHeight = '120px';
    this.element.appendChild(this.listHost);
  }

  /** Builds the list and follows new captures. */
  show(): void {
    this.unsubscribe ??= this.store.subscribe(() => this.listBuild());
    this.listBuild();
  }

  /** Drops the images and stops following. */
  hide(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listClear();
  }

  /** The list follows the store; nothing to poll. */
  refresh(): void {}

  /** Stops following the store. */
  dispose(): void {
    this.hide();
  }

  /** Rebuilds the list from the store. */
  private listBuild(): void {
    this.statusLabel.textContent = debugMenuCapturesStatus(this.store);
    this.listClear();
    const entries = this.store.list();
    if (entries.length === 0) {
      this.listHost.appendChild(debugMenuNote('No AI captures yet. Call view_capture from MCP to see images here.'));
      return;
    }
    entries.forEach((entry) => this.listHost.appendChild(debugMenuCaptureCard(entry)));
  }

  /** Removes the cards, unsetting their images first so their decodes can go. */
  private listClear(): void {
    this.listHost.querySelectorAll('img').forEach((image) => image.removeAttribute('src'));
    this.listHost.replaceChildren();
  }

  /**
   * Builds the status line and Clear button.
   *
   * @returns Toolbar.
   */
  private toolbarBuild(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.gap = '8px';
    bar.style.padding = '8px 10px';
    bar.style.borderBottom = `1px solid ${ThemeCss.separatorColor}`;
    this.statusLabel.style.flex = '1';
    this.statusLabel.style.color = ThemeCss.mutedTextColor;
    this.statusLabel.style.fontSize = '11px';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear';
    clear.title = 'Remove all stored AI captures';
    styleFloatingPanelChromeButton(clear);
    clear.style.padding = '2px 8px';
    clear.style.fontSize = '12px';
    clear.addEventListener('click', () => this.store.clear());
    bar.append(this.statusLabel, clear);
    return bar;
  }
}

/**
 * Status line: how many captures are kept, their bytes and the limits.
 *
 * @param store Capture store.
 * @returns Text.
 */
export function debugMenuCapturesStatus(store: StoreAiCaptureDebug): string {
  const count = store.count();
  const limits = `keeps the last ${AI_CAPTURE_DEBUG_MAX_ENTRIES}, up to ${bytesFormatBinary(AI_CAPTURE_DEBUG_MAX_BYTES)}`;
  if (count === 0) return `0 captures (${limits})`;
  return `${count} capture${count === 1 ? '' : 's'} · ${bytesFormatBinary(store.bytes())} (newest first; ${limits})`;
}

/**
 * Builds one capture card: the image and what was captured.
 *
 * @param entry Capture.
 * @returns Card.
 */
function debugMenuCaptureCard(entry: AiCaptureDebugEntry): HTMLElement {
  const card = document.createElement('div');
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '6px';
  card.style.padding = '8px';
  card.style.borderRadius = '6px';
  card.style.background = ThemeCss.buttonBackground;
  card.style.border = `1px solid ${ThemeCss.separatorColor}`;
  const image = document.createElement('img');
  image.alt = `AI capture ${entry.id}`;
  image.decoding = 'async';
  image.src = `data:${entry.mimeType};base64,${entry.base64}`;
  image.style.width = '100%';
  image.style.height = 'auto';
  image.style.display = 'block';
  image.style.borderRadius = '4px';
  image.style.background = ThemeCss.viewportBackground;
  const meta = document.createElement('div');
  meta.style.display = 'flex';
  meta.style.flexDirection = 'column';
  meta.style.gap = '2px';
  meta.style.color = ThemeCss.textColor;
  meta.style.fontSize = '11px';
  meta.style.lineHeight = '1.35';
  const lines = [
    `${entry.width}×${entry.height} · ${entry.shading} · ${bytesFormatBinary(aiCaptureDebugEntryBytes(entry))} · ${debugMenuCaptureTime(entry.createdAtMs)}`,
    entry.cameraSummary,
    `${entry.message} · framed ${entry.framedBrushCount}`,
  ];
  lines.forEach((text, index) => {
    const line = document.createElement('div');
    line.textContent = text;
    if (index > 0) line.style.opacity = index === 1 ? '0.85' : '0.75';
    if (index === 1) line.style.wordBreak = 'break-word';
    meta.appendChild(line);
  });
  card.append(image, meta);
  return card;
}

/**
 * Formats a capture time.
 *
 * @param createdAtMs Epoch milliseconds.
 * @returns Local time.
 */
function debugMenuCaptureTime(createdAtMs: number): string {
  try {
    return new Date(createdAtMs).toLocaleTimeString();
  } catch {
    return String(createdAtMs);
  }
}
