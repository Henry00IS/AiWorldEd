import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { EditSelectTool } from '@/edit/tool/edit_select_tool.js';
import { EditEdgeBevelTool } from '@/edit/tool/edit_edge_bevel_tool.js';
import type { EditorServices } from '@/editor/window/editor_services.js';

/**
 * Opens an editor on the Edit Select tool. The pointer ray looks down -Z
 * through (clientX / 100, clientY / 100) and the edges are centred on the
 * origin.
 *
 * @returns Editor and the recorded bevel widths.
 */
function openBevelEditor(): { editor: EditorWindow; widths: number[] } {
  const widths: number[] = [];
  const editor = new EditorWindow();
  const operations = {
    describeEdgeBevelCentre: () => ({ anchor: new THREE.Vector3(), direction: new THREE.Vector3(0, 1, 0) }),
    previewEdgeBevel: () => [],
    bevelSelectedEdges: (width: number) => widths.push(width) > 0,
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
  return { editor, widths };
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

describe('EditEdgeBevelTool', () => {
  it('starts from Ctrl+B and widens the bevel as the pointer moves away', () => {
    const { editor, widths } = openBevelEditor();
    movePointer(editor, 10, 0);
    expect(editor.activeTool?.onKeyDown('KeyB', new KeyboardEvent('keydown', { code: 'KeyB', ctrlKey: true }))).toBe(
      true,
    );
    expect(editor.activeTool).toBeInstanceOf(EditEdgeBevelTool);
    movePointer(editor, 30, 40);
    editor.activeTool?.onMouseDown(0);
    expect(widths).toHaveLength(1);
    expect(widths[0]).toBeCloseTo(0.4, 9);
    expect(editor.activeTool).toBeInstanceOf(EditSelectTool);
  });

  it('takes a typed width and cancels with Escape', () => {
    const { editor, widths } = openBevelEditor();
    editor.useEditMeshTool('bevel_edges');
    for (const key of ['Digit0', 'Period', 'Digit2', 'Digit5']) editor.activeTool?.onKeyDown(key);
    movePointer(editor, 90, 0);
    editor.activeTool?.onKeyDown('Enter');
    expect(widths).toEqual([0.25]);
    editor.useEditMeshTool('bevel_edges');
    editor.activeTool?.onKeyDown('Escape');
    expect(widths).toHaveLength(1);
    expect(editor.activeTool).toBeInstanceOf(EditSelectTool);
  });
});
