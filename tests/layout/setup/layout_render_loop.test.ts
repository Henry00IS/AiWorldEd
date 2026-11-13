import { describe, expect, it, vi, afterEach } from 'vitest';
import { LayoutRenderLoop } from '@/layout/setup/layout_render_loop.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { CoordinatorCameraFit } from '@/navigation/camera/coordinator_camera_fit.js';
import { MultiViewComposer } from '@/viewports/core/multi_view_composer.js';
import type { SharedWorldScene } from '@/viewports/shared/shared_world_scene.js';
import * as THREE from 'three';

function createViewportMock(): ViewportEditor {
  const container = document.createElement('div');
  const content = document.createElement('div');
  container.appendChild(content);
  return {
    render: vi.fn(),
    prepareRender: vi.fn(),
    update: vi.fn(),
    resize: vi.fn(),
    getCamera: () => new THREE.PerspectiveCamera(),
    getContentElement: () => content,
    getContainer: () => container,
  } as unknown as ViewportEditor;
}

describe('LayoutRenderLoop', () => {
  let loop: LayoutRenderLoop;

  afterEach(() => {
    loop?.dispose();
  });

  it('should multi-view render only active viewports', async () => {
    loop = new LayoutRenderLoop();
    const visible = createViewportMock();
    const hidden = createViewportMock();
    let active: ViewportEditor[] = [visible];
    const cameraFitCoordinator = { updateAnimations: vi.fn() } as unknown as CoordinatorCameraFit;
    const render = vi.fn();
    const multiViewComposer = { render } as unknown as MultiViewComposer;
    const sharedScene = { getScene: () => new THREE.Scene() } as unknown as SharedWorldScene;
    loop.bind({
      getActiveViewports: () => active,
      cameraFitCoordinator,
      clipPlaneHandler: null,
      onBeforeRender: () => undefined,
      multiViewComposer,
      sharedScene,
    });
    loop.start();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    expect(render).toHaveBeenCalled();
    const firstCallPanes = render.mock.calls[0]?.[1] as Array<{ contentElement: HTMLElement }>;
    expect(firstCallPanes?.length).toBe(1);
    expect(firstCallPanes?.[0]?.contentElement).toBe(visible.getContentElement());
    expect(firstCallPanes?.[0]?.contentElement).not.toBe(visible.getContainer());
    active = [visible, hidden];
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    const lastCallPanes = render.mock.calls.at(-1)?.[1] as unknown[];
    expect(lastCallPanes?.length).toBe(2);
  });

  it('should prepare and end CAD ruler camera passes when cadRulerSystem is bound', async () => {
    loop = new LayoutRenderLoop();
    const camera = new THREE.PerspectiveCamera();
    const container = document.createElement('div');
    const content = document.createElement('div');
    container.appendChild(content);
    const viewport = {
      render: vi.fn(),
      prepareRender: vi.fn(),
      update: vi.fn(),
      resize: vi.fn(),
      getCamera: () => camera,
      getContentElement: () => content,
      getContainer: () => container,
    } as unknown as ViewportEditor;
    const prepareForCamera = vi.fn();
    const endCameraPass = vi.fn();
    const cameraFitCoordinator = { updateAnimations: vi.fn() } as unknown as CoordinatorCameraFit;
    const multiViewComposer = {
      render: (_scene: THREE.Scene, passes: Array<{ prepare: () => void; finalize: () => void }>) => {
        passes.forEach((pass) => {
          pass.prepare();
          pass.finalize();
        });
      },
    } as unknown as MultiViewComposer;
    const sharedScene = { getScene: () => new THREE.Scene() } as unknown as SharedWorldScene;
    loop.bind({
      getActiveViewports: () => [viewport],
      cameraFitCoordinator,
      clipPlaneHandler: null,
      cadRulerSystem: { prepareForCamera, endCameraPass } as never,
      onBeforeRender: () => undefined,
      multiViewComposer,
      sharedScene,
    });
    loop.start();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    expect(prepareForCamera).toHaveBeenCalledWith(camera);
    expect(endCameraPass).toHaveBeenCalled();
  });

  it('reuses the same multi-view pass objects and hooks across frames', async () => {
    loop = new LayoutRenderLoop();
    const visible = createViewportMock();
    const cameraFitCoordinator = { updateAnimations: vi.fn() } as unknown as CoordinatorCameraFit;
    const render = vi.fn();
    const multiViewComposer = { render } as unknown as MultiViewComposer;
    const sharedScene = { getScene: () => new THREE.Scene() } as unknown as SharedWorldScene;
    loop.bind({
      getActiveViewports: () => [visible],
      cameraFitCoordinator,
      clipPlaneHandler: null,
      onBeforeRender: () => undefined,
      multiViewComposer,
      sharedScene,
    });
    loop.start();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(2);
    const firstPasses = render.mock.calls[0]?.[1] as Array<{
      prepare?: () => void;
      finalize?: () => void;
      syncCameraSize?: (width: number, height: number) => void;
    }>;
    const secondPasses = render.mock.calls[1]?.[1] as Array<{
      prepare?: () => void;
      finalize?: () => void;
      syncCameraSize?: (width: number, height: number) => void;
    }>;
    expect(secondPasses).toBe(firstPasses);
    expect(secondPasses[0]).toBe(firstPasses[0]);
    expect(secondPasses[0]?.prepare).toBe(firstPasses[0]?.prepare);
    expect(secondPasses[0]?.finalize).toBe(firstPasses[0]?.finalize);
    expect(secondPasses[0]?.syncCameraSize).toBe(firstPasses[0]?.syncCameraSize);
  });

  it('runs work queued with afterRenderOnce once the frame has been drawn', async () => {
    loop = new LayoutRenderLoop();
    const visible = createViewportMock();
    const cameraFitCoordinator = { updateAnimations: vi.fn() } as unknown as CoordinatorCameraFit;
    const render = vi.fn();
    const multiViewComposer = { render } as unknown as MultiViewComposer;
    const sharedScene = { getScene: () => new THREE.Scene() } as unknown as SharedWorldScene;
    loop.bind({
      getActiveViewports: () => [visible],
      cameraFitCoordinator,
      clipPlaneHandler: null,
      onBeforeRender: () => undefined,
      multiViewComposer,
      sharedScene,
    });
    const ran: string[] = [];
    loop.afterRenderOnce(() => ran.push('after'));
    loop.start();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    expect(render).toHaveBeenCalled();
    expect(ran).toEqual(['after']);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    expect(ran).toEqual(['after']);
  });
});
