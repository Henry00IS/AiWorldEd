import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  computeCameraForwardSpawnPosition,
  DEFAULT_SPAWN_DISTANCE,
} from '@/navigation/placement/object_spawn_placement.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { HandlerPrimitiveCreation } from '@/tools/creation/handler_primitive_creation.js';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';

describe('primitive creation handler', () => {
  it('places a new bevel volume along the camera view', () => {
    const world = new THREE.Group();
    const camera = cameraLookingForward();
    const handler = createHandler(world, camera);
    handler.createBevelVolume();
    const volume = requireCreatedVolume(world, null);
    const expected = computeCameraForwardSpawnPosition(camera, DEFAULT_SPAWN_DISTANCE);
    expect(volume.position.distanceTo(expected)).toBeLessThan(1e-4);
    expect(volume.position.length()).toBeGreaterThan(1);
  });

  it('places a new bevel volume through an existing volume', () => {
    const world = new THREE.Group();
    const camera = cameraLookingAlongPositiveZ();
    const room = ModifierVolumeBevel.create();
    room.scale.set(6, 6, 6);
    world.add(room);
    world.updateMatrixWorld(true);
    const handler = createHandler(world, camera);
    handler.createBevelVolume();
    const created = requireCreatedVolume(world, room);
    const expected = computeCameraForwardSpawnPosition(camera, DEFAULT_SPAWN_DISTANCE);
    const exit = room.localToWorld(new THREE.Vector3(0, 0, 0.5));
    expect(created.position.distanceTo(expected)).toBeLessThan(1e-4);
    expect(created.position.z).toBeGreaterThan(exit.z);
  });
});

/**
 * Builds a handler whose spawn camera and grid are fixed.
 *
 * @param world World that receives new meshes.
 * @param camera View camera.
 * @returns Handler.
 */
function createHandler(world: THREE.Group, camera: THREE.Camera): HandlerPrimitiveCreation {
  const handler = new HandlerPrimitiveCreation(
    new ToolPrimitiveCreation(world),
    world,
    new CommandStack(4),
    new ManagerSelection(),
  );
  handler.setActiveCameraProvider(() => camera);
  handler.setGridIntervalProvider(() => 0);
  return handler;
}

/**
 * Builds a camera looking along negative Z.
 *
 * @returns Perspective camera.
 */
function cameraLookingForward(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(3, 5, 11);
  camera.lookAt(3, 5, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Builds a camera at the origin looking along positive Z.
 *
 * @returns Perspective camera.
 */
function cameraLookingAlongPositiveZ(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, 1);
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Returns the volume created after an optional room that was already parented.
 *
 * @param world World root.
 * @param room Volume that must be ignored, or null.
 * @returns Created volume.
 */
function requireCreatedVolume(world: THREE.Object3D, room: THREE.Mesh | null): THREE.Mesh {
  const created = findVolumes(world).find((mesh) => mesh !== room);
  if (!created) throw new Error('missing bevel volume');
  return created;
}

/**
 * Collects bevel volume meshes under a root.
 *
 * @param root Scene root.
 * @returns Volume meshes.
 */
function findVolumes(root: THREE.Object3D): THREE.Mesh[] {
  const volumes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && ModifierVolumeBevel.isVolume(object)) volumes.push(object);
  });
  return volumes;
}
