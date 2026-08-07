import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoordinatorShadingMode } from '@/navigation/camera/coordinator_shading_mode.js';
import { ControllerSelectionVisual } from '@/selection/object/controller_selection_visual.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { ShadingMode } from '@/types/shading_mode.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import type { ControllerViewportShading } from '@/viewports/shading/controller_viewport_shading.js';
import type { ViewportToolbar } from '@/ui/viewport_chrome/viewport_toolbar.js';

/**
 * Builds a minimal viewport stand-in for activation and toolbar wiring tests.
 *
 * @param shadingMode Initial shading mode reported by the viewport.
 * @returns Mock viewport editor.
 */
function createMockViewport(shadingMode: ShadingMode = ShadingMode.SOLID): ViewportEditor {
  const shadingController = {
    getShadingMode: () => shadingMode,
  } as unknown as ControllerViewportShading;
  const toolbar = {
    setActiveShadingMode: vi.fn(),
    setContentWireframesActive: vi.fn(),
    setProjectedGridActive: vi.fn(),
    setOnShadingMode: vi.fn(),
    setOnContentWireframesToggle: vi.fn(),
    setOnProjectedGridToggle: vi.fn(),
    setOnFit: vi.fn(),
  } as unknown as ViewportToolbar;
  return {
    getShadingController: () => shadingController,
    getShadingMode: () => shadingMode,
    setShadingMode: vi.fn(),
    areContentWireframesVisible: () => true,
    isProjectedGridVisible: () => true,
    setContentWireframesVisible: vi.fn(),
    setProjectedGridVisible: vi.fn(),
    getViewportToolbar: () => toolbar,
    updateShadingMeshes: vi.fn(),
    collectSelectableObjects: () => [],
    getWorldGroup: () => null,
  } as unknown as ViewportEditor;
}

describe('CoordinatorShadingMode', () => {
  let elements: HTMLElement[];
  let viewports: ViewportEditor[];
  let coordinator: CoordinatorShadingMode;

  beforeEach(() => {
    elements = [document.createElement('div'), document.createElement('div')];
    viewports = [createMockViewport(), createMockViewport(ShadingMode.WIREFRAME)];
    const selectionVisualController = {
      setShadingControllers: vi.fn(),
    } as unknown as ControllerSelectionVisual;
    coordinator = new CoordinatorShadingMode(
      () => viewports,
      () => elements,
      selectionVisualController,
      null,
    );
    coordinator.wireControls({ setOnShadingMode: vi.fn() } as unknown as HandlerKeyboardShortcut, vi.fn());
  });

  it('starts with the first viewport as active', () => {
    expect(coordinator.getActiveViewportIndex()).toBe(0);
  });

  it('activates the viewport under the pointer on enter without requiring a click', () => {
    elements[1]!.dispatchEvent(new Event('pointerenter'));
    expect(coordinator.getActiveViewportIndex()).toBe(1);
  });

  it('activates the viewport under the pointer on move so F can target hover', () => {
    elements[1]!.dispatchEvent(new Event('pointermove'));
    expect(coordinator.getActiveViewportIndex()).toBe(1);
    elements[0]!.dispatchEvent(new Event('pointermove'));
    expect(coordinator.getActiveViewportIndex()).toBe(0);
  });

  it('still activates on pointer down for click selection of the active pane', () => {
    elements[1]!.dispatchEvent(new Event('pointerdown'));
    expect(coordinator.getActiveViewportIndex()).toBe(1);
  });

  it('wires content wireframes and projected grid toggles on every toolbar', () => {
    const toolbar0 = viewports[0]!.getViewportToolbar() as unknown as {
      setOnContentWireframesToggle: ReturnType<typeof vi.fn>;
      setOnProjectedGridToggle: ReturnType<typeof vi.fn>;
    };
    expect(toolbar0.setOnContentWireframesToggle).toHaveBeenCalledTimes(1);
    expect(toolbar0.setOnProjectedGridToggle).toHaveBeenCalledTimes(1);
    const wireframeToggle = toolbar0.setOnContentWireframesToggle.mock.calls[0]![0] as (visible: boolean) => void;
    wireframeToggle(false);
    expect(viewports[0]!.setContentWireframesVisible).toHaveBeenCalledWith(false);
  });
});
