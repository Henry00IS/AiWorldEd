import { describe, expect, it } from 'vitest';
import { EditorWindow } from '@/editor/window/editor_window.js';
import type { EditorServices } from '@/editor/window/editor_services.js';

/**
 * Builds services whose stored pointer is older than the last mouse move.
 *
 * @param clientX Stored client X.
 * @param clientY Stored client Y.
 * @returns Services stub.
 */
function createPointerServices(clientX: number, clientY: number): EditorServices {
  return {
    getLastPointerClientPosition: () => ({ clientX, clientY }),
    getSelectedCount: () => 0,
    screenPointToGrid: (x: number, y: number) => ({ x, y }),
    setStatusMessage: () => undefined,
    setWidgetMode: () => undefined,
    refreshGizmoPresentation: () => undefined,
    isPermanentGizmoHandleDragActive: () => false,
    isNavigationBlockingTools: () => false,
    isEditModeActive: () => false,
    handleGlobalKeyDown: () => false,
  } as unknown as EditorServices;
}

/**
 * Builds a Shift keydown whose document can be resolved.
 *
 * @returns Keyboard event.
 */
function createShiftKeyDown(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { code: 'ShiftLeft', shiftKey: true, bubbles: true });
  document.body.dispatchEvent(event);
  return event;
}

describe('editor pointer coordinates while Shift is held', () => {
  it('keeps the mouse-move coordinates when Shift samples an older pointer', () => {
    const editor = new EditorWindow();
    editor.setServices(createPointerServices(12, 34));
    editor.updateMouseStateFromPointer(180, 90, document.body, -1, false, document);
    editor.onKeyDown('ShiftLeft', createShiftKeyDown());
    expect(editor.lastPointerClientX).toBe(180);
    expect(editor.lastPointerClientY).toBe(90);
    expect(editor.mousePosition.x).toBe(180);
    expect(editor.mousePosition.y).toBe(90);
  });

  it('adopts a pointer sample when the mouse has not moved yet', () => {
    const editor = new EditorWindow();
    editor.setServices(createPointerServices(12, 34));
    editor.onKeyDown('ShiftLeft', createShiftKeyDown());
    expect(editor.lastPointerClientX).toBe(12);
    expect(editor.lastPointerClientY).toBe(34);
    expect(editor.hasLastPointerClient).toBe(true);
  });
});
