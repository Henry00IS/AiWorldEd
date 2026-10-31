import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import { BoxSelectTool } from '@/editor/tools/box_select_tool.js';
import { RotateTool } from '@/editor/tools/rotate_tool.js';
import { TranslateTool } from '@/editor/tools/translate_tool.js';
import { EditSelectTool } from '@/edit/tool/edit_select_tool.js';
import { EditLoopCutTool } from '@/edit/tool/edit_loop_cut_tool.js';
import { ManagerInput } from '@/input/manager_input.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';

/** Modifier flags applied to a synthetic keydown. */
interface KeyModifiers {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * Builds permissive services: listed values are fixed and every other member is
 * a no-op returning undefined.
 *
 * @param selectedCount Selected object or component count.
 * @param editMode Whether edit mode is active.
 * @returns Services stub.
 */
function createServices(selectedCount: number, editMode: boolean): EditorServices {
  const fixed: Record<string, unknown> = {
    getSelectedCount: () => selectedCount,
    isEditModeActive: () => editMode,
    getTransformPivot: () => new THREE.Vector3(),
    getSelectedSegmentsAveragePosition: () => ({ x: 0, y: 0 }),
    screenPointToGrid: (x: number, y: number) => ({ x, y }),
    gridPointToScreen: (x: number, y: number) => ({ x, y }),
    getTransformTargets: () => [],
    forEachSelectedObject: () => [],
    getInteractiveViewportPickElements: () => [],
    pickObjectStackAtClientPoint: () => [],
    getGridSnap: () => 1,
    getAngleSnap: () => 15,
  };
  return new Proxy(fixed, {
    get: (target, property: string) => (property in target ? target[property] : () => undefined),
  }) as unknown as EditorServices;
}

/**
 * Dispatches a keydown on the document body so its owner document resolves.
 *
 * @param code Physical key code.
 * @param modifiers Modifier flags.
 * @returns Keyboard event.
 */
function createKeyDown(code: string, modifiers: KeyModifiers): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...modifiers });
  document.body.dispatchEvent(event);
  return event;
}

/**
 * Creates an editor on the given starting tool.
 *
 * @param selectedCount Selected count reported by services.
 * @param editMode Whether edit mode is active.
 * @returns Editor window.
 */
function createEditor(selectedCount: number, editMode: boolean): EditorWindow {
  const editor = new EditorWindow();
  editor.setServices(createServices(selectedCount, editMode));
  if (editMode) {
    editor.userSwitchToEditSelectTool();
  } else {
    editor.userSwitchToBoxSelectTool();
  }
  return editor;
}

/**
 * Sends one key press through the editor key chain.
 *
 * @param editor Editor window.
 * @param code Physical key code.
 * @param modifiers Modifier flags.
 * @returns True when the editor consumed the key.
 */
function press(editor: EditorWindow, code: string, modifiers: KeyModifiers = {}): boolean {
  return editor.onKeyDown(code, createKeyDown(code, modifiers));
}

const browserCombos: Array<[string, string, KeyModifiers]> = [
  ['Ctrl+R', 'KeyR', { ctrlKey: true }],
  ['Ctrl+Shift+R', 'KeyR', { ctrlKey: true, shiftKey: true }],
  ['Cmd+R', 'KeyR', { metaKey: true }],
  ['Cmd+Shift+R', 'KeyR', { metaKey: true, shiftKey: true }],
  ['Ctrl+W', 'KeyW', { ctrlKey: true }],
  ['Ctrl+Q', 'KeyQ', { ctrlKey: true }],
  ['Ctrl+G', 'KeyG', { ctrlKey: true }],
];

describe('editor tool keys with Ctrl or Meta held', () => {
  it.each(browserCombos)('leaves %s unconsumed with no selection in object mode', (_label, code, modifiers) => {
    const editor = createEditor(0, false);
    expect(press(editor, code, modifiers)).toBe(false);
    expect(editor.activeTool).toBeInstanceOf(BoxSelectTool);
  });

  it.each(browserCombos)('leaves %s unconsumed with a selection in object mode', (_label, code, modifiers) => {
    const editor = createEditor(1, false);
    expect(press(editor, code, modifiers)).toBe(false);
    expect(editor.activeTool).toBeInstanceOf(BoxSelectTool);
  });

  it('still switches to the rotate tool on plain R with no selection', () => {
    const editor = createEditor(0, false);
    expect(press(editor, 'KeyR')).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(RotateTool);
  });

  it('still launches single-use rotate on plain R with a selection', () => {
    const editor = createEditor(1, false);
    expect(press(editor, 'KeyR')).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(RotateTool);
    expect(editor.activeTool?.isSingleUse).toBe(true);
  });

  it('keeps Ctrl+R as loop cut in edit mode', () => {
    const editor = createEditor(1, true);
    expect(press(editor, 'KeyR', { ctrlKey: true })).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(EditLoopCutTool);
  });

  it.each([
    ['Ctrl+Shift+R', { ctrlKey: true, shiftKey: true }],
    ['Cmd+R', { metaKey: true }],
    ['Ctrl+Alt+R', { ctrlKey: true, altKey: true }],
  ] as Array<[string, KeyModifiers]>)('leaves %s unconsumed in edit mode', (_label, modifiers) => {
    const editor = createEditor(1, true);
    expect(press(editor, 'KeyR', modifiers)).toBe(false);
    expect(editor.activeTool).toBeInstanceOf(EditSelectTool);
  });

  it('leaves Ctrl+G unconsumed in edit mode while plain G still grabs', () => {
    const editor = createEditor(1, true);
    expect(press(editor, 'KeyG', { ctrlKey: true })).toBe(false);
    expect(editor.activeTool).toBeInstanceOf(EditSelectTool);
    expect(press(editor, 'KeyG')).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(TranslateTool);
  });
});

describe('browser reload shortcuts through the keyboard shortcut handler', () => {
  /**
   * Dispatches a window keydown routed through the editor and reports whether
   * the browser default was blocked.
   *
   * @param selectedCount Selected count reported by services.
   * @param modifiers Modifier flags.
   * @returns True when the keydown default was prevented.
   */
  function isReloadKeyBlocked(selectedCount: number, modifiers: KeyModifiers): boolean {
    const editor = createEditor(selectedCount, false);
    const handler = new HandlerKeyboardShortcut(new ManagerInput());
    handler.setOnToolEventRouterKeyDown((event) => editor.onKeyDown(event.code, event));
    handler.register();
    const event = new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true, cancelable: true, ...modifiers });
    window.dispatchEvent(event);
    handler.unregister();
    return event.defaultPrevented;
  }

  it('lets Ctrl+R, Ctrl+Shift+R and Cmd+R reach the browser so the unload guard can prompt', () => {
    expect(isReloadKeyBlocked(1, { ctrlKey: true })).toBe(false);
    expect(isReloadKeyBlocked(1, { ctrlKey: true, shiftKey: true })).toBe(false);
    expect(isReloadKeyBlocked(0, { metaKey: true })).toBe(false);
  });

  it('still consumes plain R as the rotate shortcut', () => {
    expect(isReloadKeyBlocked(1, {})).toBe(true);
  });
});
