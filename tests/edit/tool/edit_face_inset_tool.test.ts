import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { EditSelectTool } from '@/edit/tool/edit_select_tool.js';
import { EditFaceInsetTool } from '@/edit/tool/edit_face_inset_tool.js';
import type { EditorServices } from '@/editor/window/editor_services.js';

/** Recorded inset calls. */
interface InsetCall {
  thickness: number;
  depth: number;
  grouping: string;
}

/**
 * Opens an editor on the Edit Select tool. The pointer ray looks down -Z
 * through (clientX / 100, clientY / 100), the faces sit at the origin and face
 * +Y.
 *
 * @returns Editor and the recorded inset calls.
 */
function openInsetEditor(): { editor: EditorWindow; calls: InsetCall[] } {
  const calls: InsetCall[] = [];
  const editor = new EditorWindow();
  const operations = {
    describeFaceSelectionAxis: () => ({ anchor: new THREE.Vector3(), direction: new THREE.Vector3(0, 1, 0) }),
    previewFaceInset: () => [],
    insetSelectedFaces: (thickness: number, depth: number, grouping: string) => {
      calls.push({ thickness, depth, grouping });
      return true;
    },
  };
  const overrides: Partial<EditorServices> = {
    isEditModeActive: () => true,
    getEditMeshOperations: () => operations as never,
    readEditPointerRay: (clientX, clientY) => ({
      origin: new THREE.Vector3(clientX / 100, clientY / 100, 10),
      direction: new THREE.Vector3(0, 0, -1),
    }),
    snapEditDistance: (distance) => distance,
    getPrimaryScene: () => null,
  };
  const services = new Proxy(overrides, {
    get: (target, key: string) => (key in target ? target[key as keyof EditorServices] : () => undefined),
  }) as EditorServices;
  editor.setServices(services);
  editor.userSwitchToEditSelectTool();
  return { editor, calls };
}

/**
 * Moves the editor pointer and renders a frame.
 *
 * @param editor Editor.
 * @param clientX Client X.
 * @param clientY Client Y.
 */
function movePointer(editor: EditorWindow, clientX: number, clientY: number): void {
  editor.mousePosition.set(clientX, clientY);
  editor.activeTool?.onRender();
}

describe('EditFaceInsetTool', () => {
  it('starts from I and thickens the inset as the pointer moves away from the faces', () => {
    const { editor, calls } = openInsetEditor();
    movePointer(editor, 0, 0);
    expect(editor.activeTool?.onKeyDown('KeyI')).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(EditFaceInsetTool);
    movePointer(editor, 30, 40);
    editor.activeTool?.onMouseDown(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.thickness).toBeCloseTo(0.5, 9);
    expect(calls[0]!).toMatchObject({ depth: 0, grouping: 'region' });
    expect(editor.activeTool).toBeInstanceOf(EditSelectTool);
  });

  it('switches to depth with Tab and to individual faces with I', () => {
    const { editor, calls } = openInsetEditor();
    movePointer(editor, 0, 0);
    editor.activeTool?.onKeyDown('KeyI');
    movePointer(editor, 25, 0);
    editor.activeTool?.onKeyDown('Tab');
    editor.activeTool?.onKeyDown('KeyI');
    movePointer(editor, 25, -30);
    editor.activeTool?.onKeyDown('Enter');
    expect(calls[0]!.thickness).toBeCloseTo(0.25, 9);
    expect(calls[0]!.depth).toBeCloseTo(-0.3, 9);
    expect(calls[0]!.grouping).toBe('individual');
  });

  it('takes typed values and cancels on Escape', () => {
    const { editor, calls } = openInsetEditor();
    movePointer(editor, 0, 0);
    editor.activeTool?.onKeyDown('KeyI');
    for (const key of ['Digit0', 'Period', 'Digit1']) editor.activeTool?.onKeyDown(key);
    movePointer(editor, 400, 0);
    editor.activeTool?.onKeyDown('Enter');
    expect(calls[0]!.thickness).toBeCloseTo(0.1, 9);
    editor.activeTool?.onKeyDown('KeyI');
    movePointer(editor, 100, 0);
    editor.activeTool?.onKeyDown('Escape');
    expect(calls).toHaveLength(1);
  });
});
