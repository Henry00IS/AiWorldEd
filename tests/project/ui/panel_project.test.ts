import { THUMBNAIL_GRID_THUMB_CLASS } from '@/ui/thumbnail_grid/thumbnail_grid.js';
import { VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS } from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelProject, type PanelProjectHandlers, type PanelProjectState } from '@/project/ui/panel_project.js';
import { projectSnapshotEmpty } from '@/project/scan/project_snapshot.js';
import { panelProjectSnapshotOf } from './panel_project_test_utils.js';
import { PANEL_PROJECT_PATH_DRAG_TYPE } from '@/project/ui/panel_project_drag.js';
import { PANEL_PROJECT_VIRTUAL_CURVES } from '@/project/ui/panel_project_view.js';

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
    const open = root.querySelector<HTMLButtonElement>('button[aria-label="Open Project Folder"]');
    expect(open?.style.display).toBe('');
    open?.click();
    expect(handlers.onOpen).toHaveBeenCalled();
    panel.render({ ...openState([]), name: null, pending: 'game', snapshot: projectSnapshotEmpty() });
    const reopen = root.querySelector<HTMLButtonElement>('button[aria-label="Reopen Project Folder"]');
    expect(reopen?.textContent).toContain('game');
    reopen?.click();
    expect(handlers.onReopen).toHaveBeenCalled();
  });

  it('shows the folder tree, files and thumbnails of an open project', () => {
    const { panel, root } = panelCreate();
    panel.render(openState(['textures/brick.png', 'textures/stone.png', 'maps/start.json']));
    expect(root.querySelector<HTMLButtonElement>('button[aria-label="Open Project Folder"]')?.style.display).toBe(
      'none',
    );
    expect([...root.querySelectorAll('[data-folder-path]')].map((row) => row.getAttribute('data-folder-path'))).toEqual(
      ['', 'maps', 'textures', '//Curves'],
    );
    root.querySelector<HTMLElement>('[data-folder-path="textures"]')?.click();
    const tiles = root.querySelectorAll<HTMLElement>('[data-file-path]');
    expect(tiles.length).toBe(2);
    expect((tiles[0]?.firstElementChild as HTMLElement).dataset['thumbnailUrl']).toBe('blob:brick');
    expect(root.textContent).toContain('live (file system observer)');
  });

  it("scrolls the folder tree and the files with the outliner's custom scrollbar, like the texture browser", () => {
    const { panel, root } = panelCreate();
    panel.render(openState(['textures/brick.png']));
    for (const [part, selector] of [
      ['tree', '[role="tree"]'],
      ['grid', '.pp-panel-grid'],
    ] as const) {
      const scroller = root.querySelector<HTMLElement>(selector)!;
      expect(scroller.classList.contains(VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS)).toBe(true);
      // The bar sits in the scroller's host, next to it.
      expect(scroller.parentElement?.classList.contains(`pp-panel-${part}-host`)).toBe(true);
      expect(scroller.parentElement?.children.length).toBe(2);
    }
    root.querySelector<HTMLElement>('[data-folder-path="textures"]')?.click();
    const thumb = root.querySelector<HTMLElement>('[data-file-path] > :first-child')!;
    expect(thumb.classList.contains(THUMBNAIL_GRID_THUMB_CLASS)).toBe(true);
  });

  it('starts with only the root expanded and keeps collapsed and expanded folders across redraws', () => {
    const { panel, root } = panelCreate();
    const folders = () =>
      [...root.querySelectorAll('[data-folder-path]')].map((row) => row.getAttribute('data-folder-path'));
    const arrow = (path: string) => root.querySelector<HTMLElement>(`[data-folder-path="${path}"] > *`);
    const icon = (path: string) =>
      root.querySelector<HTMLElement>(`[data-folder-path="${path}"] [data-folder-icon]`)?.dataset['folderIcon'];
    panel.render(openState(['maps/a/start.aiworld', 'textures/brick.png']));
    expect(folders()).toEqual(['', 'maps', 'textures', '//Curves']);
    expect(arrow('')?.textContent).toBe('▶');
    expect(arrow('')?.style.transform).toBe('rotate(90deg)');
    expect(arrow('maps')?.style.transform).toBe('none');
    // Folders without subfolders and Curves outside a room: no arrow.
    for (const path of ['textures', '//Curves']) expect(arrow(path)?.textContent).toBe('');
    // Expanded folders show an open folder icon, every other folder a closed one.
    expect(['', 'maps', 'textures', '//Curves'].map(icon)).toEqual(['open', 'closed', 'closed', 'closed']);
    arrow('maps')?.click();
    expect(folders()).toEqual(['', 'maps', 'maps/a', 'textures', '//Curves']);
    expect(icon('maps')).toBe('open');
    expect(panel.folderSelected()).toBe('');
    panel.render(openState(['maps/a/start.aiworld', 'textures/brick.png', 'textures/stone.png']));
    expect(folders()).toEqual(['', 'maps', 'maps/a', 'textures', '//Curves']);
    arrow('')?.click();
    expect(folders()).toEqual(['', '//Curves']);
    expect(icon('')).toBe('closed');
    arrow('')?.click();
    expect(folders()).toEqual(['', 'maps', 'maps/a', 'textures', '//Curves']);
    // A file added in a new subfolder gives its parent an arrow right away, collapsed.
    panel.render(openState(['maps/a/start.aiworld', 'textures/brick.png', 'textures/old/rust.png']));
    expect(arrow('textures')?.textContent).toBe('▶');
    expect(folders()).not.toContain('textures/old');
  });

  it("lists a folder's subfolders first, sorted by name, then its files", () => {
    const { panel, root } = panelCreate();
    panel.render(openState(['maps/zeta/z.aiworld', 'maps/Alpha/a.aiworld', 'maps/beta/b.aiworld', 'maps/start.json']));
    panel.folderSelect('maps');
    const tiles = [
      ...root.querySelectorAll<HTMLElement>('.pp-panel-grid > [data-folder-tile], .pp-panel-grid > [data-file-path]'),
    ];
    expect(tiles.map((tile) => tile.dataset['folderTile'] ?? tile.dataset['filePath'])).toEqual([
      'maps/Alpha',
      'maps/beta',
      'maps/zeta',
      'maps/start.json',
    ]);
    expect(tiles[0]?.querySelector('[data-kind="folder"] svg')).not.toBeNull();
    expect(tiles[0]?.textContent).toBe('Alpha');
    expect(root.querySelector('.pp-panel-status')?.textContent).toContain('3 folders · 1 file');
  });

  it('shows the subfolders of a folder that holds no files instead of an empty panel', () => {
    const { panel, root } = panelCreate();
    panel.render(openState(['textures/wood/oak.png', 'textures/stone/granite.png']));
    panel.folderSelect('textures');
    expect(
      [...root.querySelectorAll<HTMLElement>('[data-folder-tile]')].map((tile) => tile.dataset['folderTile']),
    ).toEqual(['textures/stone', 'textures/wood']);
    expect(root.querySelector('.pp-panel-empty')).toBeNull();
  });

  it('opens a folder tile on double-click and Enter, selecting and revealing it in the tree', () => {
    const { panel, root } = panelCreate();
    panel.render(openState(['maps/a/deep/start.aiworld', 'textures/brick.png']));
    panel.folderSelect('maps');
    root
      .querySelector<HTMLElement>('[data-folder-tile="maps/a"]')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(panel.folderSelected()).toBe('maps/a');
    const treeRow = root.querySelector<HTMLElement>('[role="tree"] [data-folder-path="maps/a"]');
    expect(treeRow?.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('[role="tree"] [data-folder-path="maps"]')?.getAttribute('aria-expanded')).toBe('true');
    root
      .querySelector<HTMLElement>('[data-folder-tile="maps/a/deep"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(panel.folderSelected()).toBe('maps/a/deep');
    expect(root.querySelector('[role="tree"] [data-folder-path="maps/a/deep"]')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(root.querySelector('[data-file-path="maps/a/deep/start.aiworld"]')).not.toBeNull();
  });

  it('lists the folders the tree shows at the project root, Curves included, and opens Curves', () => {
    const { panel, root } = panelCreate();
    panel.render(openState(['maps/start.aiworld', 'textures/brick.png', 'AiWorldEd/Curves/ramp.aicurve']));
    panel.folderSelect('');
    const tiles = [...root.querySelectorAll<HTMLElement>('[data-folder-tile]')];
    expect(tiles.map((tile) => tile.textContent)).toEqual(['maps', 'textures', 'Curves']);
    expect(tiles.map((tile) => tile.dataset['folderTile'])).toEqual(['maps', 'textures', PANEL_PROJECT_VIRTUAL_CURVES]);
    expect(root.querySelector(`[role="tree"] [data-folder-path="${PANEL_PROJECT_VIRTUAL_CURVES}"]`)).not.toBeNull();
    tiles[2]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(root.querySelector('[data-file-path="AiWorldEd/Curves/ramp.aicurve"]')).not.toBeNull();
  });

  it("tells a room member the owner's textures are coming instead of showing an empty Curves folder", () => {
    const { panel, root } = panelCreate();
    const tiles = () => [...root.querySelectorAll<HTMLElement>('[data-folder-tile]')].map((tile) => tile.textContent);
    panel.render({ ...openState([]), room: true });
    panel.folderSelect('');
    expect(tiles()).toEqual([]);
    expect(root.querySelector('.pp-panel-empty')?.textContent).toBe(
      "The room owner's textures appear here as they arrive",
    );
    panel.render({ ...openState(['textures/brick.png']), room: true });
    expect(tiles()).toEqual(['textures']);
    const withCurve = panelProjectSnapshotOf(['textures/brick.png']);
    const curve = `${PANEL_PROJECT_VIRTUAL_CURVES}/Local/ramp.aicurve`;
    withCurve.directories.add(`${PANEL_PROJECT_VIRTUAL_CURVES}/Local`);
    withCurve.files.set(curve, {
      path: curve,
      name: 'ramp.aicurve',
      directory: `${PANEL_PROJECT_VIRTUAL_CURVES}/Local`,
      kind: 'curve',
      size: 10,
      lastModified: 1,
    });
    panel.render({ ...openState([]), snapshot: withCurve, room: true });
    expect(tiles()).toEqual(['textures', 'Curves']);
  });

  it('lists no folder tiles while searching', () => {
    const { panel, root } = panelCreate();
    panel.render(openState(['maps/a/start.aiworld', 'maps/b/start.aiworld']));
    panel.folderSelect('maps');
    panel.searchSet('start');
    expect(root.querySelectorAll('[data-folder-tile]').length).toBe(0);
    expect(root.querySelectorAll('[data-file-path]').length).toBe(2);
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
    expect(thumb.dataset['thumbnailUrl']).toBeUndefined();
    vi.mocked(handlers.thumbnail).mockReturnValue('blob:stone');
    panel.thumbnailsRefresh();
    expect(thumb.dataset['thumbnailUrl']).toBe('blob:stone');
  });

  it('shows curve files with a drawn thumbnail and lets every tile be dragged by its path', () => {
    const { panel, handlers, root } = panelCreate();
    vi.mocked(handlers.thumbnail).mockImplementation((record) => (record.kind === 'curve' ? 'data:curve' : null));
    panel.render(openState(['curves/doric.curve']));
    root.querySelector<HTMLElement>('[data-folder-path="curves"]')?.click();
    const tile = root.querySelector<HTMLElement>('[data-file-path="curves/doric.curve"]');
    if (!tile) throw new Error('Expected a curve tile');
    expect((tile.firstElementChild as HTMLElement).dataset['thumbnailUrl']).toContain('data:curve');
    expect(tile.draggable).toBe(true);
    const data = new Map<string, string>();
    const event = new Event('dragstart') as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: { setData: (type: string, value: string) => data.set(type, value), effectAllowed: 'none' },
    });
    tile.dispatchEvent(event);
    expect(data.get(PANEL_PROJECT_PATH_DRAG_TYPE)).toBe('curves/doric.curve');
  });

  it('keeps a virtual folder selected across renders, with tile menus and folder drops', () => {
    const { panel, handlers, root } = panelCreate();
    const state = openState(['AiWorldEd/Curves/Ogee.aicurve']);
    state.snapshot.directories.add('//Curves/Local');
    const local = { path: '//Curves/Local/Own.aicurve', name: 'Own.aicurve', directory: '//Curves/Local' };
    state.snapshot.files.set(local.path, { ...local, kind: 'curve', size: 1, lastModified: 1 });
    const copy = vi.fn();
    handlers.menu = (record) => (record.path === local.path ? [{ label: 'Copy to Remote', callback: copy }] : []);
    handlers.folderDropAccepts = (folder) => folder === '//Curves/Local';
    handlers.folderDrop = vi.fn();
    panel.render(state);
    root.querySelector<HTMLElement>('[data-folder-path="//Curves"]')?.click();
    panel.render(state);
    expect(panel.folderSelected()).toBe('//Curves');
    expect(root.querySelector('[data-file-path="AiWorldEd/Curves/Ogee.aicurve"]')).not.toBeNull();
    const ogee = root.querySelector<HTMLElement>('[data-file-path="AiWorldEd/Curves/Ogee.aicurve"]');
    const quiet = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    ogee?.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);
    root.querySelector<HTMLElement>('[data-folder-path="//Curves/Local"]')?.click();
    const tile = root.querySelector<HTMLElement>(`[data-file-path="${local.path}"]`);
    const open = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    tile?.dispatchEvent(open);
    expect(open.defaultPrevented).toBe(true);
    const item = [...document.querySelectorAll<HTMLElement>('*')].find(
      (element) => element.textContent === 'Copy to Remote' && element.children.length === 0,
    );
    expect(item).toBeDefined();
    const drop = (folder: string) => {
      const event = new Event('drop', { cancelable: true }) as DragEvent;
      Object.defineProperty(event, 'dataTransfer', {
        value: { types: [PANEL_PROJECT_PATH_DRAG_TYPE], getData: () => '//Curves/Remote/Arch.aicurve' },
      });
      root.querySelector<HTMLElement>(`[data-folder-path="${folder}"]`)?.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(drop('//Curves')).toBe(false);
    expect(drop('//Curves/Local')).toBe(true);
    expect(handlers.folderDrop).toHaveBeenCalledWith('//Curves/Local', '//Curves/Remote/Arch.aicurve');
    panel.dispose();
  });
});
