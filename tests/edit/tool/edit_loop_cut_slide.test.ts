import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  clampLoopCutParameter,
  parameterOfPointOnSegment,
  projectLoopCutParameterOnLockedEdge,
} from '@/edit/tool/edit_loop_cut_slide.js';
import {
  isSegmentNearlyParallelToDirection,
  projectLoopCutParameterFromPointerRay,
} from '@/edit/tool/edit_loop_cut_slide_ray.js';
import { chooseLoopCutPreviewToShow, resolveLoopCutSlideParameter } from '@/edit/tool/edit_loop_cut_slide_resolve.js';
import { TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON } from '@/edit/topology/topology_epsilon.js';

describe('edit_loop_cut_slide', () => {
  it('projects a point on a segment to the correct parameter', () => {
    const start = new THREE.Vector3(0, 0, 0);
    const end = new THREE.Vector3(4, 0, 0);
    expect(parameterOfPointOnSegment(start, end, new THREE.Vector3(1, 0, 0))).toBeCloseTo(0.25);
    expect(parameterOfPointOnSegment(start, end, new THREE.Vector3(3, 2, 0))).toBeCloseTo(0.75);
  });

  it('keeps snapped parameters away from the endpoints', () => {
    expect(clampLoopCutParameter(0)).toBe(TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON);
    expect(clampLoopCutParameter(1)).toBe(1 - TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON);
  });

  it('uses the camera ray so perspective does not treat screen t as world t', () => {
    const worldA = new THREE.Vector3(-20, 0, 0);
    const worldB = new THREE.Vector3(20, 0, 0);
    const camera = createPerspectiveCameraLookingAtOrigin(16, 4, 6);
    const worldQuarter = worldA.clone().lerp(worldB, 0.25);
    const event = createPointerEventAtWorld(worldQuarter, camera);
    const parameter = projectLoopCutParameterOnLockedEdge(event, camera, createPickElement(), worldA, worldB);
    expect(parameter).not.toBeNull();
    expect(parameter ?? Number.NaN).toBeCloseTo(0.25, 3);
    const screenParameter = screenParameterOfWorldPoint(worldA, worldB, worldQuarter, camera);
    expect(Math.abs((parameter ?? Number.NaN) - screenParameter)).toBeGreaterThan(0.02);
  });

  it('keeps mid-edge t when the pointer is offset beside the seed', () => {
    const worldA = new THREE.Vector3(-8, 0, 0);
    const worldB = new THREE.Vector3(8, 0, 0);
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 20, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const besideMidpoint = new THREE.Vector3(0, 0, 4);
    const event = createPointerEventAtWorld(besideMidpoint, camera);
    const parameter = projectLoopCutParameterOnLockedEdge(event, camera, createPickElement(), worldA, worldB);
    expect(parameter ?? Number.NaN).toBeCloseTo(0.5, 3);
  });

  it('slides an in-plane ortho edge instead of collapsing the 2D projection', () => {
    const worldA = new THREE.Vector3(-8, 0, 0);
    const worldB = new THREE.Vector3(8, 0, 0);
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 20, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const worldPoint = worldA.clone().lerp(worldB, 0.75);
    const event = createPointerEventAtWorld(worldPoint, camera);
    const parameter = projectLoopCutParameterOnLockedEdge(event, camera, createPickElement(), worldA, worldB);
    expect(parameter ?? Number.NaN).toBeCloseTo(0.75, 4);
  });

  it('returns null when the view ray is parallel to the locked edge', () => {
    const worldA = new THREE.Vector3(0, 0, -8);
    const worldB = new THREE.Vector3(0, 0, 8);
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const event = createPointerEventAtClient(200, 200);
    expect(projectLoopCutParameterFromPointerRay(event, camera, createPickElement(), worldA, worldB)).toBeNull();
    expect(isSegmentNearlyParallelToDirection(worldA, worldB, new THREE.Vector3(0, 0, -1))).toBe(true);
  });

  it('keeps an interior raw parameter when snap would jump to an endpoint', () => {
    const range = { min: 0.05, max: 0.95 };
    expect(resolveLoopCutSlideParameter(0.33, 0, range)).toBeCloseTo(0.33);
    expect(resolveLoopCutSlideParameter(0.33, 1, range)).toBeCloseTo(0.33);
    expect(resolveLoopCutSlideParameter(0.4, 0.5, range)).toBeCloseTo(0.5);
  });

  it('clamps a slide that left the belt instead of clearing the preview', () => {
    const range = { min: 0.2, max: 0.8 };
    expect(resolveLoopCutSlideParameter(0.01, 0, range)).toBeCloseTo(0.2);
    expect(resolveLoopCutSlideParameter(0.99, 1, range)).toBeCloseTo(0.8);
  });

  it('keeps the last preview after lock when the next rebuild fails', () => {
    const last = { crossings: [{ edgeKey: '0|1', vertexA: 0, vertexB: 1, parameter: 0.5 }] };
    expect(chooseLoopCutPreviewToShow(null, last, true)).toBe(last);
    expect(chooseLoopCutPreviewToShow(null, last, false)).toBeNull();
  });

  it('keeps the last hover preview when snap is released and the rebuild fails', () => {
    const last = { crossings: [{ edgeKey: '0|1', vertexA: 0, vertexB: 1, parameter: 0.5 }] };
    expect(chooseLoopCutPreviewToShow(null, last, true)).toBe(last);
  });
});

/**
 * Builds a 400 by 400 pick element mock.
 *
 * @returns Pick element.
 */
function createPickElement(): HTMLElement {
  return {
    clientWidth: 400,
    clientHeight: 400,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 }),
  } as HTMLElement;
}

/**
 * Builds a perspective camera that looks at the origin.
 *
 * @param x Camera X.
 * @param y Camera Y.
 * @param z Camera Z.
 * @returns Camera.
 */
function createPerspectiveCameraLookingAtOrigin(x: number, y: number, z: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

/**
 * Builds a pointer event at a world point's projected client position.
 *
 * @param world World point.
 * @param camera Camera.
 * @returns Pointer event.
 */
function createPointerEventAtWorld(world: THREE.Vector3, camera: THREE.Camera): MouseEvent {
  const projected = world.clone().project(camera);
  return createPointerEventAtClient((projected.x + 1) * 0.5 * 400, (1 - (projected.y + 1) * 0.5) * 400);
}

/**
 * Builds a synthetic pointer event.
 *
 * @param clientX Client X.
 * @param clientY Client Y.
 * @returns Pointer event.
 */
function createPointerEventAtClient(clientX: number, clientY: number): MouseEvent {
  return { clientX, clientY, preventDefault: () => {}, stopPropagation: () => {} } as MouseEvent;
}

/**
 * Returns the screen-space segment parameter of a world point.
 *
 * @param worldA Segment start.
 * @param worldB Segment end.
 * @param worldPoint Query point.
 * @param camera Camera.
 * @returns Screen-space t.
 */
function screenParameterOfWorldPoint(
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
  worldPoint: THREE.Vector3,
  camera: THREE.Camera,
): number {
  const start = worldA.clone().project(camera);
  const end = worldB.clone().project(camera);
  const point = worldPoint.clone().project(camera);
  const spanX = end.x - start.x;
  const spanY = end.y - start.y;
  const lengthSq = spanX * spanX + spanY * spanY;
  if (lengthSq < 1e-12) {
    return 0;
  }
  return ((point.x - start.x) * spanX + (point.y - start.y) * spanY) / lengthSq;
}
