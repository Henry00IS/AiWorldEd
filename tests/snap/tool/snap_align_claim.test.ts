import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SnapPolicy } from '@/snap/policy/snap_policy.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { buildSnapAlignCache } from '@/snap/tool/snap_align_cache.js';
import { snapAlignClaimRoots } from '@/snap/tool/snap_align_claim.js';
import type { SnapAlignHost } from '@/snap/tool/snap_align_host.js';
import { HandlerFaceAlign } from '@/snap/tool/handler_face_align.js';
import { createHingeSnapPolicy } from '@/snap/tool/snap_hinge_policy.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import { snapSceneExternalEditNotify } from '@/snap/session/snap_scene_revision.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';

/**
 * Fixed pick element whose layout size and bounds are 200 by 200.
 *
 * @returns Pick element.
 */
function createPickElement(): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Object.defineProperty(element, 'clientWidth', { value: 200 });
  Object.defineProperty(element, 'clientHeight', { value: 200 });
  return element;
}

/**
 * Orthographic camera looking down the negative Z axis.
 *
 * @returns Camera.
 */
function createAlignCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 40);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Builds an align host whose root claim answers with the given result.
 *
 * @param world Scene root.
 * @param claim Root claim result.
 * @returns Host, committed refreshes, and claimed roots.
 */
function claimHost(
  world: THREE.Object3D,
  claim: boolean,
): { host: SnapAlignHost; committed: THREE.Mesh[][]; claimed: THREE.Object3D[][] } {
  const committed: THREE.Mesh[][] = [];
  const claimed: THREE.Object3D[][] = [];
  const viewport = { getContentElement: () => createPickElement(), getCamera: () => createAlignCamera() };
  const host: SnapAlignHost = {
    worldObject: world,
    commandStack: new CommandStack(8),
    getViewports: () => [viewport as ViewportEditor],
    getPrimaryScene: () => new THREE.Scene(),
    getSelectedRoots: () => [],
    showStatusMessage: () => undefined,
    notifySolidTransformsLive: () => undefined,
    notifySolidTransformsCommitted: (meshes) => committed.push([...meshes]),
    basePolicy: new SnapPolicy(),
    beginAlignChrome: () => undefined,
    endAlignChrome: () => undefined,
    claimRoots: (roots) => claimed.push([...roots]) > 0 && claim,
  };
  return { host, committed, claimed };
}

/**
 * Builds two box brushes on one view ray, the second farther away.
 *
 * @returns Model and the near brush mesh.
 */
function brushPair(): { model: SolidModel; near: THREE.Mesh } {
  const model = new SolidModel('ClaimPair');
  const near = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  const far = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  near.position.set(0, 0, 1);
  near.pushTransformToMesh();
  far.position.set(0, 0, -2);
  far.pushTransformToMesh();
  model.root.updateMatrixWorld(true);
  if (!near.mesh) throw new Error('brush mesh missing');
  return { model, near: near.mesh };
}

/**
 * Builds a single triangle mesh.
 *
 * @param coordinates Nine vertex coordinates.
 * @returns Mesh.
 */
function triangleMesh(coordinates: number[]): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
  geometry.setIndex([0, 1, 2]);
  return new THREE.Mesh(geometry);
}

/**
 * Builds a vertex query aimed at a world point on the align camera.
 *
 * @param point World point under the pointer.
 * @returns Query.
 */
function queryAt(point: THREE.Vector3): SnapQueryRequest {
  const camera = createAlignCamera();
  const projected = point.clone().project(camera);
  return {
    policy: createHingeSnapPolicy(),
    camera,
    pointerPixels: new THREE.Vector2((projected.x * 0.5 + 0.5) * 200, (-projected.y * 0.5 + 0.5) * 200),
    viewportWidth: 200,
    viewportHeight: 200,
    rayOrigin: new THREE.Vector3(point.x, point.y, 12),
    rayDirection: new THREE.Vector3(0, 0, -1),
    worldRoot: new THREE.Group(),
    excludedRootIds: new Set(),
    excludedElementIds: new Set(),
  };
}

describe('align tools claim the source before moving it', () => {
  it('keeps the tool armed and the scene unchanged when the claim is refused', () => {
    const { model, near } = brushPair();
    const start = near.quaternion.clone();
    const { host, committed, claimed } = claimHost(model.root, false);
    const handler = new HandlerFaceAlign(host, 'align', buildSnapAlignCache(model.root));
    handler.arm();
    handler.tryClick(100, 100, null);
    handler.updateHover(100, 100, null);
    handler.tryClick(100, 100, null);
    expect(claimed.length).toBeGreaterThan(0);
    expect(handler.isArmed()).toBe(true);
    expect(committed).toEqual([]);
    expect(near.quaternion.angleTo(start)).toBeLessThan(1e-6);
  });

  it('moves the source once the claim succeeds', () => {
    const { model, near } = brushPair();
    const { host, committed, claimed } = claimHost(model.root, true);
    const handler = new HandlerFaceAlign(host, 'align', buildSnapAlignCache(model.root));
    handler.arm();
    handler.tryClick(100, 100, null);
    handler.updateHover(100, 100, null);
    handler.tryClick(100, 100, null);
    expect(claimed[0]).toEqual([near]);
    expect(committed).toEqual([[near]]);
  });

  it('selects unselected roots and reports a refused selection', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const selection = new ManagerSelection();
    expect(snapAlignClaimRoots(selection, [])).toBe(false);
    expect(snapAlignClaimRoots(selection, [mesh])).toBe(true);
    expect(selection.getAllSelectedObjectsAsArray()).toEqual([mesh]);
    const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selection.selectionAdmissionSet(() => false);
    expect(snapAlignClaimRoots(selection, [other])).toBe(false);
    expect(selection.getAllSelectedObjectsAsArray()).toEqual([mesh]);
  });
});

describe('align cache after a remote edit', () => {
  it('drops a target a remote member deleted', () => {
    const target = triangleMesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const world = new THREE.Group();
    world.add(target);
    world.updateMatrixWorld(true);
    const cache = buildSnapAlignCache(world);
    expect(cache.queryPreferringVertex(queryAt(new THREE.Vector3(0, 0, 0)))?.kind).toBe('vertex');
    world.remove(target);
    snapSceneExternalEditNotify();
    expect(cache.queryPreferringVertex(queryAt(new THREE.Vector3(0, 0, 0)))).toBeNull();
    expect(cache.pickFace(new THREE.Vector3(0.2, 0.2, 5), new THREE.Vector3(0, 0, -1), null)).toBeNull();
  });

  it('follows a target a remote member moved', () => {
    const target = triangleMesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const world = new THREE.Group();
    world.add(target);
    world.updateMatrixWorld(true);
    const cache = buildSnapAlignCache(world);
    target.position.set(2, 2, 0);
    world.updateMatrixWorld(true);
    snapSceneExternalEditNotify();
    const hit = cache.queryPreferringVertex(queryAt(new THREE.Vector3(2, 2, 0)));
    expect(hit?.point.distanceTo(new THREE.Vector3(2, 2, 0))).toBeLessThan(1e-4);
    expect(cache.pickFace(new THREE.Vector3(2.2, 2.2, 5), new THREE.Vector3(0, 0, -1), null)?.mesh).toBe(target);
  });
});
