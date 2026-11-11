import { audioViewportFocus } from '@/audio/spatial/audio_viewport_focus.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoordinatorCameraFit } from '@/navigation/camera/coordinator_camera_fit.js';
import { ControllerCameraFit } from '@/navigation/camera/controller_camera_fit.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import type { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';

/**
 * Builds a minimal viewport with a container living in a given document.
 *
 * @param ownerDocument Document that owns the viewport container.
 * @returns Viewport stand-in for fit targeting tests.
 */
function createViewportForDocument(ownerDocument: Document): ViewportEditor {
  const container = ownerDocument.createElement('div');
  ownerDocument.body?.appendChild(container);
  return {
    getContainer: () => container,
  } as unknown as ViewportEditor;
}

/**
 * Builds a keyboard event whose view points at the given window.
 *
 * @param eventWindow Window that should own the key event.
 * @returns KeyboardEvent for fit targeting.
 */
function createKeyEventForWindow(eventWindow: Window): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'f', bubbles: true });
  Object.defineProperty(event, 'view', { value: eventWindow, configurable: true });
  return event;
}

describe('CoordinatorCameraFit', () => {
  let mainViewports: ViewportEditor[];
  let detachedViewports: ViewportEditor[];
  let activeIndex: number;
  let fitSpy: ReturnType<typeof vi.spyOn>;
  let coordinator: CoordinatorCameraFit;

  beforeEach(() => {
    activeIndex = 0;
    mainViewports = [createViewportForDocument(document), createViewportForDocument(document)];
    detachedViewports = [];
    fitSpy = vi.spyOn(ControllerCameraFit.prototype, 'fitViewportToSelection').mockReturnValue(1);
    const selectionManager = {
      getAllSelectedObjectsAsArray: () => [],
    } as unknown as ManagerSelection;
    coordinator = new CoordinatorCameraFit(
      selectionManager,
      null,
      () => mainViewports,
      () => activeIndex,
      () => detachedViewports,
    );
  });

  afterEach(() => {
    fitSpy.mockRestore();
    audioViewportFocus.clearAll();
  });

  it('fits the main viewport at the active index for main-window keys', () => {
    activeIndex = 1;
    coordinator.onFitToSelection(createKeyEventForWindow(window));
    expect(fitSpy).toHaveBeenCalledWith(mainViewports[1], [], expect.anything());
    expect(audioViewportFocus.getLastViewport()).toBe(mainViewports[1]);
  });

  it('fits the detached viewport when the key event comes from its window', () => {
    const detachedDocument = document.implementation.createHTMLDocument('detached');
    const detachedWindow = {
      document: detachedDocument,
    } as unknown as Window;
    Object.defineProperty(detachedDocument, 'defaultView', {
      value: detachedWindow,
      configurable: true,
    });
    const detachedViewport = createViewportForDocument(detachedDocument);
    detachedViewports = [detachedViewport];
    activeIndex = 0;
    coordinator.onFitToSelection(createKeyEventForWindow(detachedWindow));
    expect(fitSpy).toHaveBeenCalledWith(detachedViewport, [], expect.anything());
    expect(audioViewportFocus.getLastViewport()).toBe(detachedViewport);
    expect(fitSpy).not.toHaveBeenCalledWith(mainViewports[0], [], expect.anything());
  });

  it('binds fit-to-selection with the keyboard event for window targeting', () => {
    let onFit: ((event: KeyboardEvent) => void) | undefined;
    const keyboard = {
      setOnFitToSelection: (callback: (event: KeyboardEvent) => void) => {
        onFit = callback;
      },
      setOnFitAllViewports: vi.fn(),
    } as unknown as HandlerKeyboardShortcut;
    coordinator.bindKeyboardShortcuts(keyboard);
    activeIndex = 1;
    expect(onFit).toBeDefined();
    if (!onFit) {
      return;
    }
    onFit(createKeyEventForWindow(window));
    expect(fitSpy).toHaveBeenCalledWith(mainViewports[1], [], expect.anything());
    expect(audioViewportFocus.getLastViewport()).toBe(mainViewports[1]);
  });
});
