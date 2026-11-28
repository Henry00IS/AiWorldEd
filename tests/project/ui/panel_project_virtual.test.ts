import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelProject, type PanelProjectHandlers, type PanelProjectState } from '@/project/ui/panel_project.js';
import { panelProjectSnapshotOf } from './panel_project_test_utils.js';
import { THUMBNAIL_GRID_THUMB_CLASS } from '@/ui/thumbnail_grid/thumbnail_grid.js';
import {
  thumbnailGridTestLayoutInstall,
  type ThumbnailGridTestLayout,
} from '../../ui/thumbnail_grid/thumbnail_grid_test_layout.js';

/**
 * Builds an open-project state.
 *
 * @param paths File paths.
 * @returns State.
 */
function openState(paths: readonly string[]): PanelProjectState {
  return {
    name: 'game',
    pending: null,
    snapshot: panelProjectSnapshotOf(paths),
    notice: null,
    watchMode: 'observer',
    writable: true,
  };
}

/**
 * Makes paths.
 *
 * @param folder Folder.
 * @param count Number of files.
 * @param prefix File name prefix.
 * @returns Paths.
 */
function pathsOf(folder: string, count: number, prefix = 'img'): string[] {
  return Array.from({ length: count }, (_, index) => `${folder}/${prefix}_${String(index).padStart(4, '0')}.png`);
}

describe('PanelProject virtual grid', () => {
  const layout: ThumbnailGridTestLayout = { width: 572, height: 300, tilePx: 100, headingPx: 30 };
  let panel: PanelProject;
  let grid: HTMLElement;
  let thumbnail: ReturnType<typeof vi.fn<PanelProjectHandlers['thumbnail']>>;
  let onActivate: ReturnType<typeof vi.fn<PanelProjectHandlers['onActivate']>>;

  /** Paths and folder paths of the tiles that exist, in DOM order. */
  const built = (): string[] =>
    [...grid.querySelectorAll<HTMLElement>('[data-file-path], [data-folder-tile]')].map(
      (tile) => tile.dataset['filePath'] ?? tile.dataset['folderTile']!,
    );
  const columns = (): number => Number(/repeat\((\d+),/.exec(grid.style.gridTemplateColumns)?.[1]);
  const rowPx = (): number => layout.tilePx + 6;
  const rowTop = (row: number): number => 8 + row * rowPx();

  beforeEach(() => {
    Object.assign(layout, { width: 572, height: 300, tilePx: 100, headingPx: 30 });
    const attach = thumbnailGridTestLayoutInstall(layout);
    const host = document.createElement('div');
    document.body.appendChild(host);
    thumbnail = vi.fn<PanelProjectHandlers['thumbnail']>((record) => `blob:${record.path}`);
    onActivate = vi.fn<PanelProjectHandlers['onActivate']>();
    panel = new PanelProject(host, { onOpen: vi.fn(), onReopen: vi.fn(), onClose: vi.fn(), onActivate, thumbnail });
    panel.show();
    grid = panel.getRootElement().querySelector<HTMLElement>('.pp-panel-grid')!;
    attach(grid);
  });
  afterEach(() => {
    panel.dispose();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('builds only the tiles in or near view, and asks for previews of those only', () => {
    panel.render(openState(pathsOf('textures', 500)));
    panel.folderSelect('textures');
    expect(columns()).toBe(6);
    // 300 px: 3 rows in view, 2 more of overscan below
    expect(built()).toHaveLength(6 * 5);
    expect(built()[0]).toBe('textures/img_0000.png');
    expect(thumbnail.mock.calls.every(([record]) => built().includes(record.path))).toBe(true);
    expect(thumbnail.mock.calls.some(([record]) => record.path === 'textures/img_0400.png')).toBe(false);
    expect(panel.getRootElement().textContent).toContain('500 files');
  });

  it('builds other rows when scrolled and releases the images of tiles that left', () => {
    panel.render(openState(pathsOf('textures', 500)));
    panel.folderSelect('textures');
    const first = grid.querySelector<HTMLElement>('[data-file-path="textures/img_0000.png"]')!;
    const thumb = first.querySelector<HTMLElement>(`.${THUMBNAIL_GRID_THUMB_CLASS}`)!;
    expect(thumb.dataset['thumbnailUrl']).toBe('blob:textures/img_0000.png');
    grid.scrollTop = rowTop(40);
    expect(built()[0]).toBe(`textures/img_${String(38 * 6).padStart(4, '0')}.png`);
    expect(first.isConnected).toBe(false);
    expect(thumb.dataset['thumbnailUrl']).toBeUndefined();
    expect(thumb.querySelector('canvas')).toBeNull();
    // A tile built later asks for its preview at that moment.
    expect(thumbnail.mock.calls.some(([record]) => record.path === 'textures/img_0240.png')).toBe(true);
    grid.scrollTop = 0;
    expect(grid.querySelector('[data-file-path="textures/img_0000.png"]')).not.toBe(first);
  });

  it('lists subfolders first, then files by name, like before', () => {
    panel.render(openState([...pathsOf('maps', 40, 'm'), 'maps/zeta/z.aiworld', 'maps/Alpha/a.aiworld']));
    panel.folderSelect('maps');
    const ids = built();
    expect(ids.slice(0, 2)).toEqual(['maps/Alpha', 'maps/zeta']);
    expect(ids[2]).toBe('maps/m_0000.png');
    expect(grid.querySelectorAll('[data-folder-tile]').length).toBe(2);
  });

  it('shows the folder you navigate to, with its own tiles and the scroll offset kept in range', () => {
    panel.render(openState([...pathsOf('a', 300, 'a'), ...pathsOf('b', 12, 'b')]));
    panel.folderSelect('a');
    grid.scrollTop = rowTop(30);
    panel.folderSelect('b');
    expect(built()).toEqual(pathsOf('b', 12, 'b'));
    expect(grid.querySelectorAll('[data-thumbnail-spacer]').length).toBe(0);
    panel.folderSelect('a');
    grid.scrollTop = 0;
    expect(built()[0]).toBe('a/a_0000.png');
    expect(panel.getRootElement().textContent).toContain('300 files');
  });

  it('follows files added, removed and renamed live (file watching and room sync)', () => {
    panel.render(openState(pathsOf('t', 300)));
    panel.folderSelect('t');
    grid.scrollTop = rowTop(20);
    const before = built();
    // a file appears at the top of the order, another disappears, one is renamed
    const next = pathsOf('t', 300).filter((path) => path !== 't/img_0121.png');
    next[next.indexOf('t/img_0122.png')] = 't/zz_renamed.png';
    next.unshift('t/aaa_new.png');
    panel.render(openState(next));
    const ids = built();
    expect(ids).not.toEqual(before);
    expect(ids).not.toContain('t/img_0121.png');
    const sorted = [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    expect(ids).toEqual(sorted);
    grid.scrollTop = rowTop(60);
    expect(built()).toContain('t/zz_renamed.png');
    expect(built()).not.toContain('t/img_0122.png');
    grid.scrollTop = 0;
    expect(built()[0]).toBe('t/aaa_new.png');
  });

  it('shows previews that arrive later in tiles in view, and in off-screen ones once built', () => {
    const ready = new Set<string>();
    thumbnail.mockImplementation((record) => (ready.has(record.path) ? `blob:${record.path}` : null));
    panel.render(openState(pathsOf('t', 300)));
    panel.folderSelect('t');
    const thumbOf = (path: string): HTMLElement | null =>
      grid.querySelector<HTMLElement>(`[data-file-path="${path}"] .${THUMBNAIL_GRID_THUMB_CLASS}`);
    expect(thumbOf('t/img_0001.png')?.dataset['thumbnailUrl']).toBeUndefined();
    ready.add('t/img_0001.png');
    ready.add('t/img_0250.png');
    panel.thumbnailsRefresh();
    expect(thumbOf('t/img_0001.png')?.dataset['thumbnailUrl']).toBe('blob:t/img_0001.png');
    expect(thumbOf('t/img_0250.png')).toBeNull();
    grid.scrollTop = rowTop(41);
    expect(thumbOf('t/img_0250.png')?.dataset['thumbnailUrl']).toBe('blob:t/img_0250.png');
  });

  it('keeps the selected tile selected across scrolling and redraws', () => {
    panel.render(openState(pathsOf('t', 300)));
    panel.folderSelect('t');
    grid.scrollTop = rowTop(20);
    grid.querySelector<HTMLElement>('[data-file-path="t/img_0121.png"]')!.click();
    const selected = (): string[] =>
      [...grid.querySelectorAll<HTMLElement>('[aria-selected="true"]')].map((tile) => tile.dataset['filePath']!);
    expect(selected()).toEqual(['t/img_0121.png']);
    grid.scrollTop = 0;
    expect(selected()).toEqual([]);
    grid.scrollTop = rowTop(20);
    expect(selected()).toEqual(['t/img_0121.png']);
    panel.render(openState(pathsOf('t', 300)));
    expect(selected()).toEqual(['t/img_0121.png']);
  });

  it('searches the whole project and lists the matches', () => {
    panel.render(openState([...pathsOf('a', 200, 'x'), ...pathsOf('b', 200, 'y')]));
    panel.searchSet('y_01');
    grid.scrollTop = 0;
    expect(built()).toHaveLength(6 * 5);
    expect(built()[0]).toBe('b/y_0100.png');
    expect(panel.getRootElement().textContent).toContain('100 files');
    panel.searchSet('nothing-like-this');
    expect(built()).toEqual([]);
    expect(panel.getRootElement().textContent).toContain('No matching files');
    panel.searchSet('');
    expect(built().length).toBeGreaterThan(0);
  });

  it('keeps activation and dragging on built tiles', () => {
    panel.render(openState(pathsOf('t', 300)));
    panel.folderSelect('t');
    grid.scrollTop = rowTop(30);
    const tile = grid.querySelector<HTMLElement>('[data-file-path="t/img_0180.png"]')!;
    expect(tile.draggable).toBe(true);
    tile.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ path: 't/img_0180.png' }));
  });

  it('builds other rows and columns when the panel is resized', () => {
    panel.render(openState(pathsOf('t', 500)));
    panel.folderSelect('t');
    expect(built()).toHaveLength(6 * 5);
    layout.width = 1000;
    layout.height = 600;
    window.dispatchEvent(new Event('resize'));
    const cols = columns();
    expect(cols).toBeGreaterThan(6);
    // 600 px = 6 rows in view (106 px apart) + 2 overscan below
    expect(built()).toHaveLength(cols * 8);
    layout.width = 300;
    layout.height = 200;
    window.dispatchEvent(new Event('resize'));
    expect(columns()).toBeLessThan(cols);
    expect(built()[0]).toBe('t/img_0000.png');
  });
});
