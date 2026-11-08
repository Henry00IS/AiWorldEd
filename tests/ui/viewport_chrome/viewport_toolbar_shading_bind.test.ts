import { describe, expect, it, vi } from 'vitest';
import { ShadingMode } from '@/types/shading_mode.js';
import {
  bindViewportToolbarShadingControls,
  syncViewportToolbarShadingState,
  type ViewportToolbarShadingTarget,
} from '@/ui/viewport_chrome/viewport_toolbar_shading_bind.js';
import type { ViewportToolbar } from '@/ui/viewport_chrome/viewport_toolbar.js';

/**
 * Builds a shading target with a mock toolbar for binding tests.
 *
 * @returns Target and toolbar spies.
 */
function createTarget(): {
  target: ViewportToolbarShadingTarget;
  toolbar: {
    setActiveShadingMode: ReturnType<typeof vi.fn>;
    setContentWireframesActive: ReturnType<typeof vi.fn>;
    setMeshWireframesActive: ReturnType<typeof vi.fn>;
    setProjectedGridActive: ReturnType<typeof vi.fn>;
    setOnShadingMode: ReturnType<typeof vi.fn>;
    setOnContentWireframesToggle: ReturnType<typeof vi.fn>;
    setOnMeshWireframesToggle: ReturnType<typeof vi.fn>;
    setOnProjectedGridToggle: ReturnType<typeof vi.fn>;
  };
  setShadingMode: ReturnType<typeof vi.fn>;
  setContentWireframesVisible: ReturnType<typeof vi.fn>;
  setMeshWireframesVisible: ReturnType<typeof vi.fn>;
  setProjectedGridVisible: ReturnType<typeof vi.fn>;
} {
  const toolbar = {
    setActiveShadingMode: vi.fn(),
    setContentWireframesActive: vi.fn(),
    setMeshWireframesActive: vi.fn(),
    setProjectedGridActive: vi.fn(),
    setOnShadingMode: vi.fn(),
    setOnContentWireframesToggle: vi.fn(),
    setOnMeshWireframesToggle: vi.fn(),
    setOnProjectedGridToggle: vi.fn(),
  };
  const setShadingMode = vi.fn();
  const setContentWireframesVisible = vi.fn();
  const setMeshWireframesVisible = vi.fn();
  const setProjectedGridVisible = vi.fn();
  const target: ViewportToolbarShadingTarget = {
    getViewportToolbar: () => toolbar as unknown as ViewportToolbar,
    getShadingMode: () => ShadingMode.FLAT,
    setShadingMode,
    areContentWireframesVisible: () => false,
    setContentWireframesVisible,
    areMeshWireframesVisible: () => true,
    setMeshWireframesVisible,
    isProjectedGridVisible: () => false,
    setProjectedGridVisible,
  };
  return {
    target,
    toolbar,
    setShadingMode,
    setContentWireframesVisible,
    setMeshWireframesVisible,
    setProjectedGridVisible,
  };
}

describe('viewport_toolbar_shading_bind', () => {
  it('syncs toolbar active state from the viewport', () => {
    const { target, toolbar } = createTarget();
    syncViewportToolbarShadingState(target);
    expect(toolbar.setActiveShadingMode).toHaveBeenCalledWith(ShadingMode.FLAT);
    expect(toolbar.setContentWireframesActive).toHaveBeenCalledWith(false);
    expect(toolbar.setMeshWireframesActive).toHaveBeenCalledWith(true);
    expect(toolbar.setProjectedGridActive).toHaveBeenCalledWith(false);
  });

  it('routes wireframe and projected grid toggles to the viewport', () => {
    const { target, toolbar, setContentWireframesVisible, setMeshWireframesVisible, setProjectedGridVisible } =
      createTarget();
    const setShadingMode = target.setShadingMode as ReturnType<typeof vi.fn>;
    const onBeforeApply = vi.fn();
    const onAfterShadingMode = vi.fn();
    bindViewportToolbarShadingControls(target, { onBeforeApply, onAfterShadingMode });
    const onShading = toolbar.setOnShadingMode.mock.calls[0]![0] as (mode: ShadingMode) => void;
    const onWireframes = toolbar.setOnContentWireframesToggle.mock.calls[0]![0] as (visible: boolean) => void;
    const onMeshWireframes = toolbar.setOnMeshWireframesToggle.mock.calls[0]![0] as (visible: boolean) => void;
    const onGrid = toolbar.setOnProjectedGridToggle.mock.calls[0]![0] as (visible: boolean) => void;
    onShading(ShadingMode.WIREFRAME);
    onWireframes(true);
    onMeshWireframes(true);
    onGrid(true);
    expect(onBeforeApply).toHaveBeenCalledTimes(4);
    expect(setShadingMode).toHaveBeenCalledWith(ShadingMode.WIREFRAME);
    expect(onAfterShadingMode).toHaveBeenCalledWith(ShadingMode.WIREFRAME);
    expect(setContentWireframesVisible).toHaveBeenCalledWith(true);
    expect(setMeshWireframesVisible).toHaveBeenCalledWith(true);
    expect(setProjectedGridVisible).toHaveBeenCalledWith(true);
  });
});
