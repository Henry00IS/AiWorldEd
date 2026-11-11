import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { filePickerAccept, ManagerFileDialog } from '@/io/dialog/manager_file_dialog.js';

describe('FileDialogManager', () => {
  let manager: ManagerFileDialog;
  let savedCreateElement: typeof document.createElement;
  let savedAppendChild: typeof document.body.appendChild;
  let savedRemoveChild: typeof document.body.removeChild;

  beforeEach(() => {
    manager = new ManagerFileDialog();
    savedCreateElement = document.createElement.bind(document);
    savedAppendChild = document.body.appendChild.bind(document.body);
    savedRemoveChild = document.body.removeChild.bind(document.body);
    vi.stubGlobal(
      'URL',
      new Proxy(window.URL, {
        get(target, prop) {
          if (prop === 'createObjectURL') return vi.fn(() => 'blob://mock-url');
          if (prop === 'revokeObjectURL') return vi.fn();
          return Reflect.get(target, prop);
        },
      }),
    );
  });

  afterEach(() => {
    document.createElement = savedCreateElement;
    document.body.appendChild = savedAppendChild;
    document.body.removeChild = savedRemoveChild;
    vi.unstubAllGlobals();
  });

  it('should saveJSON with fallback return suggested filename', async () => {
    const mockAnchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: vi.fn(),
    };
    document.createElement = vi.fn((tagName: string) => {
      if (tagName === 'a') return mockAnchor as unknown as HTMLElement;
      return savedCreateElement(tagName);
    });
    document.body.appendChild = vi.fn() as typeof document.body.appendChild;
    document.body.removeChild = vi.fn() as typeof document.body.removeChild;
    const result = await manager.saveJSON('{}', 'test.json');
    expect(result).toBe('test.json');
  });

  it('should return null when fallback download mechanism throws', async () => {
    document.createElement = vi.fn(() => {
      throw new Error('DOM blocked');
    });
    const result = await manager.saveJSON('{}', 'test.json');
    expect(result).toBeNull();
  });

  it('loads a text file through the fallback file input', async () => {
    const mockInput = {
      type: '',
      accept: '',
      files: [new File(['solid\n{\n}\n'], 'map.vmf', { type: 'text/plain' })],
      click: vi.fn(),
      onchange: null as null | (() => void),
    };
    document.createElement = vi.fn((tagName: string) => {
      if (tagName === 'input') {
        return mockInput as unknown as HTMLElement;
      }
      return savedCreateElement(tagName);
    });
    const loadPromise = manager.loadTextFile('.vmf', 'Valve Map Format', ['.vmf']);
    mockInput.onchange?.();
    const result = await loadPromise;
    expect(mockInput.accept).toBe('.vmf');
    expect(result).not.toBeNull();
    expect(result!.filename).toBe('map.vmf');
    expect(result!.text).toContain('solid');
  });

  it('answers null when the export folder picker is cancelled', async () => {
    const abortError = new DOMException('The user aborted a request.', 'AbortError');
    vi.stubGlobal(
      'showDirectoryPicker',
      vi.fn(async () => {
        throw abortError;
      }),
    );
    expect(manager.canPickFolder()).toBe(true);
    expect(await manager.exportFolderPick()).toBeNull();
  });

  it('lists only the requested extensions in the import pickers', async () => {
    const pickedFile = new File(['solid'], 'map.vmf');
    const showOpenFilePicker = vi.fn(async () => [{ getFile: async () => pickedFile }]);
    vi.stubGlobal('showOpenFilePicker', showOpenFilePicker);

    await manager.loadTextFile('.vmf', 'Valve Map Format', ['.vmf']);
    const accept = (
      showOpenFilePicker.mock.calls[0] as unknown as [{ types: { accept: Record<string, string[]> }[] }]
    )[0].types[0]!.accept;

    expect(Object.values(accept).flat()).toEqual(['.vmf']);
    expect(Object.keys(accept)).not.toContain('text/plain');
    expect(Object.keys(filePickerAccept(['.fbx']))).not.toContain('application/octet-stream');
    expect(Object.values(filePickerAccept(['.fbx'])).flat()).toEqual(['.fbx']);
  });
});
