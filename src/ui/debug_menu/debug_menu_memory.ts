import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import type { ManagerImage } from '@/texture/image_manager/manager_image.js';
import type { ImageManagerLedger } from '@/texture/image_manager/image_manager_types.js';
import {
  imageManagerRendererList,
  type ImageManagerRenderer,
} from '@/texture/image_manager/image_manager_renderers.js';
import type { StoreAiCaptureDebug } from '@/ai/client/store_ai_capture_debug.js';
import { thumbnailGridCacheInfo } from '@/ui/thumbnail_grid/thumbnail_grid.js';
import { bytesFormatBinary } from '@/utils/utils_bytes_format.js';
import { debugMenuNote, debugMenuRow, debugMenuTable, type DebugMenuTab } from './debug_menu_tab.js';

/** One section of the memory tab: a title and label / value / note rows. */
export interface DebugMenuMemorySection {
  title: string;
  rows: [label: string, value: string, note: string][];
}

/** Everything the memory tab reads (gathered by {@link debugMenuMemoryGather}). */
export interface DebugMenuMemoryInput {
  ledger: ImageManagerLedger;
  renderers: { label: string; textures: number; geometries: number; programs: number }[];
  gridCache: { count: number; bytes: number };
  captures: { count: number; bytes: number };
  /** Chromium's performance.memory, when available. */
  heap: { used: number; total: number; limit: number } | null;
  /** Navigator.storage.estimate(), when available. */
  storage: { usage: number; quota: number } | null;
}

/** Debug Menu tab with best-effort RAM and VRAM figures. */
export class DebugMenuMemory implements DebugMenuTab {
  readonly label = 'Memory';
  readonly element = document.createElement('div');
  private storage: DebugMenuMemoryInput['storage'] = null;
  private storagePending = false;

  /**
   * Creates the tab.
   *
   * @param manager Image manager.
   * @param captures AI capture store.
   */
  constructor(
    private readonly manager: ManagerImage,
    private readonly captures: StoreAiCaptureDebug,
  ) {
    this.element.style.flex = '1';
    this.element.style.minHeight = '0';
    this.element.style.minWidth = '0';
    this.element.style.overflow = 'auto';
    this.element.style.padding = '6px 10px 10px';
  }

  /** Builds the figures. */
  show(): void {
    this.refresh();
  }

  /** Drops the figures. */
  hide(): void {
    this.element.replaceChildren();
  }

  /** Reads the figures again. */
  refresh(): void {
    this.storageRead();
    const sections = debugMenuMemorySections(
      debugMenuMemoryGather(this.manager, this.captures, imageManagerRendererList(), this.storage),
    );
    const nodes: HTMLElement[] = [
      debugMenuNote(
        'Best-effort figures. "est." values are this editor\'s own estimates (RGBA pixels, ×4/3 with mipmaps, once per WebGL context); browsers do not report real image or GPU memory.',
      ),
    ];
    sections.forEach((section) => {
      const title = document.createElement('div');
      title.textContent = section.title;
      title.style.margin = '10px 0 4px';
      title.style.fontSize = '11px';
      title.style.fontWeight = '600';
      title.style.color = ThemeCss.textColor;
      const { table, body } = debugMenuTable(['', 'Value', ''], new Set([1]));
      table.tHead?.remove();
      section.rows.forEach((row) => {
        const element = debugMenuRow(body, row, new Set([1]));
        const note = element.cells[2];
        if (note) {
          note.style.color = ThemeCss.mutedTextColor;
          note.style.whiteSpace = 'normal';
        }
      });
      nodes.push(title, table);
    });
    this.element.replaceChildren(...nodes);
  }

  /** Nothing to stop. */
  dispose(): void {
    this.hide();
  }

  /** Asks the browser for storage use (async; shown on the next refresh). */
  private storageRead(): void {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (this.storagePending || typeof storage?.estimate !== 'function') return;
    this.storagePending = true;
    void storage
      .estimate()
      .then((estimate) => {
        this.storage = { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
      })
      .catch(() => undefined)
      .finally(() => (this.storagePending = false));
  }
}

/**
 * Gathers the memory figures.
 *
 * @param manager Image manager.
 * @param captures AI capture store.
 * @param renderers Registered renderers.
 * @param storage Last storage estimate.
 * @returns Input of {@link debugMenuMemorySections}.
 */
export function debugMenuMemoryGather(
  manager: ManagerImage,
  captures: StoreAiCaptureDebug,
  renderers: readonly ImageManagerRenderer[],
  storage: DebugMenuMemoryInput['storage'],
): DebugMenuMemoryInput {
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    }
  ).memory;
  return {
    ledger: manager.ledger(),
    renderers: renderers.map(({ label, renderer }) => ({
      label,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
      programs: renderer.info.programs?.length ?? 0,
    })),
    gridCache: thumbnailGridCacheInfo(),
    captures: { count: captures.count(), bytes: captures.bytes() },
    heap:
      memory === undefined
        ? null
        : { used: memory.usedJSHeapSize, total: memory.totalJSHeapSize, limit: memory.jsHeapSizeLimit },
    storage,
  };
}

/**
 * Lays out the memory figures, all sizes in binary units.
 *
 * @param input Figures.
 * @returns Sections.
 */
export function debugMenuMemorySections(input: DebugMenuMemoryInput): DebugMenuMemorySection[] {
  return [
    debugMenuMemoryRam(input.ledger),
    debugMenuMemoryVram(input.ledger),
    debugMenuMemoryRenderers(input.renderers),
    {
      title: 'Other image memory',
      rows: [
        [
          'Browser grid thumbnails (est.)',
          bytesFormatBinary(input.gridCache.bytes),
          `${input.gridCache.count} resampled bitmaps`,
        ],
        ['AI view_capture images', bytesFormatBinary(input.captures.bytes), `${input.captures.count} kept`],
      ],
    },
    debugMenuMemoryBrowser(input.heap, input.storage),
  ];
}

/**
 * Formats a share of a budget.
 *
 * @param part Used bytes.
 * @param whole Budget bytes.
 * @returns Text such as "2.2 % of 1.00 GiB".
 */
function debugMenuMemoryPercent(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)} % of ${bytesFormatBinary(whole)}` : '';
}

/**
 * The image manager's RAM section.
 *
 * @param ledger Ledger.
 * @returns Section.
 */
function debugMenuMemoryRam(ledger: ImageManagerLedger): DebugMenuMemorySection {
  const ram = ledger.thumbnailBytes + ledger.thumbnailCacheBytes + ledger.fullBytes;
  return {
    title: 'Image manager — RAM',
    rows: [
      ['Images known', String(ledger.entries), ''],
      ['Thumbnails', bytesFormatBinary(ledger.thumbnailBytes), 'compressed WebP/PNG blobs'],
      ['Thumbnails kept by hash', bytesFormatBinary(ledger.thumbnailCacheBytes), 'their file is gone'],
      ['Full images (est.)', bytesFormatBinary(ledger.fullBytes), 'decoded RGBA, width × height × 4'],
      ['Unused pool', bytesFormatBinary(ledger.pooledRamBytes), 'dropped oldest first when over budget'],
      ['Total (est.)', bytesFormatBinary(ram), debugMenuMemoryPercent(ram, ledger.ramBudgetBytes)],
    ],
  };
}

/**
 * The image manager's VRAM section.
 *
 * @param ledger Ledger.
 * @returns Section.
 */
function debugMenuMemoryVram(ledger: ImageManagerLedger): DebugMenuMemorySection {
  return {
    title: 'Image manager — VRAM',
    rows: [
      [
        'Per WebGL context (est.)',
        bytesFormatBinary(ledger.gpuBytesPerContext),
        'textures bound by live materials, RGBA × 4/3 with mipmaps',
      ],
      ['WebGL contexts', String(ledger.contexts), 'each holds its own copy'],
      [
        'Total (est.)',
        bytesFormatBinary(ledger.gpuBytes),
        debugMenuMemoryPercent(ledger.gpuBytes, ledger.vramBudgetBytes),
      ],
      ['Unused pool (est.)', bytesFormatBinary(ledger.pooledGpuBytes), 'freed after 30 s or when over budget'],
      ['Evictions', String(ledger.evictions), 'levels dropped so far'],
    ],
  };
}

/**
 * The renderers section (three.js's own counts).
 *
 * @param renderers Renderer counts.
 * @returns Section.
 */
function debugMenuMemoryRenderers(renderers: DebugMenuMemoryInput['renderers']): DebugMenuMemorySection {
  return {
    title: 'Renderers (renderer.info.memory)',
    rows:
      renderers.length === 0
        ? [['No renderer', '', '']]
        : renderers.map((renderer) => [
            renderer.label,
            `${renderer.textures} textures`,
            `${renderer.geometries} geometries · ${renderer.programs} programs`,
          ]),
  };
}

/**
 * The browser section: JS heap and storage, where the browser reports them.
 *
 * @param heap Performance.memory figures, or null.
 * @param storage Storage estimate, or null.
 * @returns Section.
 */
function debugMenuMemoryBrowser(
  heap: DebugMenuMemoryInput['heap'],
  storage: DebugMenuMemoryInput['storage'],
): DebugMenuMemorySection {
  const heapRow: [string, string, string] =
    heap === null
      ? ['JS heap', 'n/a', 'performance.memory is Chromium only']
      : [
          'JS heap used',
          bytesFormatBinary(heap.used),
          `of ${bytesFormatBinary(heap.total)} allocated, limit ${bytesFormatBinary(heap.limit)}; excludes decoded images and GPU memory`,
        ];
  const storageRow: [string, string, string] =
    storage === null
      ? ['Storage', 'n/a', 'navigator.storage.estimate() not available']
      : ['Storage used', bytesFormatBinary(storage.usage), `of ${bytesFormatBinary(storage.quota)} quota`];
  return { title: 'Browser', rows: [heapRow, storageRow] };
}
