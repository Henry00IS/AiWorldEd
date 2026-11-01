import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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

/**
 * Builds the editor controller over a mock project.
 *
 * @param answers Confirm answers.
 * @returns Fixture parts.
 */
function editorCreate(answers: boolean[] = []) {
  const fake = projectHostFakeCreate(answers);
  const { root, picker } = projectHostFolderCreate();
  const { project, store } = projectHostControllerCreate(fake.library, picker);
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
    expect(host.sceneLoad).toHaveBeenCalledWith(expect.any(String), 'start.json');
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
    editor.panel.getRootElement().querySelector<HTMLButtonElement>('button[aria-label="Close project"]')?.click();
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

  it('refreshes thumbnails after textures load', async () => {
    const { editor } = editorCreate();
    const refresh = vi.spyOn(editor.panel, 'thumbnailsRefresh');
    await editor.openOrReopen();
    await settle(150);
    expect(refresh).toHaveBeenCalled();
    editor.dispose();
  });
});
