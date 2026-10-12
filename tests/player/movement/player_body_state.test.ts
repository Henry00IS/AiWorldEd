import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerBodyState } from '@/player/movement/player_body_state.js';
import { PlayerLookState } from '@/player/look/player_look_state.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import type { ManagerInput } from '@/input/manager_input.js';

/**
 * Builds a stub input manager.
 *
 * @param downKeys Held key codes.
 * @param shiftDown Whether Shift is held.
 * @returns Stub manager.
 */
function createInputStub(downKeys: string[], shiftDown: boolean = false): ManagerInput {
  const keySet = new Set(downKeys);
  return {
    isKeyDown: (code: string) => keySet.has(code),
    isPhysicalKeyDown: (code: string) => keySet.has(code),
    isShiftDown: () => shiftDown,
  } as unknown as ManagerInput;
}

/**
 * Builds a floor box under the origin.
 *
 * @returns Floor mesh.
 */
function createFloorMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20));
  mesh.position.set(0, -0.5, 0);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('PlayerBodyState', () => {
  it('moves forward when W is held while grounded', () => {
    const root = new THREE.Group();
    root.add(createFloorMesh());
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const body = new PlayerBodyState();
    body.resetAt(new THREE.Vector3(0, 0, 0), world);
    const look = new PlayerLookState(0, 0);
    const start = body.getFeetPosition().clone();
    for (let step = 0; step < 30; step++) {
      body.update(createInputStub(['KeyW']), look, world, 1 / 60);
    }
    expect(body.getFeetPosition().z).toBeGreaterThan(start.z);
    expect(body.getIsGrounded()).toBe(true);
  });

  it('does not teleport the feet down to the ground on reset', () => {
    const root = new THREE.Group();
    root.add(createFloorMesh());
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const body = new PlayerBodyState();
    body.resetAt(new THREE.Vector3(0, 3.5, 0), world);
    expect(body.getFeetPosition().y).toBeCloseTo(3.5);
  });

  it('does not jump from a Space key already held at reset', () => {
    const root = new THREE.Group();
    root.add(createFloorMesh());
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const body = new PlayerBodyState();
    body.resetAt(new THREE.Vector3(0, 0, 0), world, true);
    const look = new PlayerLookState(0, 0);
    const startY = body.getFeetPosition().y;
    body.update(createInputStub(['Space']), look, world, 1 / 60);
    body.update(createInputStub(['Space']), look, world, 1 / 60);
    expect(body.getFeetPosition().y).toBeLessThanOrEqual(startY + 0.05);
  });

  it('jumps when Space is pressed after being released', () => {
    const root = new THREE.Group();
    root.add(createFloorMesh());
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const body = new PlayerBodyState();
    body.resetAt(new THREE.Vector3(0, 0, 0), world, true);
    const look = new PlayerLookState(0, 0);
    body.update(createInputStub(['Space']), look, world, 1 / 60);
    body.update(createInputStub([]), look, world, 1 / 60);
    const groundedY = body.getFeetPosition().y;
    body.update(createInputStub(['Space']), look, world, 1 / 60);
    body.update(createInputStub(['Space']), look, world, 1 / 60);
    expect(body.getFeetPosition().y).toBeGreaterThan(groundedY);
  });

  it('turns hybrid body facing toward move direction, not camera pitch', () => {
    const root = new THREE.Group();
    root.add(createFloorMesh());
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const body = new PlayerBodyState();
    body.resetAt(new THREE.Vector3(0, 0, 0), world, false, 0);
    const look = new PlayerLookState(Math.PI / 2, 1.0);
    for (let step = 0; step < 45; step++) {
      body.update(createInputStub(['KeyW']), look, world, 1 / 60, false);
    }
    expect(body.getFacingYawRadians()).toBeGreaterThan(0.8);
    expect(body.getFacingYawRadians()).toBeLessThan(Math.PI / 2 + 0.2);
  });

  it('faces into a wall while sliding laterally along it', () => {
    const root = new THREE.Group();
    root.add(createFloorMesh());
    root.add(
      (() => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 1));
        wall.position.set(0, 1.5, 2);
        wall.updateMatrixWorld(true);
        return wall;
      })(),
    );
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const body = new PlayerBodyState();
    body.resetAt(new THREE.Vector3(0, 0, 0.8), world, false, 0);
    const look = new PlayerLookState(0, 0);
    for (let step = 0; step < 50; step++) {
      body.update(createInputStub(['KeyW', 'KeyD']), look, world, 1 / 60, false);
    }
    const wallNormal = new THREE.Vector3();
    body.copyWallNormalTo(wallNormal);
    expect(wallNormal.lengthSq()).toBeGreaterThan(1e-6);
    const facing = body.getFacingYawRadians();
    const intoWallX = -wallNormal.x;
    const intoWallZ = -wallNormal.z;
    const facingDotInto = Math.sin(facing) * intoWallX + Math.cos(facing) * intoWallZ;
    expect(facingDotInto).toBeGreaterThan(0.7);
  });

  it('decelerates planar speed briefly after releasing movement keys', () => {
    const root = new THREE.Group();
    root.add(createFloorMesh());
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const body = new PlayerBodyState();
    body.resetAt(new THREE.Vector3(0, 0, 0), world);
    const look = new PlayerLookState(0, 0);
    for (let step = 0; step < 40; step++) {
      body.update(createInputStub(['KeyW']), look, world, 1 / 60);
    }
    const runningSpeed = body.getPlanarSpeed();
    expect(runningSpeed).toBeGreaterThan(2);
    body.update(createInputStub([]), look, world, 1 / 60);
    const afterOneFrame = body.getPlanarSpeed();
    expect(afterOneFrame).toBeLessThan(runningSpeed);
    expect(afterOneFrame).toBeGreaterThan(0);
    for (let step = 0; step < 20; step++) {
      body.update(createInputStub([]), look, world, 1 / 60);
    }
    expect(body.getPlanarSpeed()).toBeLessThan(0.2);
  });

  it('stays grounded after landing from a drop instead of flip-flopping', () => {
    const root = new THREE.Group();
    const wideFloor = new THREE.Mesh(new THREE.BoxGeometry(80, 1, 80));
    wideFloor.position.set(0, -0.5, 0);
    wideFloor.updateMatrixWorld(true);
    root.add(wideFloor);
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const body = new PlayerBodyState();
    body.resetAt(new THREE.Vector3(0, 6, 0), world);
    const look = new PlayerLookState(0, 0);
    let landFrame = -1;
    let groundedFlip = 0;
    let previousGrounded = body.getIsGrounded();
    for (let step = 0; step < 300; step++) {
      body.update(createInputStub(['KeyW']), look, world, 1 / 60);
      const grounded = body.getIsGrounded();
      if (grounded !== previousGrounded) {
        groundedFlip += 1;
        if (grounded && landFrame < 0) {
          landFrame = step;
        }
      }
      previousGrounded = grounded;
      if (landFrame >= 0 && step - landFrame > 90) {
        break;
      }
    }
    expect(landFrame).toBeGreaterThanOrEqual(0);
    expect(groundedFlip).toBe(1);
    expect(body.getIsGrounded()).toBe(true);
    expect(body.getVerticalVelocity()).toBe(0);
    expect(body.getFeetPosition().y).toBeLessThan(0.1);
  });

  it('ramps planar speed over multiple frames in first-person mode', () => {
    const root = new THREE.Group();
    root.add(createFloorMesh());
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const body = new PlayerBodyState();
    body.resetAt(new THREE.Vector3(0, 0, 0), world);
    const look = new PlayerLookState(0, 0);
    body.update(createInputStub(['KeyW']), look, world, 1 / 60, true);
    const speedAfterOneFrame = body.getPlanarSpeed();
    expect(speedAfterOneFrame).toBeGreaterThan(0.5);
    expect(speedAfterOneFrame).toBeLessThan(4.0);
    for (let step = 0; step < 30; step++) {
      body.update(createInputStub(['KeyW']), look, world, 1 / 60, true);
    }
    expect(body.getPlanarSpeed()).toBeGreaterThan(speedAfterOneFrame);
    expect(body.getPlanarSpeed()).toBeGreaterThan(4.0);
  });

  it('keeps residual forward momentum when strafing in first-person mode', () => {
    const root = new THREE.Group();
    root.add(createFloorMesh());
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const body = new PlayerBodyState();
    body.resetAt(new THREE.Vector3(0, 0, 0), world);
    const look = new PlayerLookState(0, 0);
    for (let step = 0; step < 30; step++) {
      body.update(createInputStub(['KeyW']), look, world, 1 / 60, true);
    }
    const velocity = new THREE.Vector3();
    body.copyHorizontalVelocityTo(velocity);
    const forwardSpeedBefore = velocity.z;
    expect(forwardSpeedBefore).toBeGreaterThan(4.0);
    body.update(createInputStub(['KeyD']), look, world, 1 / 60, true);
    body.copyHorizontalVelocityTo(velocity);
    expect(velocity.z).toBeGreaterThan(forwardSpeedBefore * 0.4);
    expect(velocity.x).toBeLessThan(-0.5);
  });

  it('matches first-person and third-person horizontal acceleration response', () => {
    const root = new THREE.Group();
    root.add(createFloorMesh());
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const firstPerson = new PlayerBodyState();
    const thirdPerson = new PlayerBodyState();
    firstPerson.resetAt(new THREE.Vector3(0, 0, 0), world);
    thirdPerson.resetAt(new THREE.Vector3(0, 0, 0), world);
    const look = new PlayerLookState(0, 0);
    for (let step = 0; step < 12; step++) {
      firstPerson.update(createInputStub(['KeyW']), look, world, 1 / 60, true);
      thirdPerson.update(createInputStub(['KeyW']), look, world, 1 / 60, false);
    }
    expect(firstPerson.getPlanarSpeed()).toBeCloseTo(thirdPerson.getPlanarSpeed(), 5);
    firstPerson.update(createInputStub(['KeyD']), look, world, 1 / 60, true);
    thirdPerson.update(createInputStub(['KeyD']), look, world, 1 / 60, false);
    const firstVelocity = new THREE.Vector3();
    const thirdVelocity = new THREE.Vector3();
    firstPerson.copyHorizontalVelocityTo(firstVelocity);
    thirdPerson.copyHorizontalVelocityTo(thirdVelocity);
    expect(firstVelocity.x).toBeCloseTo(thirdVelocity.x, 5);
    expect(firstVelocity.z).toBeCloseTo(thirdVelocity.z, 5);
  });
});
