import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelProject, type PanelProjectHandlers, type PanelProjectState } from '@/project/ui/panel_project.js';
import { projectSnapshotEmpty } from '@/project/scan/project_snapshot.js';
import { panelProjectSnapshotOf } from './panel_project_test_utils.js';

/**
 * Builds a project panel with spy handlers.
 *
 * @returns Panel, handlers and host.
 */
function panelCreate() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const handlers: PanelProjectHandlers = {
    onOpen: vi.fn(),
    onReopen: vi.fn(),
    onClose: vi.fn(),
    onActivate: vi.fn(),
    thumbnail: vi.fn((record) => (record.name === 'brick.png' ? 'blob:brick' : null)),
  };
  const panel = new PanelProject(host, handlers);
  panel.show();
  return { panel, handlers, root: panel.getRootElement() };
}

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

describe('PanelProject', () => {
  afterEach(() => document.body.replaceChildren());

  it('offers to open a folder when no project is open', () => {
    const { panel, handlers, root } = panelCreate();
    const open = root.querySelector<HTMLButtonElement>('button[aria-label="Open project folder"]');
    expect(open?.style.display).toBe('');
    open?.click();
    expect(handlers.onOpen).toHaveBeenCalled();
    panel.render({ ...openState([]), name: null, pending: 'game', snapshot: projectSnapshotEmpty() });
    const reopen = root.querySelector<HTMLButtonElement>('button[aria-label="Reopen project folder"]');
    expect(reopen?.textContent).toContain('game');
    reopen?.click();
    expect(handlers.onReopen).toHaveBeenCalled();
  });

  it('shows the folder tree, files and thumbnails of an open project', () => {
    const { panel, root } = panelCreate();
    panel.render(openState(['textures/brick.png', 'textures/stone.png', 'maps/start.json']));
    expect(root.querySelector<HTMLButtonElement>('button[aria-label="Open project folder"]')?.style.display).toBe(
      'none',
    );
    expect([...root.querySelectorAll('[data-folder-path]')].map((row) => row.getAttribute('data-folder-path'))).toEqual(
      ['', 'maps', 'textures'],
    );
    root.querySelector<HTMLElement>('[data-folder-path="textures"]')?.click();
    const tiles = root.querySelectorAll<HTMLElement>('[data-file-path]');
    expect(tiles.length).toBe(2);
    expect((tiles[0]?.firstElementChild as HTMLElement).style.backgroundImage).toContain('blob:brick');
    expect(root.textContent).toContain('live (file system observer)');
  });

  it('opens a file on double-click and Enter', () => {
    const { panel, handlers, root } = panelCreate();
    panel.render(openState(['maps/start.json']));
    panel.folderSelect('maps');
    const tile = root.querySelector<HTMLElement>('[data-file-path="maps/start.json"]');
    tile?.click();
    expect(tile?.getAttribute('aria-selected')).toBe('true');
    tile?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    tile?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(handlers.onActivate).toHaveBeenCalledTimes(2);
  });

  it('searches across folders and falls back to the root when a folder disappears', () => {
    const { panel, root } = panelCreate();
    panel.render(openState(['a/brick.png', 'b/brick_dark.png', 'b/stone.png']));
    panel.searchSet('brick');
    expect(root.querySelectorAll('[data-file-path]').length).toBe(2);
    panel.folderSelect('b');
    panel.render(openState(['a/brick.png']));
    expect(panel.folderSelected()).toBe('');
  });

  it('fills in thumbnails that load later', () => {
    const { panel, handlers, root } = panelCreate();
    panel.render(openState(['stone.png']));
    const thumb = root.querySelector<HTMLElement>('[data-file-path="stone.png"]')?.firstElementChild as HTMLElement;
    expect(thumb.style.backgroundImage).toBe('');
    vi.mocked(handlers.thumbnail).mockReturnValue('blob:stone');
    panel.thumbnailsRefresh();
    expect(thumb.style.backgroundImage).toContain('blob:stone');
  });
});
