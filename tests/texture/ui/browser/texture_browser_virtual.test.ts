import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextureBrowser } from '@/texture/ui/browser/texture_browser.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { THUMBNAIL_GRID_THUMB_CLASS } from '@/ui/thumbnail_grid/thumbnail_grid.js';
import {
  thumbnailGridTestLayoutInstall,
  type ThumbnailGridTestLayout,
} from '../../../ui/thumbnail_grid/thumbnail_grid_test_layout.js';

/**
 * Builds entries.
 *
 * @param count Entries.
 * @param prefix File name prefix.
 * @returns Entries named prefix_0000.png….
 */
function entriesOf(count: number, prefix = 'tex'): TextureBrowserEntry[] {
  return Array.from({ length: count }, (_, index) => {
    const name = `${prefix}_${String(index).padStart(4, '0')}.png`;
    return {
      id: `walls/${name}`,
      displayName: `${prefix}_${String(index).padStart(4, '0')}`,
      fileName: name,
      relativePath: `walls/${name}`,
      previewObjectUrl: `blob:${prefix}${index}`,
      mimeType: 'image/png',
      byteSize: 10,
      sourceFile: new File(['x'], name, { type: 'image/png' }),
    };
  });
}

describe('TextureBrowser virtual grid', () => {
  const layout: ThumbnailGridTestLayout = { width: 572, height: 300, tilePx: 100, headingPx: 30 };
  let browser: TextureBrowser;
  let grid: HTMLElement;
  let onSelectTexture: ReturnType<typeof vi.fn<(id: string) => void>>;

  /** Ids of the tiles that exist, in DOM order. */
  const built = (): string[] =>
    [...grid.querySelectorAll<HTMLElement>('[data-entry-id]')].map((tile) => tile.dataset['entryId']!);
  /** Columns of the grid as the thumbnail grid laid them out. */
  const columns = (): number => Number(/repeat\((\d+),/.exec(grid.style.gridTemplateColumns)?.[1]);
  /** Distance between the tops of two rows. */
  const rowPx = (): number => layout.tilePx + 8;
  /** Scroll offset of the top of a row. */
  const rowTop = (row: number): number => 8 + row * rowPx();

  beforeEach(() => {
    FloatingPanelStack.resetForTests();
    Object.assign(layout, { width: 572, height: 300, tilePx: 100, headingPx: 30 });
    const attach = thumbnailGridTestLayoutInstall(layout);
    const host = document.createElement('div');
    document.body.appendChild(host);
    onSelectTexture = vi.fn<(id: string) => void>();
    browser = new TextureBrowser(host, { onOpenProject: vi.fn(), onSelectTexture });
    browser.show();
    grid = browser.getGridElement();
    attach(grid);
  });
  afterEach(() => {
    browser.dispose();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('builds only the tiles in or near view of a long list and keeps the full height', () => {
    browser.setEntries(entriesOf(1000), null, 'game');
    const cols = columns();
    expect(cols).toBe(5);
    // 300 px show 3 rows; 2 more are built below them (the overscan) → 5 rows of 5 tiles
    expect(built()).toHaveLength(cols * 5);
    expect(built()[0]).toBe('walls/tex_0000.png');
    expect(grid.querySelectorAll('[data-thumbnail-spacer]').length).toBe(1);
    const spacer = grid.querySelector<HTMLElement>('[data-thumbnail-spacer]')!;
    const rows = Math.ceil(1000 / cols);
    const builtRows = built().length / cols;
    // built rows, the gap before the spacer, the spacer: as tall as every row built
    expect(parseFloat(spacer.style.height) + builtRows * rowPx()).toBeCloseTo(rows * rowPx() - 8, 5);
  });

  it('builds the tiles of another row range when the grid scrolls, and releases the ones that left', () => {
    browser.setEntries(entriesOf(1000), null, 'game');
    const firstTile = grid.querySelector<HTMLElement>('[data-entry-id="walls/tex_0000.png"]')!;
    const thumb = firstTile.querySelector<HTMLElement>(`.${THUMBNAIL_GRID_THUMB_CLASS}`)!;
    expect(thumb.dataset['thumbnailUrl']).toBe('blob:tex0');
    grid.scrollTop = rowTop(100);
    // rows 100-102 are in view, rows 98 and 99 are the overscan above
    expect(built()[0]).toBe(`walls/tex_${String(98 * 5).padStart(4, '0')}.png`);
    expect(grid.querySelector('[data-entry-id="walls/tex_0000.png"]')).toBeNull();
    // Nothing holds the image of a tile that is gone: no URL, no drawing, not in the DOM.
    expect(firstTile.isConnected).toBe(false);
    expect(thumb.dataset['thumbnailUrl']).toBeUndefined();
    expect(thumb.querySelector('canvas')).toBeNull();
    // Scrolling back builds a new tile that shows the image again.
    grid.scrollTop = 0;
    const again = grid.querySelector<HTMLElement>('[data-entry-id="walls/tex_0000.png"]')!;
    expect(again).not.toBe(firstTile);
    expect(again.querySelector<HTMLElement>(`.${THUMBNAIL_GRID_THUMB_CLASS}`)!.dataset['thumbnailUrl']).toBe(
      'blob:tex0',
    );
  });

  it('shows the selection of a tile that was off-screen when it is selected, once it is built', () => {
    browser.setEntries(entriesOf(1000), null, 'game');
    browser.setSelectedId('walls/tex_0500.png');
    expect(grid.querySelectorAll('[aria-selected="true"]').length).toBe(0);
    grid.scrollTop = rowTop(100);
    const selected = [...grid.querySelectorAll<HTMLElement>('[aria-selected="true"]')];
    expect(selected.map((tile) => tile.dataset['entryId'])).toEqual(['walls/tex_0500.png']);
    // Built tiles still select by click, and the other tiles are not selected.
    grid.querySelector<HTMLElement>('[data-entry-id="walls/tex_0501.png"]')!.click();
    expect(onSelectTexture).toHaveBeenCalledWith('walls/tex_0501.png');
    browser.setSelectedId('walls/tex_0501.png');
    expect(
      [...grid.querySelectorAll<HTMLElement>('[aria-selected="true"]')].map((tile) => tile.dataset['entryId']),
    ).toEqual(['walls/tex_0501.png']);
  });

  it('keeps the selection when the list is rebuilt', () => {
    browser.setEntries(entriesOf(1000), 'walls/tex_0003.png', 'game');
    expect(grid.querySelector('[data-entry-id="walls/tex_0003.png"]')!.getAttribute('aria-selected')).toBe('true');
    browser.setEntries([...entriesOf(1000)].reverse(), 'walls/tex_0003.png', 'game');
    grid.scrollTop = rowTop(Math.floor(996 / 5));
    expect(grid.querySelector('[data-entry-id="walls/tex_0003.png"]')!.getAttribute('aria-selected')).toBe('true');
  });

  it('shows renamed entries, added and removed ones, in the list order', () => {
    const entries = entriesOf(1000);
    browser.setEntries(entries, null, 'game');
    entries[2]!.displayName = 'renamed';
    entries[700]!.displayName = 'renamed far';
    browser.setEntries(entries, null, 'game');
    const name = (id: string): string | undefined =>
      grid.querySelector(`[data-entry-id="${id}"] .tb-browser-name`)?.textContent ?? undefined;
    expect(name('walls/tex_0002.png')).toBe('renamed');
    grid.scrollTop = rowTop(140);
    expect(name('walls/tex_0700.png')).toBe('renamed far');
    // Remove the entry in view and add others before it: the order follows the list.
    const without = entries.filter((entry) => entry.id !== 'walls/tex_0700.png');
    browser.setEntries([...entriesOf(3, 'aaa'), ...without], null, 'game');
    expect(grid.querySelector('[data-entry-id="walls/tex_0700.png"]')).toBeNull();
    const ids = built();
    expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : 1)));
  });

  it('keeps the tiles in view in place when textures are added above them', () => {
    const entries = entriesOf(1000);
    browser.setEntries(entries, null, 'game');
    grid.scrollTop = rowTop(50) + 20;
    const topId = built().find((id) => id === 'walls/tex_0250.png')!;
    expect(topId).toBeDefined();
    // 10 new textures are two rows of five above.
    browser.setEntries([...entriesOf(10, 'aaa'), ...entries], null, 'game');
    expect(grid.scrollTop).toBe(rowTop(52) + 20);
    expect(built()).toContain('walls/tex_0250.png');
  });

  it('lists the textures that match the search, and says so when none do', () => {
    browser.setEntries(entriesOf(1000), null, 'game');
    grid.scrollTop = rowTop(100);
    const search = browser.getRootElement().querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'tex_09';
    search.dispatchEvent(new Event('input'));
    grid.scrollTop = 0; // a browser clamps the offset into the shorter list
    // 100 matches (tex_0900…tex_0999), only the first rows are built.
    expect(built()).toHaveLength(columns() * 5);
    expect(built()[0]).toBe('walls/tex_0900.png');
    search.value = 'nothing-like-this';
    search.dispatchEvent(new Event('input'));
    expect(built()).toEqual([]);
    expect(grid.querySelector('[data-search-empty]')?.textContent).toContain('Nothing matches');
    search.value = '';
    search.dispatchEvent(new Event('input'));
    expect(grid.querySelector('[data-search-empty]')).toBeNull();
    expect(built().length).toBeGreaterThan(0);
  });

  it('lists missing textures last under their heading, only when one matches', () => {
    browser.setEntries(entriesOf(20), null, 'game', ['gone/a.png', 'gone/b.png']);
    grid.scrollTop = 1e6;
    expect(grid.querySelector('[data-missing-heading]')).not.toBeNull();
    expect(grid.querySelectorAll('[data-missing="true"]').length).toBe(2);
    expect(built().at(-1)).toBe('gone/b.png');
    const search = browser.getRootElement().querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'tex_0003';
    search.dispatchEvent(new Event('input'));
    expect(grid.querySelector('[data-missing-heading]')).toBeNull();
    expect(built()).toEqual(['walls/tex_0003.png']);
  });

  it('builds other rows and columns when the panel is resized', () => {
    browser.setEntries(entriesOf(1000), null, 'game');
    expect(built()).toHaveLength(25);
    layout.width = 1000;
    layout.height = 600;
    window.dispatchEvent(new Event('resize'));
    expect(columns()).toBe(9);
    // 600 px: 6 rows in view + 2 overscan below, 9 tiles each
    expect(built()).toHaveLength(9 * 8);
    layout.width = 300;
    layout.height = 200;
    window.dispatchEvent(new Event('resize'));
    expect(columns()).toBe(2);
    // 200 px: 2 rows in view + 2 overscan below, 2 tiles each
    expect(built()).toHaveLength(2 * 4);
    expect(built()[0]).toBe('walls/tex_0000.png');
  });
});
