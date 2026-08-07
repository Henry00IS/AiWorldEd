import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  onDetachedViewportDisposed,
  wireDetachedViewport,
  type LayoutDetachedViewportHost,
} from '@/layout/setup/viewport_layout_detached.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';

/**
 * Builds a detached-viewport host with spies for CAD and chrome wiring.
 *
 * @returns Host stub and spies used by assertions.
 */
function createHostStub(): {
  host: LayoutDetachedViewportHost;
  attachCadRulers: ReturnType<typeof vi.fn>;
  rebindFace: ReturnType<typeof vi.fn>;
} {
  const attachCadRulers = vi.fn();
  const rebindFace = vi.fn();
  const gizmoGroup = new THREE.Group();
  const host: LayoutDetachedViewportHost = {
    detachedViewportWindow: {} as never,
    sharedWorldScene: { getScene: () => new THREE.Scene() } as never,
    worldObject: new THREE.Group(),
    transformGizmo: {
      getHandleGroupClone: () => gizmoGroup,
    } as never,
    viewportSyncManager: {
      resolveToWorldMesh: (mesh: THREE.Mesh) => mesh,
    } as never,
    selectionVisualController: {
      wireViewports: vi.fn(),
      refreshFromSelection: vi.fn(),
    } as never,
    transformInteractionBridge: {
      wireViewports: vi.fn(),
    } as never,
    faceModeCoordinator: {
      rebindViewportFaceCallbacks: rebindFace,
    } as never,
    cameraFitCoordinator: {
      fitSpecificViewport: vi.fn(),
    } as never,
    shadingModeCoordinator: {
      updateShadingMeshes: vi.fn(),
    } as never,
    clipPlaneHandler: null,
    getPrimaryPerspectiveViewport: () => null,
    wireClipCallbackOnViewport: vi.fn(),
    updateGizmoVisibility: vi.fn(),
    attachCadRulers,
  };
  return { host, attachCadRulers, rebindFace };
}

/**
 * Builds a minimal detached editor viewport stub with toolbar hooks.
 *
 * @returns Viewport stub used by wireDetachedViewport.
 */
function createViewportStub(): ViewportEditor {
  const camera = new THREE.PerspectiveCamera();
  const toolbar = {
    setOnFit: vi.fn(),
    setOnShadingMode: vi.fn(),
    setOnContentWireframesToggle: vi.fn(),
    setOnProjectedGridToggle: vi.fn(),
    setActiveShadingMode: vi.fn(),
    setContentWireframesActive: vi.fn(),
    setProjectedGridActive: vi.fn(),
  };
  return {
    getViewportKind: () => ViewportKind.PERSPECTIVE,
    getCamera: () => camera,
    setWorldGroup: vi.fn(),
    setMeshResolveCallback: vi.fn(),
    setGizmoGroup: vi.fn(),
    setShadingMode: vi.fn(),
    getShadingMode: () => 'solid',
    getViewportToolbar: () => toolbar,
    areContentWireframesVisible: () => true,
    isProjectedGridVisible: () => true,
    setContentWireframesVisible: vi.fn(),
    setProjectedGridVisible: vi.fn(),
    getWorldGroup: () => null,
  } as unknown as ViewportEditor;
}

describe('layout_detached_viewport CAD rulers', () => {
  it('should rebind the shared CAD ruler system when a detached viewport is wired', () => {
    const { host, attachCadRulers } = createHostStub();
    wireDetachedViewport(host, createViewportStub());
    expect(attachCadRulers).toHaveBeenCalledTimes(1);
  });

  it('should rebind CAD rulers when a detached viewport is disposed', () => {
    const { host, attachCadRulers, rebindFace } = createHostStub();
    onDetachedViewportDisposed(host);
    expect(rebindFace).toHaveBeenCalledTimes(1);
    expect(attachCadRulers).toHaveBeenCalledTimes(1);
  });
});

describe('layout_detached_viewport toolbar shading', () => {
  it('wires content wireframes and projected grid toggles on the detached toolbar', () => {
    const { host } = createHostStub();
    const viewport = createViewportStub();
    const toolbar = viewport.getViewportToolbar() as unknown as {
      setOnContentWireframesToggle: ReturnType<typeof vi.fn>;
      setOnProjectedGridToggle: ReturnType<typeof vi.fn>;
      setOnShadingMode: ReturnType<typeof vi.fn>;
    };
    wireDetachedViewport(host, viewport);
    expect(toolbar.setOnShadingMode).toHaveBeenCalledTimes(1);
    expect(toolbar.setOnContentWireframesToggle).toHaveBeenCalledTimes(1);
    expect(toolbar.setOnProjectedGridToggle).toHaveBeenCalledTimes(1);
    const wireframeToggle = toolbar.setOnContentWireframesToggle.mock.calls[0]![0] as (visible: boolean) => void;
    const projectedToggle = toolbar.setOnProjectedGridToggle.mock.calls[0]![0] as (visible: boolean) => void;
    wireframeToggle(false);
    projectedToggle(false);
    expect(viewport.setContentWireframesVisible).toHaveBeenCalledWith(false);
    expect(viewport.setProjectedGridVisible).toHaveBeenCalledWith(false);
  });
});
