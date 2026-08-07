import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeCameraForwardSpawnPosition,
  computeOcclusionAwareSpawnPosition,
  isSpawnRaycastMesh,
  snapPositionToGrid,
} from '@/navigation/placement/object_spawn_placement.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import { getDefaultPerspectiveCameraPosition } from '@/navigation/placement/default_camera_placement.js';

/**
 * Builds a hollow cubic room from six thin wall boxes so raycasts from inside
 * hit interior faces the way inverted-world subtractive cavities do.
 *
 * @param halfExtent Distance from room center to each interior wall face.
 * @param world Group that receives the wall meshes.
 */
function addInwardFacingRoomWalls(halfExtent: number, world: THREE.Group): void {
  const thickness = 0.2;
  const span = halfExtent * 2 + thickness;
  const material = new THREE.MeshBasicMaterial();
  const wallSpecs: Array<{ size: THREE.Vector3; position: THREE.Vector3 }> = [
    {
      size: new THREE.Vector3(span, span, thickness),
      position: new THREE.Vector3(0, 0, -halfExtent - thickness * 0.5),
    },
    { size: new THREE.Vector3(span, span, thickness), position: new THREE.Vector3(0, 0, halfExtent + thickness * 0.5) },
    {
      size: new THREE.Vector3(span, thickness, span),
      position: new THREE.Vector3(0, -halfExtent - thickness * 0.5, 0),
    },
    { size: new THREE.Vector3(span, thickness, span), position: new THREE.Vector3(0, halfExtent + thickness * 0.5, 0) },
    {
      size: new THREE.Vector3(thickness, span, span),
      position: new THREE.Vector3(-halfExtent - thickness * 0.5, 0, 0),
    },
    { size: new THREE.Vector3(thickness, span, span), position: new THREE.Vector3(halfExtent + thickness * 0.5, 0, 0) },
  ];
  for (const spec of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(spec.size.x, spec.size.y, spec.size.z), material);
    wall.position.copy(spec.position);
    world.add(wall);
  }
}

/**
 * Returns signed distance from the camera along its view forward to a point.
 *
 * @param camera View camera.
 * @param point World-space point.
 * @returns Positive when the point is in front of the camera.
 */
function signedDistanceAlongView(camera: THREE.Camera, point: THREE.Vector3): number {
  const origin = new THREE.Vector3();
  const forward = new THREE.Vector3();
  camera.getWorldPosition(origin);
  camera.getWorldDirection(forward);
  return point.clone().sub(origin).dot(forward);
}

/** Unit tests for camera-front and occlusion-aware object spawn placement. */
describe('object_spawn_placement', () => {
  it('places along the camera forward at the preferred distance', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(10, 4, 20);
    camera.lookAt(10, 4, 0);
    camera.updateMatrixWorld(true);
    const position = computeCameraForwardSpawnPosition(camera, 8);
    snapPositionToGrid(position, 1);
    expect(position.z).toBeLessThan(camera.position.z);
    expect(position.x).toBeCloseTo(10, 5);
  });

  it('snaps each axis to the grid interval', () => {
    const position = new THREE.Vector3(1.4, -2.6, 3.1);
    snapPositionToGrid(position, 1);
    expect(position.x).toBe(1);
    expect(position.y).toBe(-3);
    expect(position.z).toBe(3);
  });

  it('places in the gap in front of a wall hit along the view ray', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const world = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2), new THREE.MeshBasicMaterial());
    wall.position.set(0, 0, 4);
    world.add(wall);
    world.updateMatrixWorld(true);

    const openSpace = computeCameraForwardSpawnPosition(camera, 8);
    expect(openSpace.z).toBeCloseTo(2, 5);

    const objectRadius = 0.5;
    const placed = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: 8,
      gridInterval: 0.25,
      raycastRoot: world,
      objectRadius,
    });
    const wallFrontZ = 4.1;
    expect(placed.z).toBeGreaterThanOrEqual(wallFrontZ + objectRadius - 1e-6);
    expect(placed.z).toBeLessThan(10);
    expect(placed.z).toBeGreaterThan(openSpace.z);
    expect(signedDistanceAlongView(camera, placed)).toBeGreaterThanOrEqual(0);
  });

  it('does not let grid snap push the spawn into the occluding surface', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const world = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2), new THREE.MeshBasicMaterial());
    wall.position.set(0, 0, 5);
    world.add(wall);
    world.updateMatrixWorld(true);

    const objectRadius = 0.5;
    const wallFrontZ = 5.1;
    const placed = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: 8,
      gridInterval: 0.25,
      raycastRoot: world,
      objectRadius,
    });

    expect(placed.z).toBeGreaterThanOrEqual(wallFrontZ + objectRadius - 1e-6);
  });

  it('sits in front of the startup unit brush without intersecting it', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.copy(getDefaultPerspectiveCameraPosition());
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const world = new THREE.Group();
    const existing = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    existing.position.set(0, 0, 0);
    world.add(existing);
    world.updateMatrixWorld(true);

    const objectRadius = 0.5;
    const preferredDistance = 8;
    const placed = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance,
      gridInterval: 0.25,
      raycastRoot: world,
      objectRadius,
    });

    const existingBox = new THREE.Box3().setFromCenterAndSize(existing.position, new THREE.Vector3(1, 1, 1));
    const spawnedBox = new THREE.Box3().setFromCenterAndSize(placed, new THREE.Vector3(1, 1, 1));
    const interiorSpawned = spawnedBox.clone().expandByScalar(-1e-3);
    expect(existingBox.intersectsBox(interiorSpawned)).toBe(false);
    const along = signedDistanceAlongView(camera, placed);
    expect(along).toBeGreaterThanOrEqual(0);
    expect(along).toBeLessThan(preferredDistance);
    const openSpace = computeCameraForwardSpawnPosition(camera, preferredDistance);
    const openAlong = signedDistanceAlongView(camera, openSpace);
    expect(along).toBeLessThan(openAlong);
  });

  it('keeps preferred distance when the view ray is clear', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const world = new THREE.Group();
    const farBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    farBox.position.set(0, 0, -20);
    world.add(farBox);
    world.updateMatrixWorld(true);

    const placed = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: 8,
      gridInterval: 1,
      raycastRoot: world,
      objectRadius: 0.5,
    });
    expect(placed.z).toBeCloseTo(2, 5);
  });

  it('places in front of the closest wall when the camera is inside an inverted room', () => {
    const roomHalf = 4;
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld(true);

    const world = new THREE.Group();
    addInwardFacingRoomWalls(roomHalf, world);
    world.updateMatrixWorld(true);

    const objectRadius = 0.5;
    const placed = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: 8,
      gridInterval: 0,
      raycastRoot: world,
      objectRadius,
    });

    const along = signedDistanceAlongView(camera, placed);
    expect(along).toBeGreaterThanOrEqual(0);
    expect(along).toBeLessThanOrEqual(roomHalf - objectRadius + 1e-3);
    expect(placed.z).toBeCloseTo(-(roomHalf - objectRadius), 3);
    expect(placed.z).toBeLessThan(camera.position.z);
  });

  it('never places behind the camera when a close wall leaves a tiny gap', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const world = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2), new THREE.MeshBasicMaterial());
    wall.position.set(0, 0, 0.4);
    world.add(wall);
    world.updateMatrixWorld(true);

    const objectRadius = 0.75;
    const placed = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: 8,
      gridInterval: 0,
      raycastRoot: world,
      objectRadius,
    });

    expect(signedDistanceAlongView(camera, placed)).toBeGreaterThanOrEqual(-1e-6);
    expect(placed.z).toBeLessThanOrEqual(camera.position.z + 1e-6);
  });

  it('ignores selection highlights for occlusion tests', () => {
    const highlight = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    highlight.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] = true;
    expect(isSpawnRaycastMesh(highlight)).toBe(false);
    const content = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    expect(isSpawnRaycastMesh(content)).toBe(true);
  });
});
