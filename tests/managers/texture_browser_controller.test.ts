import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TextureBrowserController } from '../../src/managers/texture_browser_controller.js';
import { TextureBrowser } from '../../src/ui/texture_browser.js';
import { TextureLibrary } from '../../src/texture/texture_library.js';
import {
  LocalDirectoryAccess,
  PickedDirectoryListing
} from '../../src/texture/local_directory_access.js';
import { mockObjectUrlApis } from '../texture/object_url_test_utils.js';

describe('TextureBrowserController', () => {
  let host: HTMLElement;
  let browser: TextureBrowser;
  let library: TextureLibrary;
  let directoryAccess: LocalDirectoryAccess;
  let controller: TextureBrowserController;
  let statusMessages: string[];
  let selectionNames: Array<string | null>;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    mockObjectUrlApis('blob:ctrl');
    browser = new TextureBrowser(host, {
      onOpenFolder: () => {
        void controller.openFolder();
      },
      onSelectTexture: (entryId) => controller.selectTexture(entryId)
    });
    library = new TextureLibrary();
    directoryAccess = createMockDirectoryAccess(null);
    statusMessages = [];
    selectionNames = [];
    controller = new TextureBrowserController({
      browser,
      library,
      directoryAccess
    });
    controller.setStatusCallback((message) => statusMessages.push(message));
    controller.setSelectionCallback((entry) => {
      selectionNames.push(entry?.displayName ?? null);
    });
  });

  afterEach(() => {
    controller?.dispose();
    browser?.dispose();
    if (host.parentNode) host.parentNode.removeChild(host);
    vi.restoreAllMocks();
  });

  it('should load images from a picked folder into the library and UI', async () => {
    directoryAccess = createMockDirectoryAccess({
      folderName: 'Walls',
      files: [
        {
          name: 'brick.png',
          relativePath: 'brick.png',
          file: new File(['a'], 'brick.png', { type: 'image/png' })
        },
        {
          name: 'notes.txt',
          relativePath: 'notes.txt',
          file: new File(['b'], 'notes.txt', { type: 'text/plain' })
        }
      ]
    });
    controller.dispose();
    controller = new TextureBrowserController({
      browser,
      library: new TextureLibrary(),
      directoryAccess
    });
    controller.setStatusCallback((message) => statusMessages.push(message));
    controller.setSelectionCallback((entry) => {
      selectionNames.push(entry?.displayName ?? null);
    });
    await controller.openFolder();
    expect(controller.getLibrary().getEntryCount()).toBe(2);
    expect(controller.getLibrary().getFolderName()).toBe('Walls');
    expect(host.textContent).toContain('Checker');
    expect(host.textContent).toContain('brick');
    expect(host.textContent).toContain('Folder: Walls');
    expect(statusMessages.some((message) => message.includes('Loaded 1'))).toBe(
      true
    );
  });

  it('should ignore cancelled folder picks without clearing existing data', async () => {
    const populatedLibrary = new TextureLibrary();
    const existingFile = new File(['x'], 'keep.png', { type: 'image/png' });
    populatedLibrary.replaceAll('Existing', [
      {
        id: 'keep.png',
        displayName: 'keep',
        fileName: 'keep.png',
        relativePath: 'keep.png',
        previewObjectUrl: 'blob:keep',
        mimeType: 'image/png',
        byteSize: existingFile.size,
        sourceFile: existingFile
      }
    ]);
    directoryAccess = createMockDirectoryAccess(null);
    controller.dispose();
    controller = new TextureBrowserController({
      browser,
      library: populatedLibrary,
      directoryAccess
    });
    controller.refreshBrowserUi();
    await controller.openFolder();
    expect(controller.getLibrary().getEntryCount()).toBe(2);
    expect(host.textContent).toContain('2 texture(s)');
  });

  it('should select textures and notify the selection callback', async () => {
    directoryAccess = createMockDirectoryAccess({
      folderName: 'Pack',
      files: [
        {
          name: 'a.png',
          relativePath: 'a.png',
          file: new File(['a'], 'a.png', { type: 'image/png' })
        },
        {
          name: 'b.png',
          relativePath: 'b.png',
          file: new File(['b'], 'b.png', { type: 'image/png' })
        }
      ]
    });
    controller.dispose();
    controller = new TextureBrowserController({
      browser,
      library: new TextureLibrary(),
      directoryAccess
    });
    selectionNames = [];
    controller.setSelectionCallback((entry) => {
      selectionNames.push(entry?.displayName ?? null);
    });
    await controller.openFolder();
    controller.selectTexture('b.png');
    expect(controller.getLibrary().getSelectedId()).toBe('b.png');
    expect(selectionNames.at(-1)).toBe('b');
  });

  it('should report when folder access is unsupported', async () => {
    directoryAccess = {
      isSupported: () => false,
      pickDirectoryAndListFiles: async () => null
    };
    controller.dispose();
    controller = new TextureBrowserController({
      browser,
      library: new TextureLibrary(),
      directoryAccess
    });
    statusMessages = [];
    controller.setStatusCallback((message) => statusMessages.push(message));
    await controller.openFolder();
    expect(statusMessages[0]).toMatch(/not supported/i);
  });
});

/**
 * Creates a mock LocalDirectoryAccess that returns a fixed listing.
 * @param listing Listing or null for cancel.
 * @returns Mock access implementation.
 */
function createMockDirectoryAccess(
  listing: PickedDirectoryListing | null
): LocalDirectoryAccess {
  return {
    isSupported: () => true,
    pickDirectoryAndListFiles: async () => listing
  };
}
