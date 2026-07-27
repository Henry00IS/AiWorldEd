import { describe, expect, it, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { DetachedViewportWindow } from '../../src/viewports/detached_viewport_window.js';
import type { EditorViewport } from '../../src/viewports/editor_viewport.js';
import type { SharedWebGLSurface } from '../../src/viewports/shared_webgl_surface.js';
import { ViewportKind } from '../../src/viewports/viewport_kind.js';

/** Builds a fake popup document and window for open() tests. */
function createFakePopup(): {
  fakeWindow: Window;
  body: HTMLElement;
  head: HTMLElement;
  hostOpener: { closed: boolean };
} {
  const head = document.createElement('head');
  const body = document.createElement('body');
  const title = document.createElement('title');
  head.appendChild(title);
  const fakeDoc = {
    open: vi.fn(),
    write: vi.fn(),
    close: vi.fn(),
    head,
    body,
    title: '',
    hidden: false,
    createElement: (tag: string) => document.createElement(tag),
    querySelectorAll: (selector: string) => head.querySelectorAll(selector),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    pointerLockElement: null,
    defaultView: null as Window | null,
  } as unknown as Document;
  Object.defineProperty(fakeDoc, 'title', {
    get: () => title.textContent ?? '',
    set: (value: string) => {
      title.textContent = value;
    },
    configurable: true,
  });
  const hostOpener = { closed: false };
  const fakeWindow = {
    closed: false,
    focus: vi.fn(),
    close: vi.fn(),
    document: fakeDoc,
    opener: hostOpener,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    innerWidth: 960,
    innerHeight: 720,
    devicePixelRatio: 1,
  } as unknown as Window;
  (fakeDoc as { defaultView: Window | null }).defaultView = fakeWindow;
  return { fakeWindow, body, head, hostOpener };
}

/**
 * Creates a mock workspace surface so unit tests never need a real WebGL
 * context. Canvas is parented under the popup host like production.
 *
 * @param workspaceElement Detached pane host.
 * @returns Mock SharedWebGLSurface.
 */
function createMockSurface(workspaceElement: HTMLElement): SharedWebGLSurface {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  workspaceElement.insertBefore(canvas, workspaceElement.firstChild);
  const renderer = {
    outputColorSpace: '',
    setClearColor: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    setViewport: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    clear: vi.fn(),
    clearDepth: vi.fn(),
    render: vi.fn(),
    compile: vi.fn(),
    initTexture: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
    domElement: canvas,
  } as unknown as THREE.WebGLRenderer;
  return {
    getRenderer: () => renderer,
    getCanvas: () => canvas,
    getWorkspaceElement: () => workspaceElement,
    getLogicalSize: () => ({ width: 960, height: 720 }),
    resize: vi.fn((width: number, height: number) => {
      (renderer.setSize as ReturnType<typeof vi.fn>)(width, height, false);
    }),
    syncSizeFromWorkspace: vi.fn(),
    renderPanes: vi.fn((_scene: THREE.Scene, panes: Array<{ prepare?: () => void; finalize?: () => void }>) => {
      panes.forEach((pane) => {
        pane.prepare?.();
        pane.finalize?.();
      });
    }),
    dispose: () => {
      renderer.dispose();
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    },
  } as unknown as SharedWebGLSurface;
}

describe('DetachedViewportWindow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start closed with no popup or renderer allocated', () => {
    const detached = new DetachedViewportWindow({ createSurface: createMockSurface });
    expect(detached.isOpen()).toBe(false);
    expect(detached.hasRenderer()).toBe(false);
    expect(detached.getOpenCount()).toBe(0);
    detached.dispose();
  });

  it('should open a popup and allocate a renderer only while open', () => {
    const { fakeWindow, body } = createFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    const scene = new THREE.Scene();
    const seedCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    seedCamera.position.set(3, 4, 5);
    let surface: SharedWebGLSurface | null = null;
    const detached = new DetachedViewportWindow({
      createSurface: (host) => {
        surface = createMockSurface(host);
        return surface;
      },
    });
    detached.setRenderSource({
      getScene: () => scene,
      getSeedCamera: () => seedCamera,
    });
    expect(detached.open()).toBe(true);
    expect(detached.isOpen()).toBe(true);
    expect(detached.hasRenderer()).toBe(true);
    expect(body.querySelector('canvas')).not.toBeNull();
    expect(surface).not.toBeNull();
    expect(surface!.resize).toHaveBeenCalled();
    const renderer = surface!.getRenderer();
    detached.dispose();
    expect(fakeWindow.close).toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalled();
    expect(detached.hasRenderer()).toBe(false);
  });

  it('should report failure when the popup is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const detached = new DetachedViewportWindow({ createSurface: createMockSurface });
    detached.setRenderSource({ getScene: () => new THREE.Scene() });
    expect(detached.open()).toBe(false);
    expect(detached.isOpen()).toBe(false);
    expect(detached.hasRenderer()).toBe(false);
    detached.dispose();
  });

  it('should open multiple independent popup windows with unique names', () => {
    const first = createFakePopup();
    const second = createFakePopup();
    const openSpy = vi
      .spyOn(window, 'open')
      .mockReturnValueOnce(first.fakeWindow)
      .mockReturnValueOnce(second.fakeWindow);
    const ready = vi.fn();
    const detached = new DetachedViewportWindow({
      createSurface: createMockSurface,
      hooks: { onViewportReady: ready },
    });
    detached.setRenderSource({ getScene: () => new THREE.Scene() });
    expect(detached.open()).toBe(true);
    expect(detached.open()).toBe(true);
    expect(detached.getOpenCount()).toBe(2);
    expect(detached.getViewports()).toHaveLength(2);
    expect(ready).toHaveBeenCalledTimes(2);
    expect(openSpy).toHaveBeenCalledTimes(2);
    const names = openSpy.mock.calls.map((call) => call[1] as string);
    expect(names[0]).not.toBe(names[1]);
    expect(names[0]).toMatch(/^aiworlded_detached_viewport_/);
    expect(names[1]).toMatch(/^aiworlded_detached_viewport_/);
    detached.dispose();
    expect(first.fakeWindow.close).toHaveBeenCalled();
    expect(second.fakeWindow.close).toHaveBeenCalled();
    expect(detached.getOpenCount()).toBe(0);
  });

  it('should place content under the title bar for content-only scissor', () => {
    const { fakeWindow } = createFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    const detached = new DetachedViewportWindow({ createSurface: createMockSurface });
    detached.setRenderSource({ getScene: () => new THREE.Scene() });
    expect(detached.open()).toBe(true);
    const viewport = detached.getViewport();
    expect(viewport).not.toBeNull();
    const content = viewport!.getContentElement();
    expect(content.style.top).toBe(`${Theme.viewportToolbarHeightPx}px`);
    expect(content).not.toBe(viewport!.getContainer());
    detached.dispose();
  });

  it('should expose the live viewport from getViewports during onViewportReady', () => {
    const { fakeWindow } = createFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    let viewportsDuringReady: EditorViewport[] = [];
    let readyViewport: EditorViewport | null = null;
    const detached = new DetachedViewportWindow({
      createSurface: createMockSurface,
      hooks: {
        onViewportReady: (viewport) => {
          readyViewport = viewport;
          viewportsDuringReady = detached.getViewports();
        },
      },
    });
    detached.setRenderSource({ getScene: () => new THREE.Scene() });
    expect(detached.open()).toBe(true);
    expect(readyViewport).not.toBeNull();
    expect(viewportsDuringReady).toContain(readyViewport);
    expect(viewportsDuringReady).toHaveLength(1);
    detached.dispose();
  });

  it('should run host prepare and finalize viewport pass hooks during render', () => {
    const { fakeWindow } = createFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    const prepareViewportPass = vi.fn();
    const finalizeViewportPass = vi.fn();
    let frameCallback: FrameRequestCallback | null = null;
    (fakeWindow.requestAnimationFrame as ReturnType<typeof vi.fn>).mockImplementation(
      (callback: FrameRequestCallback) => {
        frameCallback = callback;
        return 1;
      },
    );
    const detached = new DetachedViewportWindow({
      createSurface: createMockSurface,
      hooks: { prepareViewportPass, finalizeViewportPass },
    });
    detached.setRenderSource({ getScene: () => new THREE.Scene() });
    expect(detached.open()).toBe(true);
    const viewport = detached.getViewport();
    expect(viewport).not.toBeNull();
    expect(frameCallback).not.toBeNull();
    frameCallback!(performance.now());
    expect(prepareViewportPass).toHaveBeenCalledWith(viewport);
    expect(finalizeViewportPass).toHaveBeenCalledWith(viewport);
    detached.dispose();
  });

  it('should set the popup document favicon via JavaScript after shell write', () => {
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.href = 'https://example.test/favicon.ico';
    document.head.appendChild(favicon);
    const { fakeWindow, head } = createFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    const detached = new DetachedViewportWindow({ createSurface: createMockSurface });
    detached.setRenderSource({ getScene: () => new THREE.Scene() });
    expect(detached.open()).toBe(true);
    const applied = head.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    expect(applied).not.toBeNull();
    expect(applied!.href).toContain('favicon.ico');
    expect(fakeWindow.document.title).toContain('Detached Viewport');
    favicon.remove();
    detached.dispose();
  });

  it('should invoke host hooks and support viewport type menu wiring', () => {
    const { fakeWindow } = createFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    const ready = vi.fn();
    const detached = new DetachedViewportWindow({
      createSurface: createMockSurface,
      hooks: { onViewportReady: ready },
    });
    detached.setRenderSource({ getScene: () => new THREE.Scene() });
    expect(detached.open()).toBe(true);
    expect(ready).toHaveBeenCalledTimes(1);
    const viewport = detached.getViewport();
    expect(viewport).not.toBeNull();
    const toolbar = viewport!.getViewportToolbar();
    expect(toolbar.getTitleElement().getAttribute('aria-haspopup')).toBe('menu');
    toolbar.getTitleElement().click();
    const panel = toolbar.getTypeMenuPanel();
    expect(panel?.isOpen()).toBe(true);
    expect(
      panel!.getElement().ownerDocument.body.contains(panel!.getElement()) || panel!.getElement().parentElement,
    ).toBeTruthy();
    const topRow = Array.from(panel!.getElement().querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('Top'),
    );
    expect(topRow).toBeDefined();
    topRow!.click();
    expect(ready).toHaveBeenCalledTimes(2);
    expect(detached.getViewport()?.getViewportKind()).toBe(ViewportKind.TOP);
    detached.dispose();
  });

  it('should release all resources when a popup is closed without dispose', () => {
    const { fakeWindow } = createFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    let surface: SharedWebGLSurface | null = null;
    const detached = new DetachedViewportWindow({
      createSurface: (host) => {
        surface = createMockSurface(host);
        return surface;
      },
    });
    detached.setRenderSource({ getScene: () => new THREE.Scene() });
    expect(detached.open()).toBe(true);
    expect(detached.hasRenderer()).toBe(true);
    const beforeUnload = (fakeWindow.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === 'beforeunload',
    )?.[1] as (() => void) | undefined;
    expect(beforeUnload).toBeTypeOf('function');
    Object.defineProperty(fakeWindow, 'closed', { value: true, configurable: true });
    beforeUnload!();
    expect(detached.isOpen()).toBe(false);
    expect(detached.hasRenderer()).toBe(false);
    expect(surface!.getRenderer().dispose).toHaveBeenCalled();
    detached.dispose();
  });

  it('should notify host when popup windows open and close for shortcut wiring', () => {
    const { fakeWindow } = createFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    const ready = vi.fn();
    const closed = vi.fn();
    const detached = new DetachedViewportWindow({
      createSurface: createMockSurface,
      hooks: {
        onPopupWindowReady: ready,
        onPopupWindowClosed: closed,
      },
    });
    detached.setRenderSource({ getScene: () => new THREE.Scene() });
    expect(detached.open()).toBe(true);
    expect(ready).toHaveBeenCalledWith(fakeWindow, expect.any(String));
    detached.close();
    expect(closed).toHaveBeenCalledWith(fakeWindow, expect.any(String));
    detached.dispose();
  });

  it('should start a host-liveness watch on the popup window', () => {
    const { fakeWindow } = createFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    const detached = new DetachedViewportWindow({ createSurface: createMockSurface });
    detached.setRenderSource({ getScene: () => new THREE.Scene() });
    expect(detached.open()).toBe(true);
    expect(fakeWindow.setInterval).toHaveBeenCalledWith(expect.any(Function), 500);
    detached.dispose();
  });

  it('should close the popup when the opener host is gone', () => {
    const { fakeWindow, hostOpener } = createFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    const detached = new DetachedViewportWindow({ createSurface: createMockSurface });
    detached.setRenderSource({ getScene: () => new THREE.Scene() });
    expect(detached.open()).toBe(true);
    const watchCallback = (fakeWindow.setInterval as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      (() => void) | undefined;
    expect(watchCallback).toBeTypeOf('function');
    hostOpener.closed = true;
    watchCallback!();
    expect(fakeWindow.close).toHaveBeenCalled();
    expect(detached.isOpen()).toBe(false);
    detached.dispose();
  });

  it('should close all popups when the parent page unloads', () => {
    const first = createFakePopup();
    const second = createFakePopup();
    vi.spyOn(window, 'open').mockReturnValueOnce(first.fakeWindow).mockReturnValueOnce(second.fakeWindow);
    const detached = new DetachedViewportWindow({ createSurface: createMockSurface });
    detached.setRenderSource({ getScene: () => new THREE.Scene() });
    expect(detached.open()).toBe(true);
    expect(detached.open()).toBe(true);
    expect(detached.getOpenCount()).toBe(2);
    window.dispatchEvent(new Event('pagehide'));
    expect(first.fakeWindow.close).toHaveBeenCalled();
    expect(second.fakeWindow.close).toHaveBeenCalled();
    expect(detached.getOpenCount()).toBe(0);
    detached.dispose();
  });
});
