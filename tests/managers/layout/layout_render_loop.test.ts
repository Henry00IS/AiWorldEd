import { describe, expect, it, vi, afterEach } from 'vitest';
import { LayoutRenderLoop } from '../../../src/managers/layout/layout_render_loop.js';
import type { EditorViewport } from '../../../src/viewports/editor_viewport.js';
import { CameraFitCoordinator } from '../../../src/managers/camera/camera_fit_coordinator.js';
import { MultiViewComposer } from '../../../src/viewports/multi_view_composer.js';
import type { SharedWorldScene } from '../../../src/viewports/shared_world_scene.js';
import * as THREE from 'three';

function createViewportMock(): EditorViewport {
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
  } as unknown as EditorViewport;
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
    let active: EditorViewport[] = [visible];
    const cameraFitCoordinator = { updateAnimations: vi.fn() } as unknown as CameraFitCoordinator;
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
    } as unknown as EditorViewport;
    const prepareForCamera = vi.fn();
    const endCameraPass = vi.fn();
    const cameraFitCoordinator = { updateAnimations: vi.fn() } as unknown as CameraFitCoordinator;
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

  it('runs the next-render callback once after rendering succeeds', async () => {
    loop = new LayoutRenderLoop();
    const events: string[] = [];
    const multiViewComposer = { render: () => events.push('render') } as unknown as MultiViewComposer;
    const sharedScene = { getScene: () => new THREE.Scene() } as unknown as SharedWorldScene;
    loop.bind({
      getActiveViewports: () => [createViewportMock()],
      cameraFitCoordinator: { updateAnimations: vi.fn() } as unknown as CameraFitCoordinator,
      clipPlaneHandler: null,
      onBeforeRender: () => undefined,
      multiViewComposer,
      sharedScene,
    });
    loop.runAfterNextRender(() => events.push('ready'));
    loop.start();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    expect(events.slice(0, 2)).toEqual(['render', 'ready']);
    expect(events.filter((event) => event === 'ready')).toHaveLength(1);
  });

  it('reuses the same multi-view pass objects and hooks across frames', async () => {
    loop = new LayoutRenderLoop();
    const visible = createViewportMock();
    const cameraFitCoordinator = { updateAnimations: vi.fn() } as unknown as CameraFitCoordinator;
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
});
