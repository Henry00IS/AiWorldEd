import { afterEach, describe, expect, it, vi } from 'vitest';
import { DetachedViewportPanes, type DetachedViewportPanesHost } from '@/viewports/detached/detached_viewport_panes.js';
import { createDualTopPerspectiveLayout, createSinglePerspectiveLayout } from '@/layout/area/area_layout_presets.js';
import { listAreaLeafPlacements } from '@/layout/area/area_layout_tree.js';
import type { AreaTreeNode } from '@/layout/area/area_tree_node.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';

/** Viewport stub that records the toolbar callbacks it received. */
interface ViewportStub {
  kind: ViewportKind;
  maximized: boolean;
  onMaximize: () => void;
  onKind: (kind: ViewportKind) => void;
}

/** Host spy with the stubs it created. */
interface HostSpy {
  host: DetachedViewportPanesHost;
  stubs: Map<ViewportEditor, ViewportStub>;
  disposed: ViewportEditor[];
  layouts: AreaTreeNode[];
}

/**
 * Builds a viewport stub of one kind.
 *
 * @param kind Viewport kind.
 * @returns Viewport and its recorded state.
 */
function viewportStub(kind: ViewportKind): { viewport: ViewportEditor; stub: ViewportStub } {
  const stub: ViewportStub = { kind, maximized: false, onMaximize: () => undefined, onKind: () => undefined };
  const toolbar = {
    setOnToggleMaximize: (callback: () => void) => (stub.onMaximize = callback),
    setOnViewportKindChange: (callback: (next: ViewportKind) => void) => (stub.onKind = callback),
    setMaximized: (value: boolean) => (stub.maximized = value),
  };
  const viewport = { getViewportKind: () => kind, getViewportToolbar: () => toolbar } as unknown as ViewportEditor;
  return { viewport, stub };
}

/**
 * Builds a host that records every callback.
 *
 * @returns Host spy.
 */
function hostSpy(): HostSpy {
  const spy: HostSpy = {
    stubs: new Map(),
    disposed: [],
    layouts: [],
    host: null as unknown as DetachedViewportPanesHost,
  };
  spy.host = {
    createViewport: (kind) => {
      const { viewport, stub } = viewportStub(kind);
      spy.stubs.set(viewport, stub);
      return viewport;
    },
    onViewportAdded: vi.fn(),
    disposeViewport: (viewport) => spy.disposed.push(viewport),
    detachArea: () => false,
    onLayoutChanged: (root) => spy.layouts.push(root),
  };
  return spy;
}

/**
 * Starts a pane layout in a layer of the given document.
 *
 * @param root Initial layout.
 * @param spy Host spy.
 * @param ownerDocument Document that hosts the layer.
 * @returns Started panes and their layer.
 */
function startPanes(root: AreaTreeNode, spy: HostSpy, ownerDocument: Document = document) {
  const layer = ownerDocument.createElement('div');
  ownerDocument.body.appendChild(layer);
  const panes = new DetachedViewportPanes(layer, root, spy.host);
  panes.start();
  return { panes, layer };
}

/**
 * Reads the recorded stub of a viewport.
 *
 * @param spy Host spy.
 * @param viewport Viewport.
 * @returns Stub.
 */
function stubOf(spy: HostSpy, viewport: ViewportEditor | undefined): ViewportStub {
  const stub = viewport ? spy.stubs.get(viewport) : undefined;
  if (!stub) throw new Error('unknown viewport');
  return stub;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('DetachedViewportPanes', () => {
  it('creates one registered viewport per area in layout order', () => {
    const spy = hostSpy();
    const { panes } = startPanes(createDualTopPerspectiveLayout(), spy);
    const viewports = panes.getViewports();
    expect(viewports.map((viewport) => stubOf(spy, viewport).kind)).toEqual([
      ViewportKind.TOP,
      ViewportKind.PERSPECTIVE,
    ]);
    expect(spy.host.onViewportAdded).toHaveBeenCalledTimes(2);
    expect(panes.getVisibleViewports()).toEqual(viewports);
  });

  it('maximizes one area of a split window and toggles back', () => {
    const spy = hostSpy();
    const { panes } = startPanes(createDualTopPerspectiveLayout(), spy);
    const [top, perspective] = panes.getViewports();
    stubOf(spy, perspective).onMaximize();
    expect(panes.getVisibleViewports()).toEqual([perspective]);
    expect(stubOf(spy, perspective).maximized).toBe(true);
    expect(stubOf(spy, top).maximized).toBe(false);
    expect(panes.getViewports()).toHaveLength(2);
    stubOf(spy, perspective).onMaximize();
    expect(panes.getVisibleViewports()).toEqual([top, perspective]);
    expect(stubOf(spy, perspective).maximized).toBe(false);
  });

  it('keeps a single area window unmaximized so it can still be split', () => {
    const spy = hostSpy();
    const { panes } = startPanes(createSinglePerspectiveLayout(), spy);
    const [only] = panes.getViewports();
    stubOf(spy, only).onMaximize();
    expect(stubOf(spy, only).maximized).toBe(false);
  });

  it('replaces the viewport of an area when its kind changes and reports the layout', () => {
    const spy = hostSpy();
    const { panes } = startPanes(createDualTopPerspectiveLayout(), spy);
    const [top] = panes.getViewports();
    stubOf(spy, top).onKind(ViewportKind.FRONT);
    expect(spy.disposed).toEqual([top]);
    expect(stubOf(spy, panes.getViewports()[0]).kind).toBe(ViewportKind.FRONT);
    const reported = spy.layouts.at(-1);
    if (!reported) throw new Error('layout not reported');
    expect(listAreaLeafPlacements(reported).map((p) => p.payload.viewportKind)).toEqual([
      ViewportKind.FRONT,
      ViewportKind.PERSPECTIVE,
    ]);
  });

  it('puts splitters into the detached document and follows drags in that window', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameWindow = frame.contentWindow;
    if (frameWindow === null) throw new Error('iframe without window');
    const popup = frameWindow as Window & typeof globalThis;
    const spy = hostSpy();
    const { layer } = startPanes(createDualTopPerspectiveLayout(), spy, popup.document);
    const splitter = layer.querySelector('.editor-area-splitter-host')?.firstElementChild;
    if (!(splitter instanceof popup.HTMLElement)) throw new Error('no splitter in the detached document');
    splitter.dispatchEvent(new popup.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    popup.dispatchEvent(new popup.MouseEvent('pointerup', { bubbles: true, clientX: 12, clientY: 10 }));
    expect(spy.layouts).toHaveLength(1);
  });

  it('disposes every viewport on dispose', () => {
    const spy = hostSpy();
    const { panes } = startPanes(createDualTopPerspectiveLayout(), spy);
    const viewports = panes.getViewports();
    panes.dispose();
    expect(spy.disposed).toEqual(viewports);
    expect(panes.getViewports()).toEqual([]);
  });
});
