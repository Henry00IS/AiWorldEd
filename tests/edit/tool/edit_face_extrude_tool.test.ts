import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { EditSelectTool } from '@/edit/tool/edit_select_tool.js';
import { EditFaceExtrudeTool } from '@/edit/tool/edit_face_extrude_tool.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import type { TopologyFaceExtrudeGrouping } from '@/edit/topology/topology_face_extrude.js';

/** Recorded extrude calls. */
interface ExtrudeCall {
  distance: number;
  grouping: TopologyFaceExtrudeGrouping;
}

/**
 * Opens an editor on the Edit Select tool whose pointer ray crosses a vertical
 * extrude axis at height pointer Y divided by 100.
 *
 * @param snapStep Grid step the distance snaps to, or 0 for no snap.
 * @returns Editor and the recorded extrude calls.
 */
function openExtrudeEditor(snapStep = 0): { editor: EditorWindow; calls: ExtrudeCall[] } {
  const calls: ExtrudeCall[] = [];
  const editor = new EditorWindow();
  const operations = {
    describeFaceExtrudeAxis: () => ({ anchor: new THREE.Vector3(), direction: new THREE.Vector3(0, 1, 0) }),
    previewFaceExtrude: () => [],
    extrudeSelectedFaces: vi.fn((distance: number, grouping: TopologyFaceExtrudeGrouping) => {
      calls.push({ distance, grouping });
      return true;
    }),
  };
  const overrides: Partial<EditorServices> = {
    isEditModeActive: () => true,
    getEditMeshOperations: () => operations as never,
    readEditPointerRay: (_x, clientY) => ({
      origin: new THREE.Vector3(10, clientY / 100, 0),
      direction: new THREE.Vector3(-1, 0, 0),
    }),
    snapEditDistance: (distance) => (snapStep > 0 ? Math.round(distance / snapStep) * snapStep : distance),
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
 * Moves the editor pointer.
 *
 * @param editor Editor.
 * @param clientY Client Y.
 */
function movePointer(editor: EditorWindow, clientY: number): void {
  editor.mousePosition.set(0, clientY);
  editor.activeTool?.onRender();
}

describe('EditFaceExtrudeTool', () => {
  it('starts from E in Edit Mode and extrudes by the dragged distance on click', () => {
    const { editor, calls } = openExtrudeEditor();
    movePointer(editor, 100);
    expect(editor.activeTool?.onKeyDown('KeyE')).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(EditFaceExtrudeTool);
    movePointer(editor, 350);
    editor.activeTool?.onMouseDown(0);
    expect(calls).toEqual([{ distance: 2.5, grouping: 'region' }]);
    expect(editor.activeTool).toBeInstanceOf(EditSelectTool);
  });

  it('extrudes into the mesh when dragged behind the faces and snaps to the grid', () => {
    const { editor, calls } = openExtrudeEditor(0.5);
    movePointer(editor, 400);
    editor.activeTool?.onKeyDown('KeyE');
    movePointer(editor, 260);
    editor.activeTool?.onKeyDown('Enter');
    expect(calls[0]!.distance).toBeCloseTo(-1.5, 9);
  });

  it('uses a typed distance and leaves the mesh alone on Escape', () => {
    const { editor, calls } = openExtrudeEditor();
    movePointer(editor, 0);
    editor.activeTool?.onKeyDown('KeyE');
    for (const key of ['Minus', 'Digit0', 'Period', 'Digit7', 'Digit5']) editor.activeTool?.onKeyDown(key);
    movePointer(editor, 900);
    editor.activeTool?.onKeyDown('Enter');
    expect(calls[0]!.distance).toBeCloseTo(-0.75, 9);
    editor.activeTool?.onKeyDown('KeyE');
    movePointer(editor, 500);
    editor.activeTool?.onKeyDown('Escape');
    expect(calls).toHaveLength(1);
    expect(editor.activeTool).toBeInstanceOf(EditSelectTool);
  });
});
