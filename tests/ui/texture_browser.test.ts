import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TextureBrowser,
  TEXTURE_BROWSER_DEFAULT_WIDTH_PX,
  TEXTURE_BROWSER_DEFAULT_HEIGHT_PX,
  TEXTURE_BROWSER_MIN_WIDTH_PX,
  TEXTURE_BROWSER_MIN_HEIGHT_PX
} from '../../src/ui/texture_browser.js';
import {
  TEXTURE_BROWSER_THUMB_CLASS,
  TEXTURE_BROWSER_GRID_CLASS,
  TEXTURE_BROWSER_MIN_TRACK_PX
} from '../../src/ui/texture_browser_styles.js';
import { FloatingPanelStack } from '../../src/ui/floating_panel_stack.js';
import { TextureBrowserEntry } from '../../src/texture/texture_browser_entry.js';
import { UvEditor } from '../../src/ui/uv_editor.js';

describe('TextureBrowser', () => {
  let host: HTMLElement;
  let onOpenFolder: ReturnType<typeof vi.fn>;
  let onSelectTexture: ReturnType<typeof vi.fn>;
  let browser: TextureBrowser;

  beforeEach(() => {
    FloatingPanelStack.resetForTests();
    host = document.createElement('div');
    document.body.appendChild(host);
    onOpenFolder = vi.fn();
    onSelectTexture = vi.fn();
    browser = new TextureBrowser(host, {
      onOpenFolder,
      onSelectTexture
    });
  });

  afterEach(() => {
    browser.dispose();
    if (host.parentNode) host.parentNode.removeChild(host);
  });

  it('should start hidden until shown', () => {
    expect(browser.isOpen()).toBe(false);
  });

  it('should open and close without a pin control', () => {
    browser.show();
    expect(browser.isOpen()).toBe(true);
    expect(host.textContent).not.toContain('Pin');
    browser.hide(true);
    expect(browser.isOpen()).toBe(false);
  });

  it('should toggle visibility', () => {
    browser.toggle();
    expect(browser.isOpen()).toBe(true);
    browser.toggle();
    expect(browser.isOpen()).toBe(false);
  });

  it('should invoke open-folder when the toolbar button is clicked', () => {
    browser.show();
    const openButton = host.querySelector(
      'button[aria-label="Open Folder"]'
    ) as HTMLButtonElement;
    openButton.click();
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
  });

  it('should render thumbs as background-image squares with names below', () => {
    const entries = [
      createEntry('brick.png', 'brick', 'blob:brick'),
      createEntry('floor.png', 'floor', 'blob:floor')
    ];
    browser.setEntries(entries, 'brick.png', 'MyTextures');
    browser.show();
    expect(host.textContent).toContain('Texture Browser');
    expect(host.textContent).toContain('Folder: MyTextures');
    expect(host.textContent).toContain('brick');
    expect(host.textContent).toContain('floor');
    expect(host.textContent).toContain('2 texture(s)');
    const thumbs = host.querySelectorAll('[data-preview-thumb="true"]');
    expect(thumbs).toHaveLength(2);
    expect((thumbs[0] as HTMLElement).style.backgroundImage).toContain(
      'blob:brick'
    );
    expect((thumbs[1] as HTMLElement).style.backgroundImage).toContain(
      'blob:floor'
    );
    expect((thumbs[0] as HTMLElement).classList.contains(TEXTURE_BROWSER_THUMB_CLASS)).toBe(
      true
    );
  });

  it('should report selection when a tile is clicked', () => {
    browser.setEntries(
      [createEntry('metal.png', 'metal', 'blob:metal')],
      null,
      'Pack'
    );
    browser.show();
    const tile = host.querySelector(
      '[aria-label="metal.png"]'
    ) as HTMLElement;
    tile.click();
    expect(onSelectTexture).toHaveBeenCalledWith('metal.png');
  });

  it('should highlight the selected tile with aria-selected', () => {
    browser.setEntries(
      [
        createEntry('a.png', 'a', 'blob:a'),
        createEntry('b.png', 'b', 'blob:b')
      ],
      'a.png',
      'Pack'
    );
    browser.setSelectedId('b.png');
    const selected = host.querySelector(
      '[aria-label="b.png"]'
    ) as HTMLElement;
    const unselected = host.querySelector(
      '[aria-label="a.png"]'
    ) as HTMLElement;
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(unselected.getAttribute('aria-selected')).toBe('false');
  });

  it('should open near the bottom-right of the default anchor', () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      value: () => ({
        left: 100,
        top: 100,
        right: 900,
        bottom: 700,
        width: 800,
        height: 600,
        x: 100,
        y: 100,
        toJSON: () => ({})
      })
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 1000
    });
    browser.setDefaultAnchor(anchor);
    browser.show();
    const panel = browser.getRootElement();
    const paddingPx = 8;
    expect(panel.style.left).toBe(
      `${900 - TEXTURE_BROWSER_DEFAULT_WIDTH_PX - paddingPx}px`
    );
    expect(panel.style.bottom).toBe(`${1000 - 700 + paddingPx}px`);
    expect(panel.style.top).toBe('auto');
    expect(panel.style.width).toBe(`${TEXTURE_BROWSER_DEFAULT_WIDTH_PX}px`);
    expect(panel.style.height).toBe(`${TEXTURE_BROWSER_DEFAULT_HEIGHT_PX}px`);
    document.body.removeChild(anchor);
  });

  it('should use CSS auto-fill columns for the grid', () => {
    const grid = browser.getGridElement();
    expect(grid.classList.contains(TEXTURE_BROWSER_GRID_CLASS)).toBe(true);
    const sheet = document.getElementById('tb-browser-stylesheet');
    expect(sheet?.textContent).toContain(
      `repeat(auto-fill, minmax(${TEXTURE_BROWSER_MIN_TRACK_PX}px, 1fr))`
    );
  });

  it('should expose a resize handle and enforce minimum panel size', () => {
    browser.show();
    const panel = browser.getRootElement();
    const handle = host.querySelector(
      '[aria-label="Resize browser"]'
    ) as HTMLElement;
    expect(handle).toBeTruthy();
    expect(panel.style.minWidth).toBe(`${TEXTURE_BROWSER_MIN_WIDTH_PX}px`);
    expect(panel.style.minHeight).toBe(`${TEXTURE_BROWSER_MIN_HEIGHT_PX}px`);
    expect(panel.style.overflow).toBe('hidden');
    Object.defineProperty(panel, 'getBoundingClientRect', {
      value: () => ({
        left: 40,
        top: 50,
        right: 40 + TEXTURE_BROWSER_DEFAULT_WIDTH_PX,
        bottom: 50 + TEXTURE_BROWSER_DEFAULT_HEIGHT_PX,
        width: TEXTURE_BROWSER_DEFAULT_WIDTH_PX,
        height: TEXTURE_BROWSER_DEFAULT_HEIGHT_PX,
        x: 40,
        y: 50,
        toJSON: () => ({})
      })
    });
    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 500,
        clientY: 600
      })
    );
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 500 + 80,
        clientY: 600 + 40
      })
    );
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(panel.style.width).toBe(
      `${TEXTURE_BROWSER_DEFAULT_WIDTH_PX + 80}px`
    );
    expect(panel.style.height).toBe(
      `${TEXTURE_BROWSER_DEFAULT_HEIGHT_PX + 40}px`
    );
  });

  it('should mark thumbs for CSS square sizing via container queries', () => {
    browser.setEntries(
      [createEntry('tile.png', 'tile', 'blob:tile')],
      'tile.png',
      'Pack'
    );
    const thumb = host.querySelector(
      '[data-preview-thumb="true"]'
    ) as HTMLElement;
    expect(thumb.classList.contains(TEXTURE_BROWSER_THUMB_CLASS)).toBe(true);
    const sheet = document.getElementById('tb-browser-stylesheet');
    expect(sheet?.textContent).toContain('height: 100cqi');
  });

  it('should bring the texture browser above the UV editor when clicked', () => {
    const uvEditor = new UvEditor(host, {
      onAlign: vi.fn(),
      onApplyMapping: vi.fn(),
      onReset: vi.fn()
    });
    uvEditor.show();
    browser.show();
    const browserRoot = host.children[0] as HTMLElement;
    const uvEditorRoot = host.children[1] as HTMLElement;
    expect(Number(browserRoot.style.zIndex)).toBeGreaterThan(
      Number(uvEditorRoot.style.zIndex)
    );
    uvEditorRoot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(Number(uvEditorRoot.style.zIndex)).toBeGreaterThan(
      Number(browserRoot.style.zIndex)
    );
    uvEditor.dispose();
  });

  it('should show empty-state copy when no entries are loaded', () => {
    browser.setEntries([], null, null);
    expect(host.textContent).toContain('Open a folder to browse textures');
    expect(host.textContent).toContain('No folder open');
  });
});

/**
 * Creates a lightweight entry for UI tests (no real object URL).
 * @param id Entry id / relative path.
 * @param displayName Label under the thumbnail.
 * @param previewObjectUrl Fake blob URL.
 * @returns Texture browser entry.
 */
function createEntry(
  id: string,
  displayName: string,
  previewObjectUrl: string
): TextureBrowserEntry {
  const file = new File(['x'], `${displayName}.png`, { type: 'image/png' });
  return {
    id,
    displayName,
    fileName: `${displayName}.png`,
    relativePath: id,
    previewObjectUrl,
    mimeType: 'image/png',
    byteSize: file.size,
    sourceFile: file
  };
}
