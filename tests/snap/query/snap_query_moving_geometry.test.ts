import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SnapPolicy } from '@/snap/policy/snap_policy.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import { SnapQueryService } from '@/snap/query/snap_query_service.js';
import { snapProjectWorldToPixels } from '@/snap/query/snap_screen_project.js';
import { snapVertexElementId } from '@/snap/hit/snap_element_id.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

const VIEW_SIZE = 400;

/**
 * Face snap while dragging: the geometry being dragged sits right under the
 * pointer (the grab point follows it), so it must neither hide the face behind
 * it nor offer its own faces as targets.
 */
describe('face snap under dragged geometry', () => {
  it('finds the face under a brush that is being moved in object mode', () => {
    const scene = buildTwoBrushScene();
    const hit = new SnapQueryService().query(
      requestOverTargetTop(scene, new Set([scene.moving.mesh!.uuid]), new Set(), new Set()),
    );
    expect(hit?.kind).toBe('face');
    expect(hit!.point.y).toBeCloseTo(scene.targetTopY, 4);
  });

  it('finds the face under a brush whose top face is being moved in edit mode', () => {
    const scene = buildTwoBrushScene();
    const movingVertices = topVertexElementIds(scene.moving);
    const hit = new SnapQueryService().query(
      requestOverTargetTop(scene, new Set(), movingVertices, new Set([scene.moving.id])),
    );
    expect(hit?.kind).toBe('face');
    expect(hit!.point.y).toBeCloseTo(scene.targetTopY, 4);
  });

  it('still lets a closer unrelated brush hide the face', () => {
    const scene = buildTwoBrushScene();
    const hit = new SnapQueryService().query(requestOverTargetTop(scene, new Set(), new Set(), new Set()));
    expect(hit?.kind).toBe('face');
    expect(hit!.point.y).toBeGreaterThan(scene.targetTopY + 0.5);
  });
});

interface TwoBrushScene {
  world: THREE.Group;
  camera: THREE.PerspectiveCamera;
  target: SolidBrushInstance;
  moving: SolidBrushInstance;
  targetTopY: number;
}

/**
 * Builds one solid with a target brush and a second brush floating above it,
 * seen from straight above.
 *
 * @returns Scene parts.
 */
function buildTwoBrushScene(): TwoBrushScene {
  const world = new THREE.Group();
  const model = new SolidModel('FaceSnapModel');
  world.add(model.root);
  const target = model.addBoxBrush(2);
  const moving = model.addBoxBrush(1);
  moving.mesh!.position.set(0.2, 3, 0.1);
  model.syncBrushesFromScene();
  model.markDirty();
  model.rebuild();
  world.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0.3, 10, 0.2);
  camera.lookAt(0.3, 0, 0.2);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return { world, camera, target, moving, targetTopY: 1 };
}

/**
 * Lists the element ids of the moving brush's top vertices.
 *
 * @param brush Brush whose top face is dragged.
 * @returns Vertex element ids.
 */
function topVertexElementIds(brush: SolidBrushInstance): Set<string> {
  const ids = new Set<string>();
  brush.brush.vertices.forEach((vertex, index) => {
    if (vertex.y > 0) ids.add(snapVertexElementId(brush.id, index));
  });
  return ids;
}

/**
 * Builds a face-only snap query with the pointer over the target's top face,
 * straight below the moving brush.
 *
 * @param scene Scene parts.
 * @param excludedRootIds Dragged transform roots.
 * @param excludedElementIds Dragged elements.
 * @param excludedOwnerIds Brushes or meshes being edited.
 * @returns Query request.
 */
function requestOverTargetTop(
  scene: TwoBrushScene,
  excludedRootIds: Set<string>,
  excludedElementIds: Set<string>,
  excludedOwnerIds: Set<string>,
): SnapQueryRequest {
  const policy = new SnapPolicy();
  policy.setMasterEnabled(true);
  policy.setFaceEnabled(true);
  const aim = new THREE.Vector3(0.3, scene.targetTopY, 0.2);
  const pointer = snapProjectWorldToPixels(aim, scene.camera, VIEW_SIZE, VIEW_SIZE, new THREE.Vector2())!.clone();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(
    new THREE.Vector2((pointer.x / VIEW_SIZE) * 2 - 1, -(pointer.y / VIEW_SIZE) * 2 + 1),
    scene.camera,
  );
  return {
    policy,
    camera: scene.camera,
    pointerPixels: pointer,
    viewportWidth: VIEW_SIZE,
    viewportHeight: VIEW_SIZE,
    rayOrigin: raycaster.ray.origin.clone(),
    rayDirection: raycaster.ray.direction.clone(),
    worldRoot: scene.world,
    excludedRootIds,
    excludedElementIds,
    excludedOwnerIds,
  };
}
