import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EditEdgeCutTool } from '@/edit/tool/edit_edge_cut_tool.js';
import { EditSelectTool } from '@/edit/tool/edit_select_tool.js';
import type { EditorWindow } from '@/editor/window/editor_window.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import type { EditEdgeParameterHit } from '@/edit/pick/edit_edge_parameter_pick.js';
import { TransformMode } from '@/types/transform_mode.js';

describe('edit_edge_cut_tool', () => {
  it('is busy while single-use until cancelled', () => {
    const tool = new EditEdgeCutTool();
    const parent = new EditSelectTool();
    tool.parent = parent;
    expect(tool.isSingleUse).toBe(true);
    expect(tool.isBusy()).toBe(true);
    tool.onKeyDown('Escape');
    expect(tool.isBusy()).toBe(false);
  });

  it('stays busy after a click with no hovered edge', () => {
    const tool = new EditEdgeCutTool();
    tool.parent = new EditSelectTool();
    tool.onActivate();
    tool.onMouseDown(0);
    expect(tool.isBusy()).toBe(true);
  });

  it('commits the snapped parameter and forwards the Shift invert flag', () => {
    const raw = 0.3;
    const snapped = 0.25;
    const harness = createKnifeSnapHarness(raw, snapped, true);
    harness.tool.onActivate();
    harness.tool.onRender();
    expect(harness.shiftSamples).toEqual([true]);
    harness.tool.onMouseDown(0);
    expect(harness.commits).toEqual([{ targetId: 'mesh', vertexA: 0, vertexB: 1, parameter: snapped }]);
    expect(harness.tool.isBusy()).toBe(false);
  });

  it('forwards Shift released so snap can stay on', () => {
    const harness = createKnifeSnapHarness(0.3, 0.25, false);
    harness.tool.onActivate();
    harness.tool.onRender();
    expect(harness.shiftSamples).toEqual([false]);
    harness.tool.onMouseDown(0);
    expect(harness.commits[0]?.parameter).toBe(0.25);
  });
});

/** Recorded knife split. */
interface KnifeCommit {
  targetId: string;
  vertexA: number;
  vertexB: number;
  parameter: number;
}

/** Knife tool plus spies for snap and commit. */
interface KnifeSnapHarness {
  tool: EditEdgeCutTool;
  commits: KnifeCommit[];
  shiftSamples: boolean[];
}

/**
 * Builds a knife tool aimed at one edge, with a snap service that records
 * Shift.
 *
 * @param rawParameter Unsnapped hover parameter.
 * @param snappedParameter Parameter the snap service returns.
 * @param shiftHeld Initial Shift state.
 * @returns Harness.
 */
function createKnifeSnapHarness(rawParameter: number, snappedParameter: number, shiftHeld: boolean): KnifeSnapHarness {
  const tool = new EditEdgeCutTool();
  const parent = new EditSelectTool();
  tool.parent = parent;
  const commits: KnifeCommit[] = [];
  const shiftSamples: boolean[] = [];
  const hit = createKnifeHit(rawParameter);
  const editor = createKnifeEditor(tool, hit, snappedParameter, commits, shiftSamples, shiftHeld);
  tool.editor = editor;
  return { tool, commits, shiftSamples };
}

/**
 * Builds a stationary edge hit.
 *
 * @param parameter Unsnapped parameter.
 * @returns Hit.
 */
function createKnifeHit(parameter: number): EditEdgeParameterHit {
  const worldA = new THREE.Vector3(0, 0, 0);
  const worldB = new THREE.Vector3(4, 0, 0);
  return {
    targetId: 'mesh',
    vertexA: 0,
    vertexB: 1,
    parameter,
    worldPoint: worldA.clone().lerp(worldB, parameter),
    edgeDirection: worldB.clone().sub(worldA),
    worldA,
    worldB,
  };
}

/**
 * Builds an editor double for one knife pass.
 *
 * @param tool Knife tool.
 * @param hit Unsnapped hover hit.
 * @param snappedParameter Parameter the snap service returns.
 * @param commits Commit log.
 * @param shiftSamples Recorded Shift flags.
 * @param shiftHeld Live Shift state.
 * @returns Editor double.
 */
function createKnifeEditor(
  tool: EditEdgeCutTool,
  hit: EditEdgeParameterHit,
  snappedParameter: number,
  commits: KnifeCommit[],
  shiftSamples: boolean[],
  shiftHeld: boolean,
): EditorWindow {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const editor = {
    lastPointerClientX: 0,
    lastPointerClientY: 0,
    lastPointerOwnerDocument: null,
    isShiftPressed: shiftHeld,
    switchTool() {
      tool.onDeactivate();
    },
    getServices: () => createKnifeServices(scene, camera, hit, snappedParameter, commits, shiftSamples),
  };
  return editor as unknown as EditorWindow;
}

/**
 * Builds the services the knife tool calls during one pass.
 *
 * @param scene Overlay scene.
 * @param camera Active camera.
 * @param hit Unsnapped hover hit.
 * @param snappedParameter Parameter the snap service returns.
 * @param commits Commit log.
 * @param shiftSamples Recorded Shift flags.
 * @returns Services.
 */
function createKnifeServices(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  hit: EditEdgeParameterHit,
  snappedParameter: number,
  commits: KnifeCommit[],
  shiftSamples: boolean[],
): EditorServices {
  return {
    pickEditEdgeParameter: () => hit,
    snapEditKnifeParameter: (
      _worldA: THREE.Vector3,
      _worldB: THREE.Vector3,
      _parameter: number,
      shiftHeld: boolean,
    ) => {
      shiftSamples.push(shiftHeld);
      return snappedParameter;
    },
    splitEditEdge: (targetId: string, vertexA: number, vertexB: number, parameter: number) => {
      commits.push({ targetId, vertexA, vertexB, parameter });
      return true;
    },
    getPrimaryScene: () => scene,
    getActiveCamera: () => camera,
    setStatusMessage: () => undefined,
    getWidgetMode: () => TransformMode.BOUNDS,
    refreshGizmoPresentation: () => undefined,
  } as unknown as EditorServices;
}
