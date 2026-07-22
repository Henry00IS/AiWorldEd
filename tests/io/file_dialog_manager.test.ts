import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileDialogManager } from '../../src/io/file_dialog_manager.js';

describe('FileDialogManager', () => {
  let manager: FileDialogManager;
  let savedCreateElement: typeof document.createElement;
  let savedAppendChild: (node: Node) => Node;
  let savedRemoveChild: (node: Node) => Node;

  beforeEach(() => {
    manager = new FileDialogManager();
    savedCreateElement = document.createElement.bind(document);
    savedAppendChild = document.body.appendChild.bind(document.body);
    savedRemoveChild = document.body.removeChild.bind(document.body);
    vi.stubGlobal('URL', new Proxy(window.URL, {
      get(target, prop) {
        if (prop === 'createObjectURL') return vi.fn(() => 'blob://mock-url');
        if (prop === 'revokeObjectURL') return vi.fn();
        return Reflect.get(target, prop);
      },
    }));
  });

  afterEach(() => {
    document.createElement = savedCreateElement;
    document.body.appendChild = savedAppendChild;
    document.body.removeChild = savedRemoveChild;
    vi.unstubAllGlobals();
  });

  it('should create JSON blob with correct MIME type', async () => {
    const jsonData = JSON.stringify({ test: true });
    const blob = new Blob([jsonData], { type: 'application/json' });
    expect(blob.type).toBe('application/json');
    const text = await blob.text();
    expect(text).toBe(jsonData);
  });

  it('should create binary blob with correct MIME type', async () => {
    const buffer = new ArrayBuffer(16);
    const blob = new Blob([buffer], { type: 'model/gltf-binary' });
    expect(blob.type).toBe('model/gltf-binary');
    expect(blob.size).toBe(16);
  });

  it('should saveJSON with fallback return suggested filename', async () => {
    const mockAnchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: vi.fn(),
    };
    document.createElement = vi.fn((tagName: string) => {
      if (tagName === 'a') return mockAnchor as HTMLElement;
      return savedCreateElement(tagName);
    });
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();
    const result = await manager.saveJSON('{}', 'test.json');
    expect(result).toBe('test.json');
  });

  it('should saveBinary with fallback return suggested filename', async () => {
    const mockAnchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: vi.fn(),
    };
    document.createElement = vi.fn((tagName: string) => {
      if (tagName === 'a') return mockAnchor as HTMLElement;
      return savedCreateElement(tagName);
    });
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();
    const buffer = new ArrayBuffer(32);
    const result = await manager.saveBinary(buffer, 'scene.glb');
    expect(result).toBe('scene.glb');
  });

  it('should return null when fallback download mechanism throws', async () => {
    document.createElement = vi.fn(() => {
      throw new Error('DOM blocked');
    });
    const result = await manager.saveJSON('{}', 'test.json');
    expect(result).toBeNull();
  });
});
