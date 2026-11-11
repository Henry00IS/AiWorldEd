import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { textureSourceBlocked, textureSourceGateSet } from '@/texture/library/texture_source_gate.js';
import {
  CONTROLLER_PROJECT_EDITOR_LOCAL_NOTICE,
  CONTROLLER_PROJECT_EDITOR_ROOM_NOTICE,
  CONTROLLER_PROJECT_EDITOR_UNSUPPORTED,
  ControllerProjectEditor,
} from '@/project/host/controller_project_editor.js';
import {
  ProjectHostMemoryStorage,
  projectHostAutosaveCreate,
  projectHostControllerCreate,
  projectHostFakeCreate,
  projectHostFolderCreate,
} from './project_host_test_utils.js';
import {
  CurveLibraryExistsError,
  curveLibrarySource,
  curveLibrarySourceSet,
  type CurveLibrarySource,
} from '@/curve/library/curve_library.js';
import { curveFileWrite } from '@/curve/model/curve_file.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';

/**
 * Builds the editor controller over a mock project.
 *
 * @param answers Confirm answers.
 * @returns Fixture parts.
 */
function editorCreate(answers: boolean[] = [], gate: () => string | null = () => null) {
  const fake = projectHostFakeCreate(answers);
  const { root, picker } = projectHostFolderCreate();
  const { project, store } = projectHostControllerCreate(fake.library, picker, gate);
  const autosave = projectHostAutosaveCreate(project);
  const editor = new ControllerProjectEditor(fake.host, { project, autosave, storage: new ProjectHostMemoryStorage() });
  const panelRoot = editor.panel.getRootElement();
  return { ...fake, root, project, store, autosave, editor, panelRoot };
}

/**
 * Waits for queued promises and timers to settle.
 *
 * @param ms Extra wait.
 */
async function settle(ms = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ControllerProjectEditor', () => {
  afterEach(() => {
    textureSourceGateSet(null);
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('explains the fallback when the browser has no directory picker', () => {
    const { editor, panelRoot } = editorCreate();
    expect(panelRoot.textContent).toContain(CONTROLLER_PROJECT_EDITOR_UNSUPPORTED);
    editor.dispose();
  });

  it('opens a project, lists its files and drops the notice', async () => {
    const { editor, panelRoot, library } = editorCreate();
    expect(await editor.openOrReopen()).toBe(true);
    await settle();
    expect(panelRoot.textContent).not.toContain(CONTROLLER_PROJECT_EDITOR_UNSUPPORTED);
    expect(panelRoot.querySelector('[data-folder-path="textures"]')).not.toBeNull();
    expect(library.getEntryById('textures/brick.png')).not.toBeNull();
    editor.dispose();
  });

  it('selects textures and opens scenes on activation', async () => {
    const { editor, panelRoot, host } = editorCreate();
    await editor.openOrReopen();
    editor.panel.show();
    editor.panel.folderSelect('textures');
    panelRoot.querySelector('[data-file-path="textures/brick.png"]')?.dispatchEvent(new MouseEvent('dblclick'));
    expect(host.textureSelect).toHaveBeenCalledWith('textures/brick.png');
    editor.panel.folderSelect('maps');
    panelRoot.querySelector('[data-file-path="maps/start.json"]')?.dispatchEvent(new MouseEvent('dblclick'));
    await settle();
    expect(host.sceneLoad).toHaveBeenCalledWith(expect.any(Blob), 'start.json');
    editor.dispose();
  });

  it('adds a double-clicked model in front of the view, and at its original location from its menu', async () => {
    const { editor, panelRoot, host } = editorCreate();
    await editor.openOrReopen();
    editor.panel.show();
    editor.panel.folderSelect('models');
    const tile = () => panelRoot.querySelector('[data-file-path="models/crate.obj"]');
    tile()?.dispatchEvent(new MouseEvent('dblclick'));
    await settle();
    expect(host.objImport).toHaveBeenLastCalledWith('v 0 0 0', 'crate.obj', 'view');
    tile()?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const item = [...document.querySelectorAll<HTMLElement>('*')].find(
      (element) => element.children.length === 0 && element.textContent === 'Add at Original Location',
    );
    expect(item).toBeDefined();
    item?.click();
    await settle();
    expect(host.objImport).toHaveBeenLastCalledWith('v 0 0 0', 'crate.obj', 'original');
    editor.dispose();
  });

  it('feeds history changes to the autosave and flushes before closing', async () => {
    const { editor, autosave, historyFire, project } = editorCreate();
    const changed = vi.spyOn(autosave, 'changed');
    const flush = vi.spyOn(autosave, 'flush');
    editor.start();
    await editor.openOrReopen();
    historyFire();
    expect(changed).toHaveBeenCalled();
    editor.panel.getRootElement().querySelector<HTMLButtonElement>('button[aria-label="Close Project"]')?.click();
    await settle();
    expect(flush).toHaveBeenCalled();
    expect(project.fileSystem()).toBeNull();
    editor.dispose();
  });

  it('tells the autosave which project scene was loaded', async () => {
    const { editor, autosave, host } = editorCreate();
    const sceneSet = vi.spyOn(autosave, 'sceneSet');
    host.sceneLoad.mockImplementation(() => (editor.sceneLoaded(), true));
    await editor.openOrReopen();
    editor.panel.folderSelect('maps');
    editor.panel
      .getRootElement()
      .querySelector('[data-file-path="maps/start.json"]')
      ?.dispatchEvent(new MouseEvent('dblclick'));
    await settle();
    expect(sceneSet).toHaveBeenLastCalledWith('maps/start.json');
    editor.sceneLoaded();
    expect(sceneSet).toHaveBeenLastCalledWith(null);
    editor.dispose();
  });

  it('makes a snapshot when a level file opens or is saved', async () => {
    const { editor, autosave } = editorCreate();
    const snapshot = vi.spyOn(autosave, 'snapshot');
    await editor.levelOpened();
    await editor.levelSaved();
    expect(snapshot).toHaveBeenCalledTimes(2);
    editor.dispose();
  });

  it('also makes a snapshot of the room when the level is saved in a room', async () => {
    const fake = projectHostFakeCreate([]);
    const room = {
      name: 'Castle Jam',
      owner: false,
      store: vi.fn(),
      restore: vi.fn(),
      snapshot: vi.fn(async () => undefined),
    };
    const host = { ...fake.host, historyRoom: () => room };
    const { picker } = projectHostFolderCreate();
    const { project } = projectHostControllerCreate(fake.library, picker, () => null);
    const autosave = projectHostAutosaveCreate(project);
    const editor = new ControllerProjectEditor(host, { project, autosave, storage: new ProjectHostMemoryStorage() });
    await editor.levelOpened();
    expect(room.snapshot).not.toHaveBeenCalled();
    await editor.levelSaved();
    expect(room.snapshot).toHaveBeenCalledTimes(1);
    editor.dispose();
  });

  it('refreshes thumbnails after textures load', async () => {
    const { editor } = editorCreate();
    const refresh = vi.spyOn(editor.panel, 'thumbnailsRefresh');
    await editor.openOrReopen();
    await settle(150);
    expect(refresh).toHaveBeenCalled();
    editor.dispose();
  });

  it("shows the room owner's project read-only while in a room and the local project again after", async () => {
    const { editor, panelRoot, library, host, autosave, project } = editorCreate([], textureSourceBlocked);
    const changed = vi.spyOn(autosave, 'changed');
    await editor.openOrReopen();
    editor.panel.show();
    textureSourceGateSet(() => 'Only the room owner provides textures.');
    library.clear();
    library.entriesUpsert([createTextureBrowserEntry(new File(['x'], 'sky.png'), 'owner/sky.png')]);
    await settle(150);
    expect(panelRoot.textContent).toContain(CONTROLLER_PROJECT_EDITOR_ROOM_NOTICE);
    expect(panelRoot.textContent).toContain('read-only');
    expect(panelRoot.dataset['projectRoom']).toBe('true');
    const visible = Array.from(panelRoot.querySelectorAll('button')).filter((each) => each.style.display !== 'none');
    expect(visible.map((each) => each.textContent)).not.toContain('Open Project Folder…');
    expect(visible.map((each) => each.textContent)).not.toContain('Close Project');
    editor.panel.folderSelect('owner');
    panelRoot.querySelector('[data-file-path="owner/sky.png"]')?.dispatchEvent(new MouseEvent('dblclick'));
    expect(host.textureSelect).toHaveBeenCalledWith('owner/sky.png');
    expect(await editor.openOrReopen()).toBe(false);
    library.clear();
    textureSourceGateSet(null);
    await vi.waitFor(() => expect(project.fileSystem()?.name).toBe('game'));
    await settle(150);
    expect(panelRoot.dataset['projectRoom']).toBe('false');
    expect(panelRoot.querySelector('[data-file-path="owner/sky.png"]')).toBeNull();
    expect(library.getEntryById('owner/sky.png')).toBeNull();
    expect(changed).toHaveBeenCalled();
    expect(host.confirm).not.toHaveBeenCalled();
    editor.dispose();
  });

  it('shows project curves under Curves, and Remote and Local in a room, copying only Remote to Local', async () => {
    const own = curveFileWrite(
      curveFromPolyline([
        [0, 0],
        [1, 1],
      ]),
      'Own',
    );
    const arch = curveFileWrite(
      curveFromPolyline([
        [0, 1],
        [1, 0],
      ]),
      'Arch',
    );
    const { editor, panelRoot, library, root, host } = editorCreate([false, true], textureSourceBlocked);
    root.put('AiWorldEd/Curves/Own.aicurve', own);
    await editor.openOrReopen();
    await settle();
    editor.panel.show();
    expect(
      curveLibrarySource('project')
        ?.list()
        .map((entry) => entry.fileName),
    ).toEqual(['Own.aicurve']);
    editor.panel.folderSelect('//Curves');
    expect(panelRoot.querySelector('[data-file-path="AiWorldEd/Curves/Own.aicurve"]')).not.toBeNull();
    textureSourceGateSet(() => 'Only the room owner provides textures.');
    library.clear();
    await settle(150);
    expect(curveLibrarySource('project')).toBeNull();
    await vi.waitFor(() =>
      expect(
        curveLibrarySource('local')
          ?.list()
          .map((entry) => entry.fileName),
      ).toEqual(['Own.aicurve']),
    );
    const remoteFiles = new Map([
      ['Arch.aicurve', arch],
      ['Own.aicurve', arch],
    ]);
    const remote: CurveLibrarySource = {
      id: 'remote',
      writable: () => false,
      readOnlyReason: () => "The room owner's curves are read-only; save to Local instead.",
      list: () => [...remoteFiles.keys()].map((fileName) => ({ fileName, size: 1, lastModified: 1 })),
      read: async (fileName) => remoteFiles.get(fileName) ?? '',
      write: async (fileName) => {
        throw new CurveLibraryExistsError(fileName);
      },
    };
    curveLibrarySourceSet('remote', remote);
    await settle(150);
    const rows = [...panelRoot.querySelectorAll('[data-folder-path]')].map((row) =>
      row.getAttribute('data-folder-path'),
    );
    expect(rows.slice(-3)).toEqual(['//Curves', '//Curves/Remote', '//Curves/Local']);
    const notice = panelRoot.querySelector<HTMLElement>('[data-notice]');
    const shown = () =>
      [...(notice?.children ?? [])].find((text) => (text as HTMLElement).style.visibility !== 'hidden');
    editor.panel.folderSelect('//Curves/Remote');
    expect(notice?.dataset['notice']).toBe('room');
    expect(shown()?.textContent).toBe(CONTROLLER_PROJECT_EDITOR_ROOM_NOTICE);
    expect(notice?.children).toHaveLength(2);
    const localRow = () => panelRoot.querySelector('[data-folder-path="//Curves/Local"]');
    localRow()?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(shown()?.textContent).toBe(CONTROLLER_PROJECT_EDITOR_LOCAL_NOTICE);
    panelRoot
      .querySelector('[data-folder-path="//Curves/Remote"]')
      ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(notice?.dataset['notice']).toBe('room');
    editor.panel.folderSelect('//Curves/Local');
    localRow()?.parentElement?.dispatchEvent(new MouseEvent('mouseleave'));
    expect(notice?.dataset['notice']).toBe('local');
    expect(shown()?.textContent).toBe(CONTROLLER_PROJECT_EDITOR_LOCAL_NOTICE);
    editor.panel.folderSelect('//Curves/Remote');
    const tile = panelRoot.querySelector<HTMLElement>('[data-file-path="//Curves/Remote/Arch.aicurve"]');
    expect(tile).not.toBeNull();
    tile?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const items = [...document.querySelectorAll<HTMLElement>('*')].filter((element) => element.children.length === 0);
    expect(items.some((element) => element.textContent === 'Copy to Local')).toBe(true);
    editor.panel.folderSelect('//Curves/Local');
    panelRoot
      .querySelector('[data-file-path="//Curves/Local/Own.aicurve"]')
      ?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const localItems = [...document.querySelectorAll<HTMLElement>('*')].filter((e) => e.children.length === 0);
    expect(localItems.some((element) => element.textContent?.startsWith('Copy to Remote'))).toBe(false);
    const drop = (folder: string, path: string) => {
      const event = new Event('drop', { cancelable: true }) as DragEvent;
      Object.defineProperty(event, 'dataTransfer', {
        value: { types: ['application/x-aiworlded-project-path'], getData: () => path },
      });
      panelRoot.querySelector(`[data-folder-path="${folder}"]`)?.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(drop('//Curves/Remote', '//Curves/Local/Own.aicurve')).toBe(false);
    expect(drop('//Curves/Local', '//Curves/Remote/Arch.aicurve')).toBe(true);
    await vi.waitFor(async () => expect(await root.textAt('AiWorldEd/Curves/Arch.aicurve')).toBe(arch));
    expect(host.confirm).not.toHaveBeenCalled();
    drop('//Curves/Local', '//Curves/Remote/Own.aicurve');
    await vi.waitFor(() => expect(host.confirm).toHaveBeenCalledTimes(1));
    expect(host.confirm).toHaveBeenCalledWith(
      'Overwrite Curve?',
      '"Own" already exists in Local. Overwrite it?',
      'Yes',
      'No',
    );
    await settle(10);
    expect(await root.textAt('AiWorldEd/Curves/Own.aicurve')).toBe(own);
    drop('//Curves/Local', '//Curves/Remote/Own.aicurve');
    await vi.waitFor(async () => expect(await root.textAt('AiWorldEd/Curves/Own.aicurve')).toBe(arch));
    await vi.waitFor(() =>
      expect(panelRoot.querySelector('[data-file-path="//Curves/Local/Arch.aicurve"]')).not.toBeNull(),
    );
    curveLibrarySourceSet('remote', null);
    editor.dispose();
    expect(curveLibrarySource('local')).toBeNull();
  });
});
