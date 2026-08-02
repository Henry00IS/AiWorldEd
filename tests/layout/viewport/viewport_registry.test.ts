import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ManagerInput } from '@/input/manager_input.js';
import { ViewportRegistry } from '@/layout/viewport/viewport_registry.js';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';

/** Creates a lightweight viewport mock for registry tests without WebGL. */
function createMockViewport(kind: ViewportKind): ViewportEditor {
  let disposed = false;
  let assignedKind = kind;
  let name = kind;
  return {
    getViewportKind: () => assignedKind,
    setViewportKind: (next: ViewportKind) => {
      assignedKind = next;
    },
    setName: (next: string) => {
      name = next as ViewportKind;
    },
    getName: () => name,
    dispose: () => {
      disposed = true;
    },
    getIsDisposed: () => disposed,
  } as unknown as ViewportEditor;
}

describe('ViewportRegistry', () => {
  let registry: ViewportRegistry;
  let inputManager: ManagerInput;
  let containers: HTMLElement[];

  beforeEach(() => {
    inputManager = { dispose: vi.fn() } as unknown as ManagerInput;
    containers = [0, 1, 2, 3].map(() => document.createElement('div'));
    registry = new ViewportRegistry((kind) => createMockViewport(kind));
  });

  it('should populate the default four-pane quad', () => {
    registry.populateDefaultQuad(containers, {
      inputManager,
      sharedScene: {} as never,
      surface: {} as never,
      getCameraWidgetSizePx: () => 144,
    });
    expect(registry.getPanes()).toHaveLength(4);
    expect(registry.getAllViewports()).toHaveLength(4);
    expect(registry.getActiveViewports()).toHaveLength(4);
  });

  it('should retain the widget-size factory getter for newly created panes', () => {
    const requestedSizes: number[] = [];
    registry = new ViewportRegistry((kind, _container, dependencies) => {
      requestedSizes.push(dependencies.getCameraWidgetSizePx?.() ?? 0);
      return createMockViewport(kind);
    });
    registry.populateDefaultQuad(containers, {
      inputManager,
      sharedScene: {} as never,
      surface: {} as never,
      getCameraWidgetSizePx: () => 144,
    });

    expect(requestedSizes).toEqual([144, 144, 144, 144]);
  });

  it('should create Top Front Side Perspective by default', () => {
    registry.populateDefaultQuad(containers, { inputManager, sharedScene: {} as never, surface: {} as never });
    const kinds = registry.getAllViewports().map((viewport) => viewport.getViewportKind());
    expect(kinds).toEqual([ViewportKind.TOP, ViewportKind.FRONT, ViewportKind.SIDE, ViewportKind.PERSPECTIVE]);
  });

  it('returns active viewports orthographic-first then perspective for multi-view draw', () => {
    registry.populateDefaultQuad(containers, { inputManager, sharedScene: {} as never, surface: {} as never });
    const defaultKinds = registry.getActiveViewports().map((viewport) => viewport.getViewportKind());
    expect(defaultKinds).toEqual([ViewportKind.TOP, ViewportKind.FRONT, ViewportKind.SIDE, ViewportKind.PERSPECTIVE]);
    registry.replaceKind(registry.getPanes()[0]!.getId(), ViewportKind.PERSPECTIVE);
    registry.replaceKind(registry.getPanes()[3]!.getId(), ViewportKind.TOP);
    const reorderedKinds = registry.getActiveViewports().map((viewport) => viewport.getViewportKind());
    expect(reorderedKinds).toEqual([ViewportKind.FRONT, ViewportKind.SIDE, ViewportKind.TOP, ViewportKind.PERSPECTIVE]);
    const registrationKinds = registry.getAllViewports().map((viewport) => viewport.getViewportKind());
    expect(registrationKinds).toEqual([
      ViewportKind.PERSPECTIVE,
      ViewportKind.FRONT,
      ViewportKind.SIDE,
      ViewportKind.TOP,
    ]);
  });

  it('keeps registration pane indices stable when render order changes', () => {
    registry.populateDefaultQuad(containers, { inputManager, sharedScene: {} as never, surface: {} as never });
    const topPaneId = registry.getPanes()[0]!.getId();
    registry.replaceKind(topPaneId, ViewportKind.PERSPECTIVE);
    expect(registry.getPaneByIndex(0)?.getId()).toBe(topPaneId);
    expect(registry.getPaneByIndex(0)?.getKind()).toBe(ViewportKind.PERSPECTIVE);
  });

  it('should replace a pane kind by disposing and creating a new instance', () => {
    registry.populateDefaultQuad(containers, { inputManager, sharedScene: {} as never, surface: {} as never });
    const pane = registry.getPanes()[0]!;
    const previous = pane.getViewport();
    expect(previous).toBeTruthy();
    const replaced = registry.replaceKind(pane.getId(), ViewportKind.PERSPECTIVE);
    expect(replaced).toBeTruthy();
    expect(previous!.getIsDisposed()).toBe(true);
    expect(pane.getKind()).toBe(ViewportKind.PERSPECTIVE);
    expect(pane.getViewport()).toBe(replaced);
    expect(replaced!.getViewportKind()).toBe(ViewportKind.PERSPECTIVE);
  });

  it('should filter active viewports when pane ids are restricted', () => {
    registry.populateDefaultQuad(containers, { inputManager, sharedScene: {} as never, surface: {} as never });
    const onlyPerspective = registry.getPanes()[3]!.getId();
    registry.setActivePaneIds([onlyPerspective]);
    expect(registry.getActiveViewports()).toHaveLength(1);
    expect(registry.getActiveViewports()[0]!.getViewportKind()).toBe(ViewportKind.PERSPECTIVE);
    expect(registry.getAllViewports()).toHaveLength(4);
  });

  it('should remove a pane entirely from the registry', () => {
    registry.populateDefaultQuad(containers, { inputManager, sharedScene: {} as never, surface: {} as never });
    const pane = registry.getPanes()[1]!;
    const instance = pane.getViewport()!;
    const paneId = pane.getId();
    expect(registry.removePane(paneId)).toBe(true);
    expect(registry.getPaneById(paneId)).toBeNull();
    expect(registry.getPanes()).toHaveLength(3);
    expect(instance.getIsDisposed()).toBe(true);
  });

  it('should clear a viewport instance without removing the pane', () => {
    registry.populateDefaultQuad(containers, { inputManager, sharedScene: {} as never, surface: {} as never });
    const pane = registry.getPanes()[1]!;
    const instance = pane.getViewport()!;
    registry.clearViewport(pane.getId());
    expect(pane.getViewport()).toBeNull();
    expect(instance.getIsDisposed()).toBe(true);
    expect(registry.getPanes()).toHaveLength(4);
  });
});
