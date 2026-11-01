import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ControllerTextureBrowser } from '@/texture/controller/controller_texture_browser.js';
import { TextureBrowser } from '@/texture/ui/browser/texture_browser.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { textureSourceGateSet } from '@/texture/library/texture_source_gate.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';

describe('TextureBrowserController', () => {
  let host: HTMLElement;
  let browser: TextureBrowser;
  let library: TextureLibrary;
  let controller: ControllerTextureBrowser;
  let statusMessages: string[];
  let selectionNames: Array<string | null>;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    mockObjectUrlApis('blob:ctrl');
    browser = new TextureBrowser(host, {
      onOpenProject: () => void controller.openProject(),
      onSelectTexture: (entryId) => controller.selectTexture(entryId),
    });
    library = new TextureLibrary();
    statusMessages = [];
    selectionNames = [];
    controller = new ControllerTextureBrowser({ browser, library });
    controller.setStatusCallback((message) => statusMessages.push(message));
    controller.setSelectionCallback((entry) => selectionNames.push(entry?.displayName ?? null));
  });

  afterEach(() => {
    textureSourceGateSet(null);
    controller?.dispose();
    browser?.dispose();
    if (host.parentNode) host.parentNode.removeChild(host);
    vi.restoreAllMocks();
  });

  it('should refresh the grid after library changes from the project', async () => {
    library.folderNameSet('Walls');
    library.entriesUpsert([entryOf('brick.png')]);
    await Promise.resolve();
    browser.show();
    expect(host.textContent).toContain('Checker');
    expect(host.textContent).toContain('brick');
    expect(host.textContent).toContain('Project: Walls');
    library.entriesRemove(new Set(['brick.png']));
    await Promise.resolve();
    expect(host.textContent).not.toContain('brick');
  });

  it('should coalesce a burst of changes into one grid rebuild', async () => {
    const rebuild = vi.spyOn(browser, 'setEntries');
    for (let index = 0; index < 50; index += 1) library.entriesUpsert([entryOf(`t${index}.png`)]);
    await Promise.resolve();
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it('should select textures and notify the selection callback', () => {
    library.entriesUpsert([entryOf('a.png'), entryOf('b.png')]);
    controller.selectTexture('b.png');
    expect(controller.getLibrary().getSelectedId()).toBe('b.png');
    expect(selectionNames.at(-1)).toBe('b');
  });

  it('should open the project through the project panel', async () => {
    const opener = vi.fn();
    controller.setProject(opener, () => false);
    await controller.openProject();
    expect(opener).toHaveBeenCalledTimes(1);
  });

  it('should refuse to open a project while the room owner provides textures', async () => {
    const opener = vi.fn();
    controller.setProject(opener, () => false);
    textureSourceGateSet(() => 'Textures come from the room owner');
    await controller.openProject();
    expect(opener).not.toHaveBeenCalled();
    expect(statusMessages.at(-1)).toMatch(/room owner/);
    await Promise.resolve();
    expect(browser.getSource()).toBe('remote');
  });

  it('should show the project source once a project is open', async () => {
    let open = false;
    controller.setProject(() => undefined, () => open);
    await Promise.resolve();
    expect(browser.getSource()).toBe('none');
    open = true;
    library.folderNameSet('P');
    await Promise.resolve();
    expect(browser.getSource()).toBe('project');
  });
});

/**
 * Creates a texture entry for a path.
 *
 * @param path Texture id.
 * @returns Entry.
 */
function entryOf(path: string) {
  return createTextureBrowserEntry(new File(['x'], path, { type: 'image/png' }), path);
}
