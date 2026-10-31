import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SnapPolicy } from '@/snap/policy/snap_policy.js';
import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { buildSnapAlignCache } from '@/snap/tool/snap_align_cache.js';
import type { SnapAlignHost } from '@/snap/tool/snap_align_host.js';
import { HandlerFaceAlign, type FaceAlignMode } from '@/snap/tool/handler_face_align.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';

/** Stick locks the align tools send with a commit. */
const STICK_LOCKS: TextureLockFlags = { positionLock: true, stretchLock: true };

/** Two brushes and the UV stored before a face tool runs. */
interface TiltedFacePair {
  model: SolidModel;
  near: SolidBrushInstance;
  uvBefore: SurfaceUvMatrix;
  startScale: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  startPosition: THREE.Vector3;
}

describe('face align surface locks', () => {
  it('rotates a tilted face without scaling or rewriting its UV matrix', () => {
    const scene = tiltedFacePair();
    const received = commitFaceMode(scene, 'align');
    expectRotatedSurface(scene, received);
  });

  it('seats a face without rewriting its UV matrix', () => {
    const scene = tiltedFacePair();
    const received = commitFaceMode(scene, 'seat');
    expectSeatedSurface(scene, received);
  });
});

/**
 * Builds two brushes on one view ray and paints a tilted UV on the near face.
 *
 * @returns Scene and the UV captured before the tool runs.
 */
function tiltedFacePair(): TiltedFacePair {
  const model = new SolidModel('AlignUv');
  const near = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  const far = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  near.position.set(0, 0, 1);
  near.pushTransformToMesh();
  far.position.set(0, 0, -2);
  far.pushTransformToMesh();
  model.root.updateMatrixWorld(true);
  assignTiltedFaceUv(near);
  const mesh = brushMesh(near);
  return {
    model,
    near,
    uvBefore: near.getFaceSurface(0).uv.clone(),
    startScale: mesh.scale.clone(),
    startQuaternion: mesh.quaternion.clone(),
    startPosition: mesh.position.clone(),
  };
}

/**
 * Writes a tilted UV matrix onto the first face.
 *
 * @param brush Brush that will move.
 */
function assignTiltedFaceUv(brush: SolidBrushInstance): void {
  const surface = brush.getFaceSurface(0);
  surface.uv = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0.2, 0.35), brush.faceNormalLocal(0), 37, 1.7, 0.6);
  brush.setFaceSurface(0, surface);
}

/**
 * Clicks the center of the front view twice and applies the locks the tool
 * sent.
 *
 * @param scene Prepared brushes.
 * @param mode Align rotates. Seat only slides.
 * @returns Lock flags seen at commit.
 */
function commitFaceMode(scene: TiltedFacePair, mode: FaceAlignMode): TextureLockFlags[] {
  const received: TextureLockFlags[] = [];
  const camera = createAlignCamera();
  const host = createHost(scene.model.root, camera, (meshes, locks) => {
    const flags = locks ?? { positionLock: false, stretchLock: false };
    received.push(flags);
    scene.model.prepareLiveBrushEdit(meshes, flags);
  });
  const handler = new HandlerFaceAlign(host, mode, buildSnapAlignCache(scene.model.root));
  handler.arm();
  handler.tryClick(100, 100, null);
  handler.tryClick(100, 100, null);
  expect(handler.isArmed()).toBe(false);
  return received;
}

/**
 * Checks that Face Align rotated, kept the size, and kept the UV matrix.
 *
 * @param scene Prepared brushes.
 * @param received Lock flags seen at commit.
 */
function expectRotatedSurface(scene: TiltedFacePair, received: TextureLockFlags[]): void {
  const mesh = brushMesh(scene.near);
  expect(mesh.quaternion.angleTo(scene.startQuaternion)).toBeGreaterThan(1);
  expect(mesh.scale.distanceTo(scene.startScale)).toBeLessThan(1e-6);
  expect(scene.near.getFaceSurface(0).uv.equals(scene.uvBefore)).toBe(true);
  expect(received).toEqual([STICK_LOCKS]);
}

/**
 * Checks that Seat slid, did not rotate, and kept the UV matrix.
 *
 * @param scene Prepared brushes.
 * @param received Lock flags seen at commit.
 */
function expectSeatedSurface(scene: TiltedFacePair, received: TextureLockFlags[]): void {
  const mesh = brushMesh(scene.near);
  expect(mesh.position.distanceTo(scene.startPosition)).toBeGreaterThan(0.5);
  expect(mesh.quaternion.angleTo(scene.startQuaternion)).toBeLessThan(1e-5);
  expect(scene.near.getFaceSurface(0).uv.equals(scene.uvBefore)).toBe(true);
  expect(received).toEqual([STICK_LOCKS]);
}

/**
 * Returns the brush preview mesh.
 *
 * @param brush Brush instance.
 * @returns Preview mesh.
 */
function brushMesh(brush: SolidBrushInstance): THREE.Mesh {
  const mesh = brush.mesh;
  if (!mesh) {
    throw new Error('brush mesh missing');
  }
  return mesh;
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
 * Builds a host that records the locks sent with a commit.
 *
 * @param world Scene root.
 * @param camera Viewport camera.
 * @param onCommitted Callback after a committed refresh is recorded.
 * @returns Align host.
 */
function createHost(
  world: THREE.Object3D,
  camera: THREE.Camera,
  onCommitted: (meshes: readonly THREE.Mesh[], textureLocks?: TextureLockFlags) => void,
): SnapAlignHost {
  const viewport = alignViewport(camera);
  return {
    worldObject: world,
    commandStack: new CommandStack(32),
    getViewports: () => [viewport],
    getPrimaryScene: () => new THREE.Scene(),
    getSelectedRoots: () => [],
    showStatusMessage: () => undefined,
    notifySolidTransformsLive: () => undefined,
    notifySolidTransformsCommitted: onCommitted,
    basePolicy: new SnapPolicy(),
    beginAlignChrome: () => undefined,
    endAlignChrome: () => undefined,
  };
}

/**
 * Builds a viewport stub around one camera.
 *
 * @param camera Viewport camera.
 * @returns Viewport stub.
 */
function alignViewport(camera: THREE.Camera): ViewportEditor {
  return {
    getContentElement: () => createPickElement(),
    getCamera: () => camera,
  } as ViewportEditor;
}

/**
 * Fixed pick element whose layout size and bounds are 200 by 200.
 *
 * @returns Pick element.
 */
function createPickElement(): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => pickElementRect();
  Object.defineProperty(element, 'clientWidth', { value: 200 });
  Object.defineProperty(element, 'clientHeight', { value: 200 });
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
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}
