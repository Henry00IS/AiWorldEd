import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSnapHit } from '@/snap/hit/snap_hit.js';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import { SNAP_SCREEN_RADIUS_PIXELS, SnapPolicy } from '@/snap/policy/snap_policy.js';
import { snapProjectWorldToPixels } from '@/snap/query/snap_screen_project.js';
import { SnapDragController } from '@/snap/session/snap_drag_controller.js';
import { holdSnapTarget } from '@/snap/session/snap_drag_hold.js';
import { snapSceneExternalEditNotify } from '@/snap/session/snap_scene_revision.js';
import { snapDistanceToSegment } from '@/snap/solve/snap_segment_distance.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';

const VIEW_SIZE = 200;

describe('snap drag hold', () => {
  it('keeps an edge on a miss and slides the point along that edge', () => {
    const camera = frontCamera();
    const edge = edgeHit(new THREE.Vector3(-2, 0, 0));
    const pointer = pixelsFor(new THREE.Vector3(0.5, 0, 0), camera);
    const held = holdSnapTarget(null, edge, camera, pointer, VIEW_SIZE, VIEW_SIZE, SNAP_SCREEN_RADIUS_PIXELS);
    expect(held?.elementId).toBe(edge.elementId);
    expect(held?.point.distanceTo(edge.point)).toBeGreaterThan(0.2);
    expect(held && snapDistanceToSegment(held.point, edgeEnd(edge, 0), edgeEnd(edge, 1))).toBeLessThan(1e-4);
  });

  it('drops the held edge once the pointer leaves the radius', () => {
    const camera = frontCamera();
    const edge = edgeHit(new THREE.Vector3(0, 0, 0));
    const pointer = pixelsFor(new THREE.Vector3(0, 3.5, 0), camera);
    const held = holdSnapTarget(null, edge, camera, pointer, VIEW_SIZE, VIEW_SIZE, SNAP_SCREEN_RADIUS_PIXELS);
    expect(held).toBeNull();
  });

  it('replaces the held edge when a fresh vertex is in range', () => {
    const camera = frontCamera();
    const edge = edgeHit(new THREE.Vector3(0, 0, 0));
    const vertex = createSnapHit(
      new THREE.Vector3(0.2, 0.2, 0),
      new THREE.Vector3(),
      'vertex',
      'other',
      'vertex-near',
      1,
      null,
      null,
    );
    const pointer = pixelsFor(vertex.point, camera);
    const held = holdSnapTarget(vertex, edge, camera, pointer, VIEW_SIZE, VIEW_SIZE, SNAP_SCREEN_RADIUS_PIXELS);
    expect(held?.elementId).toBe(vertex.elementId);
  });
});

describe('snap drag through a disappearing target', () => {
  it('keeps the edge delta after the target mesh is removed and releases when the pointer leaves', () => {
    const scene = edgeDragScene();
    const onEdge = dragSample(scene, scene.edgePoint);
    scene.drag.beginObjectTranslation([scene.mover], scene.camera, scene.pickElement, onEdge.clientX, onEdge.clientY);
    const first = scene.drag.resolveTranslation(onEdge);
    expect(pointOnEdge(scene, first)).toBe(true);
    scene.world.remove(scene.target);
    expect(pointOnEdge(scene, scene.drag.resolveTranslation(onEdge))).toBe(true);
    expect(scene.drag.resolveTranslation(dragSample(scene, new THREE.Vector3(0, 3.5, 0)))).toBeNull();
    scene.drag.endTranslation();
    scene.drag.beginObjectTranslation([scene.mover], scene.camera, scene.pickElement, onEdge.clientX, onEdge.clientY);
    expect(scene.drag.resolveTranslation(onEdge)).toBeNull();
  });
});

describe('snap drag while a remote member edits the target', () => {
  it('drops the held edge when a remote member deletes the target mid-drag', () => {
    const scene = edgeDragScene();
    const onEdge = dragSample(scene, scene.edgePoint);
    scene.drag.beginObjectTranslation([scene.mover], scene.camera, scene.pickElement, onEdge.clientX, onEdge.clientY);
    expect(pointOnEdge(scene, scene.drag.resolveTranslation(onEdge))).toBe(true);
    scene.world.remove(scene.target);
    snapSceneExternalEditNotify();
    expect(scene.drag.resolveTranslation(onEdge)).toBeNull();
  });

  it('follows the target to where a remote member moved it mid-drag', () => {
    const scene = edgeDragScene();
    const onEdge = dragSample(scene, scene.edgePoint);
    scene.drag.beginObjectTranslation([scene.mover], scene.camera, scene.pickElement, onEdge.clientX, onEdge.clientY);
    expect(pointOnEdge(scene, scene.drag.resolveTranslation(onEdge))).toBe(true);
    scene.target.position.y = 0.5;
    scene.world.updateMatrixWorld(true);
    snapSceneExternalEditNotify();
    const moved = scene.drag.resolveTranslation(onEdge);
    expect(pointOnEdge(scene, moved)).toBe(false);
    const landed = moved ? scene.mover.getWorldPosition(new THREE.Vector3()).add(moved) : null;
    expect(landed === null || Math.abs(landed.y - scene.edgeStart.y) > 0.4).toBe(true);
  });
});

/** One edge-snap drag and the segment it should keep. */
interface EdgeDragScene {
  world: THREE.Group;
  drag: SnapDragController;
  camera: THREE.OrthographicCamera;
  pickElement: HTMLElement;
  mover: THREE.Mesh;
  target: THREE.Mesh;
  edgeStart: THREE.Vector3;
  edgeEnd: THREE.Vector3;
  edgePoint: THREE.Vector3;
}

/**
 * Builds a mover and a triangle whose near edge is the snap target.
 *
 * @returns Drag scene.
 */
function edgeDragScene(): EdgeDragScene {
  const camera = frontCamera();
  const world = new THREE.Group();
  const mover = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
  mover.position.set(0, 3, 0);
  const edgeStart = new THREE.Vector3(-2, -1, 0);
  const edgeEndPoint = new THREE.Vector3(2, -1, 0);
  const target = triangleMesh(edgeStart, edgeEndPoint, new THREE.Vector3(0, 2, 0));
  world.add(mover, target);
  world.updateMatrixWorld(true);
  return sceneFromParts(world, camera, mover, target, edgeStart, edgeEndPoint);
}

/**
 * Assembles a drag scene from a mover and a target edge.
 *
 * @param world Scene root.
 * @param camera Front camera.
 * @param mover Mesh being dragged.
 * @param target Mesh that owns the edge.
 * @param edgeStart Edge start.
 * @param edgeEndPoint Edge end.
 * @returns Drag scene.
 */
function sceneFromParts(
  world: THREE.Group,
  camera: THREE.OrthographicCamera,
  mover: THREE.Mesh,
  target: THREE.Mesh,
  edgeStart: THREE.Vector3,
  edgeEndPoint: THREE.Vector3,
): EdgeDragScene {
  const policy = new SnapPolicy();
  policy.setEdgeEnabled(true);
  return {
    world,
    drag: new SnapDragController(
      policy,
      new GridSnap(true, 1),
      () => world,
      () => null,
    ),
    camera,
    pickElement: createPickElement(),
    mover,
    target,
    edgeStart,
    edgeEnd: edgeEndPoint,
    edgePoint: edgeStart.clone().lerp(edgeEndPoint, 0.5),
  };
}

/**
 * Builds a translation sample aimed at a world point.
 *
 * @param scene Drag scene.
 * @param point World point under the pointer.
 * @returns Sample.
 */
function dragSample(
  scene: EdgeDragScene,
  point: THREE.Vector3,
): Parameters<SnapDragController['resolveTranslation']>[0] {
  const pixels = pixelsFor(point, scene.camera);
  return {
    camera: scene.camera,
    pickElement: scene.pickElement,
    clientX: pixels.x,
    clientY: pixels.y,
    modalAxis: TransformModalAxis.None,
    handleAxis: null,
    handleOrientation: new THREE.Quaternion(),
    keyboardOrientation: new THREE.Quaternion(),
  };
}

/**
 * Returns whether a delta lands on the scene edge.
 *
 * @param scene Drag scene.
 * @param delta Translation delta, or null.
 * @returns True when the moved center lies on the edge.
 */
function pointOnEdge(scene: EdgeDragScene, delta: THREE.Vector3 | null): boolean {
  if (!delta) {
    return false;
  }
  const landed = scene.mover.getWorldPosition(new THREE.Vector3()).add(delta);
  return snapDistanceToSegment(landed, scene.edgeStart, scene.edgeEnd) < 1e-3;
}

/**
 * Builds a triangle mesh.
 *
 * @param first First corner.
 * @param second Second corner.
 * @param third Third corner.
 * @returns Mesh.
 */
function triangleMesh(first: THREE.Vector3, second: THREE.Vector3, third: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  const coordinates = [first.x, first.y, first.z, second.x, second.y, second.z, third.x, third.y, third.z];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Orthographic camera looking down the negative Z axis.
 *
 * @returns Camera.
 */
function frontCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 40);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Projects a world point into the test viewport.
 *
 * @param point World point.
 * @param camera Camera.
 * @returns Pixel coordinate.
 */
function pixelsFor(point: THREE.Vector3, camera: THREE.Camera): THREE.Vector2 {
  const pixels = new THREE.Vector2();
  const projected = snapProjectWorldToPixels(point, camera, VIEW_SIZE, VIEW_SIZE, pixels);
  if (!projected) {
    throw new Error('point is behind the camera');
  }
  return projected.clone();
}

/**
 * Builds an edge hit along X through the given point.
 *
 * @param point Point stored on the hit.
 * @returns Edge hit.
 */
function edgeHit(point: THREE.Vector3): SnapHit {
  return createSnapHit(
    point,
    new THREE.Vector3(1, 0, 0),
    'edge',
    'target',
    'edge-held',
    0,
    new THREE.Vector3(-2, 0, 0),
    new THREE.Vector3(2, 0, 0),
  );
}

/**
 * Returns one endpoint of an edge hit.
 *
 * @param hit Edge hit.
 * @param index Zero for the start and one for the end.
 * @returns Endpoint.
 */
function edgeEnd(hit: SnapHit, index: number): THREE.Vector3 {
  const point = index === 0 ? hit.segmentStart : hit.segmentEnd;
  if (!point) {
    throw new Error('edge endpoint missing');
  }
  return point;
}

/**
 * Fixed pick element whose layout size and bounds are 200 by 200.
 *
 * @returns Pick element.
 */
function createPickElement(): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => pickElementRect();
  Object.defineProperty(element, 'clientWidth', { value: VIEW_SIZE });
  Object.defineProperty(element, 'clientHeight', { value: VIEW_SIZE });
  return element;
}

/**
 * Returns a 200 by 200 client rectangle.
 *
 * @returns Rectangle.
 */
function pickElementRect(): DOMRect {
  return {
    left: 0,
    top: 0,
    width: VIEW_SIZE,
    height: VIEW_SIZE,
    right: VIEW_SIZE,
    bottom: VIEW_SIZE,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}
