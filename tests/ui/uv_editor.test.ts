import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UvEditor } from '../../src/ui/uv_editor.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';

describe('UvEditor', () => {
  let host: HTMLElement;
  let onAlign: ReturnType<typeof vi.fn>;
  let onApplyMapping: ReturnType<typeof vi.fn>;
  let onReset: ReturnType<typeof vi.fn>;
  let editor: UvEditor;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    onAlign = vi.fn();
    onApplyMapping = vi.fn();
    onReset = vi.fn();
    editor = new UvEditor(host, {
      onAlign,
      onApplyMapping,
      onReset
    });
  });

  afterEach(() => {
    editor.dispose();
    if (host.parentNode) host.parentNode.removeChild(host);
  });

  it('should start hidden', () => {
    expect(editor.isOpen()).toBe(false);
  });

  it('should open and close without a pin control', () => {
    editor.show();
    expect(editor.isOpen()).toBe(true);
    expect(host.textContent).not.toContain('Pin');
    expect(host.textContent).toContain('UV Editor');
    editor.hide(true);
    expect(editor.isOpen()).toBe(false);
  });

  it('should toggle visibility', () => {
    editor.toggle();
    expect(editor.isOpen()).toBe(true);
    editor.toggle();
    expect(editor.isOpen()).toBe(false);
  });

  it('should update status text from selection', () => {
    editor.setFromSelection(createDefaultFaceTextureMapping(), 2);
    expect(host.textContent).toContain('2 face region(s)');
  });

  it('should report no surfaces when target count is zero', () => {
    editor.setFromSelection(null, 0);
    expect(host.textContent).toContain('No surfaces selected');
  });

  it('should open at the bottom-left of the default anchor element', () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      value: () => ({
        left: 400,
        top: 300,
        right: 800,
        bottom: 600,
        width: 400,
        height: 300,
        x: 400,
        y: 300,
        toJSON: () => ({})
      })
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900
    });
    editor.setDefaultAnchor(anchor);
    editor.show();
    const panel = host.querySelector('div') as HTMLElement;
    const paddingPx = 8;
    expect(panel.style.left).toBe(`${400 + paddingPx}px`);
    expect(panel.style.top).toBe('auto');
    expect(panel.style.bottom).toBe(`${900 - 600 + paddingPx}px`);
    expect(panel.style.right).toBe('auto');
    document.body.removeChild(anchor);
  });
});
