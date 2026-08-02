import { describe, expect, it } from 'vitest';
import { buildWorkspaceAreaWiringHost } from '@/layout/setup/layout_core_host_builders.js';
import type { LayoutCoreHostSource } from '@/layout/setup/layout_core_host_builders.js';
import type { WorkspaceSwitcherBar } from '@/ui/workspace/workspace_switcher_bar.js';
import { ViewportPresentationContext } from '@/viewports/presentation/viewport_presentation_context.js';

/**
 * Builds a minimal host source with mutable bag fields for wiring tests.
 *
 * @returns Source and live field holders.
 */
function createMutableHostSource(): {
  source: LayoutCoreHostSource;
  liveSwitcher: { current: WorkspaceSwitcherBar | null };
} {
  const toolbarContainer = document.createElement('div');
  const mainLayout = document.createElement('div');
  const viewportArea = document.createElement('div');
  toolbarContainer.appendChild(mainLayout);
  mainLayout.appendChild(viewportArea);
  const liveSwitcher = { current: null as WorkspaceSwitcherBar | null };
  const source = {
    toolbarContainer,
    viewportArea,
    viewportPaneGrid: document.createElement('div'),
    workspaceStore: {} as LayoutCoreHostSource['workspaceStore'],
    workspaceController: null,
    workspaceSwitcherBar: null as WorkspaceSwitcherBar | null,
    areaLayoutInteraction: null,
    viewportRegistry: {} as LayoutCoreHostSource['viewportRegistry'],
    viewportPaneLayout: {
      getAreaLayoutController: () => ({}) as never,
    } as unknown as LayoutCoreHostSource['viewportPaneLayout'],
    detachedViewportWindow: { open: () => false } as LayoutCoreHostSource['detachedViewportWindow'],
    sharedWorldScene: {} as LayoutCoreHostSource['sharedWorldScene'],
    worldObject: {} as LayoutCoreHostSource['worldObject'],
    transformGizmo: {} as LayoutCoreHostSource['transformGizmo'],
    viewportSyncManager: {} as LayoutCoreHostSource['viewportSyncManager'],
    selectionVisualController: undefined,
    transformInteractionBridge: undefined,
    faceModeCoordinator: undefined,
    cameraFitCoordinator: undefined,
    shadingModeCoordinator: undefined,
    clipPlaneHandler: null,
    cadRulerSystem: {} as LayoutCoreHostSource['cadRulerSystem'],
    rulerBoundsBuilder: {} as LayoutCoreHostSource['rulerBoundsBuilder'],
    transformHandler: {} as LayoutCoreHostSource['transformHandler'],
    selectionManager: {} as LayoutCoreHostSource['selectionManager'],
    statusBar: null,
    editorOverlayPolicy: {} as LayoutCoreHostSource['editorOverlayPolicy'],
    viewportPresentationContext: new ViewportPresentationContext(),
    getCameraWidgetSizePx: () => 96,
    setWorkspaceController: (controller: LayoutCoreHostSource['workspaceController']) => {
      source.workspaceController = controller;
    },
    setWorkspaceSwitcherBar: (bar: WorkspaceSwitcherBar | null) => {
      liveSwitcher.current = bar;
    },
    setAreaLayoutInteraction: (interaction: LayoutCoreHostSource['areaLayoutInteraction']) => {
      source.areaLayoutInteraction = interaction;
    },
    getViewportChromeHost: () => ({}) as ReturnType<LayoutCoreHostSource['getViewportChromeHost']>,
    resizeAll: () => undefined,
    refreshNamedViewportFields: () => undefined,
    rewireAfterAreaStructureChange: () => undefined,
    getPrimaryPerspectiveViewport: () => null,
    wireClipCallbackOnViewport: () => undefined,
    updateGizmoVisibility: () => undefined,
    attachCadRulers: () => undefined,
    showStatusMessage: () => undefined,
  } as LayoutCoreHostSource;
  return { source, liveSwitcher };
}

describe('buildWorkspaceAreaWiringHost', () => {
  it('should expose a workspace switcher bar after set for immediate insert placement', () => {
    const { source, liveSwitcher } = createMutableHostSource();
    const host = buildWorkspaceAreaWiringHost(source);
    const fakeBar = {
      getElement: () => document.createElement('div'),
    } as unknown as WorkspaceSwitcherBar;

    host.setWorkspaceSwitcherBar(fakeBar);

    expect(host.getWorkspaceSwitcherBar()).toBe(fakeBar);
    expect(liveSwitcher.current).toBe(fakeBar);
  });

  it('should place the switcher bar before the main layout row', () => {
    const { source } = createMutableHostSource();
    const host = buildWorkspaceAreaWiringHost(source);
    const statusBar = document.createElement('div');
    statusBar.dataset['role'] = 'status';
    source.toolbarContainer.appendChild(statusBar);
    const barElement = document.createElement('div');
    barElement.dataset['role'] = 'workspace-switcher';
    const fakeBar = {
      getElement: () => barElement,
    } as unknown as WorkspaceSwitcherBar;
    source.toolbarContainer.appendChild(barElement);
    host.setWorkspaceSwitcherBar(fakeBar);

    const mainLayout = source.viewportArea.parentElement;
    expect(mainLayout).not.toBeNull();
    source.toolbarContainer.insertBefore(barElement, mainLayout);

    const children = Array.from(source.toolbarContainer.children);
    const barIndex = children.indexOf(barElement);
    const mainIndex = children.indexOf(mainLayout!);
    const statusIndex = children.indexOf(statusBar);
    expect(barIndex).toBeLessThan(mainIndex);
    expect(mainIndex).toBeLessThan(statusIndex);
  });
});
