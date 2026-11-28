import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import type { ManagerImage } from '@/texture/image_manager/manager_image.js';
import type { ImageManagerEntryInfo, ImageManagerLevel } from '@/texture/image_manager/image_manager_types.js';
import { bytesFormatBinary } from '@/utils/utils_bytes_format.js';
import { debugMenuNote, debugMenuRow, debugMenuTable, type DebugMenuTab } from './debug_menu_tab.js';

/** Rows shown at most (the most recently used). */
const DEBUG_MENU_IMAGES_MAX_ROWS = 400;

/** Column titles. */
const DEBUG_MENU_IMAGES_HEADERS = [
  'Name',
  'Source',
  'Key / hash',
  'Size',
  'Thumb',
  'Full',
  'GPU',
  'Bytes (est.)',
  'State',
  'Last used',
] as const;

/** Right-aligned columns. */
const DEBUG_MENU_IMAGES_NUMERIC = new Set([3, 4, 5, 6, 7, 9]);

/** Debug Menu tab listing every image the image manager knows, live. */
export class DebugMenuImages implements DebugMenuTab {
  readonly label = 'Image handles';
  readonly element = document.createElement('div');
  private readonly summary = debugMenuNote('');
  private readonly tableHost = document.createElement('div');

  /**
   * Creates the tab.
   *
   * @param manager Image manager.
   * @param now Clock (for "last used").
   */
  constructor(
    private readonly manager: ManagerImage,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.element.style.display = 'flex';
    this.element.style.flexDirection = 'column';
    this.element.style.flex = '1';
    this.element.style.minHeight = '0';
    this.element.style.minWidth = '0';
    this.summary.style.padding = '8px 10px';
    this.summary.style.borderBottom = `1px solid ${ThemeCss.separatorColor}`;
    this.tableHost.style.flex = '1';
    this.tableHost.style.overflow = 'auto';
    this.tableHost.style.padding = '0 4px 8px';
    this.element.append(this.summary, this.tableHost);
  }

  /** Builds the list. */
  show(): void {
    this.refresh();
  }

  /** Drops the list. */
  hide(): void {
    this.tableHost.replaceChildren();
  }

  /** Rebuilds the list from the manager. */
  refresh(): void {
    const rows = this.manager.entriesInfo();
    const levels = (level: ImageManagerLevel): number => rows.filter((row) => row.levels[level].bytes > 0).length;
    this.summary.textContent =
      `${rows.length} images · ${this.manager.liveHandles()} live handles · ` +
      `${levels('thumbnail')} thumbnails, ${levels('full')} full images, ${levels('gpu')} on the GPU · ` +
      `${rows.filter((row) => row.pooled).length} in the unused pool. Users per level: thumbnail / full / GPU.`;
    const { table, body } = debugMenuTable(DEBUG_MENU_IMAGES_HEADERS, DEBUG_MENU_IMAGES_NUMERIC);
    const now = this.now();
    rows.slice(0, DEBUG_MENU_IMAGES_MAX_ROWS).forEach((row) => {
      const cells = debugMenuImagesCells(row, now);
      const element = debugMenuRow(body, cells, DEBUG_MENU_IMAGES_NUMERIC);
      element.title = `${row.key}${row.hash === undefined ? '' : `\nsha256 ${row.hash}`}`;
      if (!row.sourced) element.style.opacity = '0.6';
    });
    if (rows.length === 0) this.tableHost.replaceChildren(debugMenuNote('The image manager holds no images yet.'));
    else if (rows.length > DEBUG_MENU_IMAGES_MAX_ROWS)
      this.tableHost.replaceChildren(table, debugMenuNote(`…and ${rows.length - DEBUG_MENU_IMAGES_MAX_ROWS} more`));
    else this.tableHost.replaceChildren(table);
  }

  /** Nothing to stop. */
  dispose(): void {
    this.hide();
  }
}

/**
 * Builds the cells of one image row.
 *
 * @param row Image.
 * @param now Current time.
 * @returns Cell texts.
 */
export function debugMenuImagesCells(row: ImageManagerEntryInfo, now: number): string[] {
  const level = (name: ImageManagerLevel): string => {
    const { users, state } = row.levels[name];
    const mark = state === 'ready' ? '' : state === 'loading' ? ' …' : state === 'failed' ? ' ✕' : ' –';
    return `${users}${mark}`;
  };
  const bytes = row.levels.thumbnail.bytes + row.levels.full.bytes + row.levels.gpu.bytes;
  return [
    row.name,
    row.origin,
    row.hash === undefined ? debugMenuImagesKeyShort(row.key) : `#${row.hash.slice(0, 12)}`,
    row.width > 0 ? `${row.width}×${row.height}` : '?',
    level('thumbnail'),
    level('full'),
    level('gpu'),
    bytesFormatBinary(bytes),
    debugMenuImagesState(row),
    row.lastUsedMs > 0 ? debugMenuImagesAgo(now - row.lastUsedMs) : 'never',
  ];
}

/**
 * Sums up an image's state.
 *
 * @param row Image.
 * @returns Loading, ready, unused pool, empty or failed.
 */
function debugMenuImagesState(row: ImageManagerEntryInfo): string {
  const levels = Object.values(row.levels);
  if (levels.some((level) => level.state === 'loading')) return 'loading';
  if (row.pooled) return 'unused pool';
  if (levels.some((level) => level.state === 'ready' && level.bytes > 0)) return 'ready';
  if (levels.some((level) => level.state === 'failed')) return 'failed';
  return 'empty';
}

/**
 * Shortens an object URL to its last part.
 *
 * @param key Object URL.
 * @returns Short text.
 */
function debugMenuImagesKeyShort(key: string): string {
  const tail = key.slice(key.lastIndexOf('/') + 1);
  return tail.length > 13 ? `${tail.slice(0, 13)}…` : tail;
}

/**
 * Formats how long ago something happened.
 *
 * @param ms Milliseconds ago.
 * @returns Text such as "12 s ago".
 */
function debugMenuImagesAgo(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}
