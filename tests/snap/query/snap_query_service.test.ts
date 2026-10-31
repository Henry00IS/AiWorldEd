import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GizmoAxis } from '@/types/transform_mode.js';
import { createSnapHit } from '@/snap/hit/snap_hit.js';
import { SnapPolicy } from '@/snap/policy/snap_policy.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import { SnapQueryService } from '@/snap/query/snap_query_service.js';
import { snapProjectWorldToPixels } from '@/snap/query/snap_screen_project.js';
import { resolveGeometryTranslationDelta } from '@/snap/session/snap_session_translate.js';
import { appendBrushVertexHits } from '@/snap/source/snap_brush_cage_hits.js';
import { chooseSnapHit } from '@/snap/query/snap_query_winner.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SOLID_MODEL_RESULT_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';

const VIEW_SIZE = 200;

/**
 * Builds a perspective camera looking at the origin from +Z.
 *
 * @returns Updated camera.
 */
function cameraLookingAtOrigin(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 6);
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
function pointerFor(point: THREE.Vector3, camera: THREE.Camera): THREE.Vector2 {
  const pixels = new THREE.Vector2();
  const projected = snapProjectWorldToPixels(point, camera, VIEW_SIZE, VIEW_SIZE, pixels);
  if (!projected) {
    return new THREE.Vector2(VIEW_SIZE * 0.5, VIEW_SIZE * 0.5);
  }
  return projected.clone();
}

/**
 * Builds a world ray through a pixel.
 *
 * @param pointer Pixel coordinate.
 * @param camera Camera.
 * @returns Ray origin and direction.
 */
function rayThrough(pointer: THREE.Vector2, camera: THREE.Camera): { origin: THREE.Vector3; direction: THREE.Vector3 } {
  const ndc = new THREE.Vector2((pointer.x / VIEW_SIZE) * 2 - 1, -(pointer.y / VIEW_SIZE) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  return { origin: raycaster.ray.origin.clone(), direction: raycaster.ray.direction.clone() };
}

/**
 * Builds a query for a pointer over a world root.
 *
 * @param policy Snap policy.
 * @param camera Camera.
 * @param pointer Pixel coordinate.
 * @param worldRoot Scene root.
 * @param excludedElementIds Element ids to ignore.
 * @param excludedRootIds Transform roots to ignore.
 * @returns Query request.
 */
function requestFor(
  policy: SnapPolicy,
  camera: THREE.Camera,
  pointer: THREE.Vector2,
  worldRoot: THREE.Object3D,
  excludedElementIds: ReadonlySet<string>,
  excludedRootIds: ReadonlySet<string>,
): SnapQueryRequest {
  const ray = rayThrough(pointer, camera);
  return {
    policy,
    camera,
    pointerPixels: pointer,
    viewportWidth: VIEW_SIZE,
    viewportHeight: VIEW_SIZE,
    rayOrigin: ray.origin,
    rayDirection: ray.direction,
    worldRoot,
    excludedRootIds,
    excludedElementIds,
  };
}

/**
 * Enables the master switch and the requested kinds.
 *
 * @param kinds Kinds to enable.
 * @returns Active policy.
 */
function policyWith(kinds: Array<'vertex' | 'edge' | 'face'>): SnapPolicy {
  const policy = new SnapPolicy();
  policy.setMasterEnabled(true);
  policy.setVertexEnabled(kinds.includes('vertex'));
  policy.setEdgeEnabled(kinds.includes('edge'));
  policy.setFaceEnabled(kinds.includes('face'));
  return policy;
}

describe('snap query service', () => {
  it('prefers a mesh vertex under the pointer over the face', () => {
    const camera = cameraLookingAtOrigin();
    const corner = new THREE.Vector3(1, 1, 1);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const root = new THREE.Group();
    root.add(mesh);
    const service = new SnapQueryService();
    const hit = service.query(
      requestFor(policyWith(['vertex', 'face']), camera, pointerFor(corner, camera), root, new Set(), new Set()),
    );
    expect(hit?.kind).toBe('vertex');
    expect(hit?.point.distanceTo(corner)).toBeLessThan(1e-4);
  });

  it('uses the face when the pointer is away from vertices and edges', () => {
    const camera = cameraLookingAtOrigin();
    const first = new THREE.Vector3(-3, -2, 1);
    const second = new THREE.Vector3(3, -2, 1);
    const third = new THREE.Vector3(0, 4, 1);
    const centroid = first
      .clone()
      .add(second)
      .add(third)
      .multiplyScalar(1 / 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [first.x, first.y, first.z, second.x, second.y, second.z, third.x, third.y, third.z],
        3,
      ),
    );
    geometry.setIndex([0, 1, 2]);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry);
    const root = new THREE.Group();
    root.add(mesh);
    const service = new SnapQueryService();
    const hit = service.query(
      requestFor(
        policyWith(['vertex', 'edge', 'face']),
        camera,
        pointerFor(centroid, camera),
        root,
        new Set(),
        new Set(),
      ),
    );
    expect(hit?.kind).toBe('face');
    expect(hit?.point.distanceTo(centroid)).toBeLessThan(0.05);
  });

  it('drops a vertex hidden behind another mesh', () => {
    const camera = cameraLookingAtOrigin();
    const hiddenPoint = new THREE.Vector3(0, 0, -3);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(4, 4));
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
    back.position.copy(hiddenPoint);
    const root = new THREE.Group();
    root.add(front);
    root.add(back);
    const service = new SnapQueryService();
    const hit = service.query(
      requestFor(policyWith(['vertex', 'face']), camera, pointerFor(hiddenPoint, camera), root, new Set(), new Set()),
    );
    expect(hit?.kind).toBe('face');
    expect(hit?.transformRootId).toBe(front.uuid);
  });

  it('ignores an excluded vertex and still returns another vertex of the same mesh', () => {
    const camera = cameraLookingAtOrigin();
    const near = new THREE.Vector3(0, 0, 0);
    const beside = new THREE.Vector3(0.15, 0, 0);
    const far = new THREE.Vector3(0, 3, 0);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([near.x, near.y, near.z, beside.x, beside.y, beside.z, far.x, far.y, far.z], 3),
    );
    geometry.setIndex([0, 1, 2]);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry);
    const root = new THREE.Group();
    root.add(mesh);
    const service = new SnapQueryService();
    const pointer = pointerFor(near, camera);
    const first = service.query(requestFor(policyWith(['vertex']), camera, pointer, root, new Set(), new Set()));
    expect(first?.point.distanceTo(near)).toBeLessThan(1e-4);
    const second = service.query(
      requestFor(policyWith(['vertex']), camera, pointer, root, new Set([first?.elementId ?? '']), new Set()),
    );
    expect(second?.kind).toBe('vertex');
    expect(second?.point.distanceTo(beside)).toBeLessThan(1e-4);
  });

  it('returns null when geometry snap is off or Shift is held', () => {
    const camera = cameraLookingAtOrigin();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const root = new THREE.Group();
    root.add(mesh);
    const service = new SnapQueryService();
    const pointer = pointerFor(new THREE.Vector3(1, 1, 1), camera);
    const off = new SnapPolicy();
    off.setVertexEnabled(true);
    expect(service.query(requestFor(off, camera, pointer, root, new Set(), new Set()))).toBeNull();
    const shifted = policyWith(['vertex']);
    shifted.setShiftHeld(true);
    expect(service.query(requestFor(shifted, camera, pointer, root, new Set(), new Set()))).toBeNull();
  });

  it('does not snap to a compiled result mesh', () => {
    const camera = cameraLookingAtOrigin();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.userData[SOLID_MODEL_RESULT_USERDATA_KEY] = true;
    const root = new THREE.Group();
    root.add(mesh);
    const service = new SnapQueryService();
    const hit = service.query(
      requestFor(
        policyWith(['vertex', 'face']),
        camera,
        pointerFor(new THREE.Vector3(1, 1, 1), camera),
        root,
        new Set(),
        new Set(),
      ),
    );
    expect(hit).toBeNull();
  });

  it('returns a brush cage vertex from the brush source', () => {
    const camera = cameraLookingAtOrigin();
    const corner = new THREE.Vector3(1, 1, 1);
    const brush = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const model = new SolidModel('snap-brush-test');
    const instance = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    instance.brush = brush;
    const root = new THREE.Group();
    root.add(model.root);
    const service = new SnapQueryService();
    const hit = service.query(
      requestFor(policyWith(['vertex']), camera, pointerFor(corner, camera), root, new Set(), new Set()),
    );
    expect(hit?.kind).toBe('vertex');
    expect(hit?.point.distanceTo(corner)).toBeLessThan(1e-3);
    const direct: ReturnType<typeof chooseSnapHit> = chooseSnapHit(
      (() => {
        const hits: NonNullable<typeof hit>[] = [];
        appendBrushVertexHits(
          brush,
          new THREE.Matrix4(),
          'root',
          'brush',
          requestFor(policyWith(['vertex']), camera, pointerFor(corner, camera), root, new Set(), new Set()),
          hits,
        );
        return hits;
      })(),
      20,
    );
    expect(direct?.kind).toBe('vertex');
  });
});

describe('geometry translation delta', () => {
  it('returns null when the query misses so increment snap can run', () => {
    const delta = resolveGeometryTranslationDelta(
      new THREE.Vector3(),
      null,
      TransformModalAxis.None,
      null,
      new THREE.Quaternion(),
      new THREE.Quaternion(),
    );
    expect(delta).toBeNull();
  });

  it('lands the source on the hit and keeps an axis constraint', () => {
    const source = new THREE.Vector3(0, 1, 0);
    const hit = createSnapHit(new THREE.Vector3(0.4, 5, -2), new THREE.Vector3(), 'vertex', 'root', 'v', 0, null, null);
    const delta = resolveGeometryTranslationDelta(
      source,
      hit,
      TransformModalAxis.None,
      GizmoAxis.X,
      new THREE.Quaternion(),
      new THREE.Quaternion(),
    );
    expect(delta).not.toBeNull();
    if (!delta) {
      return;
    }
    expect(source.clone().add(delta).x).toBeCloseTo(0.4);
    expect(delta.y).toBeCloseTo(0);
    expect(delta.z).toBeCloseTo(0);
  });
});
