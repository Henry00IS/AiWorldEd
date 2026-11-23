import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ManagerInput } from '@/input/manager_input.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { playerEyePositionFromFeet } from '@/player/collision/player_capsule_collider.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import { PlayerGrapple } from '@/player/grapple/player_grapple.js';
import {
  PLAYER_GRAPPLE_CLIMB_SPEED_METERS_PER_SECOND,
  PLAYER_GRAPPLE_COOLDOWN_SECONDS,
} from '@/player/grapple/player_grapple_constants.js';
import { PlayerGrappleSound } from '@/player/grapple/player_grapple_sound.js';
import { PlayerLookState } from '@/player/look/player_look_state.js';
import { PlayerBodyState } from '@/player/movement/player_body_state.js';
import { PLAYER_RUN_SPEED_METERS_PER_SECOND } from '@/player/player_constants.js';

const STEP = 1 / 60;
const NO_KEYS = {
  isKeyDown: () => false,
  isPhysicalKeyDown: () => false,
  isShiftDown: () => false,
} as unknown as ManagerInput;

/**
 * Adds a box to a root.
 *
 * @param root Root.
 * @param size Size.
 * @param center Center.
 */
function box(root: THREE.Group, size: [number, number, number], center: [number, number, number]): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
  mesh.position.set(...center);
  mesh.updateMatrixWorld(true);
  root.add(mesh);
}

/**
 * Builds a floor, a 7 m wall from z 8 to 10 and a ceiling slab 12 m up over x
 * -10..-4, with a body standing at the origin and a grapple on it.
 *
 * @returns Body, look, world, grapple and the announced anchors.
 */
function scene() {
  const root = new THREE.Group();
  box(root, [60, 1, 60], [0, -0.5, 0]);
  box(root, [20, 7, 2], [0, 3.5, 9]);
  box(root, [6, 1, 6], [-7, 12.5, 0]);
  const world = new PlayerCollisionWorld();
  world.activate();
  world.setWorldRoot(root);
  const body = new PlayerBodyState();
  body.resetAt(new THREE.Vector3(0, 0, 0), world);
  const look = new PlayerLookState();
  const announced: (THREE.Vector3 | null)[] = [];
  const layer = { helperAdd: () => {}, helperRemove: () => {} };
  const grapple = new PlayerGrapple(
    world,
    look,
    layer,
    (anchor) => announced.push(anchor?.clone() ?? null),
    new PlayerGrappleSound(() => null),
  );
  body.setPull(grapple);
  for (let step = 0; step < 5; step++) body.update(NO_KEYS, look, world, STEP);
  return { body, look, world, grapple, announced };
}

/**
 * Points the look from the eye at a point.
 *
 * @param look Look state.
 * @param body Body.
 * @param point Point.
 * @returns The ray to fire along: eye position and look direction.
 */
function aimAt(look: PlayerLookState, body: PlayerBodyState, point: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const eye = playerEyePositionFromFeet(body.getFeetPosition(), new THREE.Vector3());
  const d = point.clone().sub(eye);
  look.setAngles(Math.atan2(d.x, d.z), Math.atan2(d.y, Math.hypot(d.x, d.z)));
  return [eye, look.copyLookForwardTo(new THREE.Vector3())];
}

/**
 * Returns the body velocity.
 *
 * @param body Body.
 * @returns Velocity.
 */
function velocityOf(body: PlayerBodyState): THREE.Vector3 {
  return body.copyHorizontalVelocityTo(new THREE.Vector3()).setY(body.getVerticalVelocity());
}

describe('PlayerGrapple', () => {
  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
  });

  it('yanks the body off the ground toward a ceiling hook and swings on after letting go', () => {
    const { body, look, world, grapple, announced } = scene();
    expect(body.getIsGrounded()).toBe(true);
    expect(grapple.press(...aimAt(look, body, new THREE.Vector3(-7, 12, 0)), 0)).toBe(true);
    expect(announced.at(-1)?.y).toBeCloseTo(12, 3);
    body.update(NO_KEYS, look, world, STEP);
    expect(body.getIsGrounded()).toBe(false);
    expect(body.getVerticalVelocity()).toBeGreaterThan(4);
    for (let step = 0; step < 30; step++) body.update(NO_KEYS, look, world, STEP);
    expect(body.getFeetPosition().y).toBeGreaterThan(3);
    const released = velocityOf(body);
    expect(released.length()).toBeGreaterThan(PLAYER_RUN_SPEED_METERS_PER_SECOND);
    grapple.release(0.5);
    expect(announced.at(-1)).toBeNull();
    body.update(NO_KEYS, look, world, STEP);
    const after = velocityOf(body);
    expect(after.x).toBeCloseTo(released.x, 0);
    for (let step = 0; step < 15; step++) body.update(NO_KEYS, look, world, STEP);
    const planar = (v: THREE.Vector3) => Math.hypot(v.x, v.z);
    expect(planar(velocityOf(body))).toBeGreaterThan(0.95 * planar(released));
  });

  it('hooks again at once in the air, and only fizzles on a miss', () => {
    const { body, look, world, grapple, announced } = scene();
    grapple.press(...aimAt(look, body, new THREE.Vector3(-7, 12, 0)), 0);
    for (let step = 0; step < 20; step++) body.update(NO_KEYS, look, world, STEP);
    grapple.release(1);
    expect(grapple.press(...aimAt(look, body, new THREE.Vector3(3, 7, 8)), 1)).toBe(false);
    expect(grapple.press(...aimAt(look, body, new THREE.Vector3(3, 6, 8)), 1 + PLAYER_GRAPPLE_COOLDOWN_SECONDS)).toBe(
      true,
    );
    expect(body.getIsGrounded()).toBe(false);
    look.setAngles(Math.PI, 0.2);
    const count = announced.length;
    grapple.release(2);
    expect(
      grapple.press(
        playerEyePositionFromFeet(body.getFeetPosition(), new THREE.Vector3()),
        look.copyLookForwardTo(new THREE.Vector3()),
        3,
      ),
    ).toBe(false);
    expect(announced.length).toBe(count + 1);
    expect(grapple.getAnchor()).toBeNull();
  });

  it('climbs over a wall too high to jump by hooking its top', () => {
    const { body, look, world, grapple } = scene();
    grapple.press(...aimAt(look, body, new THREE.Vector3(0, 7, 8.6)), 0);
    let highest = 0;
    for (let step = 0; step < 120; step++) {
      body.update(NO_KEYS, look, world, STEP);
      highest = Math.max(highest, body.getFeetPosition().y);
    }
    expect(highest).toBeGreaterThan(7);
    grapple.release(2);
    for (let step = 0; step < 90; step++) body.update(NO_KEYS, look, world, STEP);
    expect(body.getIsGrounded()).toBe(true);
    expect(body.getFeetPosition().y).toBeCloseTo(7, 1);
    expect(body.getFeetPosition().z).toBeGreaterThan(8);
  });

  it('climbs a wall face hooked too low for the ledge with Space, over the top after letting go', () => {
    const hang = scene();
    hang.grapple.press(...aimAt(hang.look, hang.body, new THREE.Vector3(0, 4.5, 8)), 0);
    let hangHighest = 0;
    for (let step = 0; step < 180; step++) {
      hang.body.update(NO_KEYS, hang.look, hang.world, STEP);
      hangHighest = Math.max(hangHighest, hang.body.getFeetPosition().y);
    }
    expect(hangHighest).toBeLessThan(5);
    const { body, look, world, grapple } = scene();
    const climbKeys = {
      isKeyDown: (key: string) => key === 'Space',
      isPhysicalKeyDown: (key: string) => key === 'KeyW',
      isShiftDown: () => false,
    } as unknown as ManagerInput;
    grapple.press(...aimAt(look, body, new THREE.Vector3(0, 4.5, 8)), 0);
    for (let step = 0; step < 60; step++) body.update(NO_KEYS, look, world, STEP);
    let fastest = 0;
    let step = 0;
    for (; step < 300 && body.getFeetPosition().y < 7.1; step++) {
      body.update(climbKeys, look, world, STEP);
      fastest = Math.max(fastest, body.getVerticalVelocity());
    }
    expect(body.getFeetPosition().y).toBeGreaterThan(7.1);
    expect(fastest).toBeLessThanOrEqual(PLAYER_GRAPPLE_CLIMB_SPEED_METERS_PER_SECOND + 1e-6);
    grapple.release(1 + step * STEP);
    for (let after = 0; after < 120; after++) {
      body.update(body.getFeetPosition().z < 8.6 ? climbKeys : NO_KEYS, look, world, STEP);
    }
    expect(body.getIsGrounded()).toBe(true);
    expect(body.getFeetPosition().y).toBeCloseTo(7, 1);
    expect(body.getFeetPosition().z).toBeGreaterThan(8);
  });

  it('escapes a pit by hooking just below its rim', () => {
    const root = new THREE.Group();
    box(root, [40, 1, 40], [0, -8.5, 0]);
    box(root, [40, 8, 17], [0, -4, 11.5]);
    box(root, [40, 8, 17], [0, -4, -11.5]);
    box(root, [17, 8, 6], [11.5, -4, 0]);
    box(root, [17, 8, 6], [-11.5, -4, 0]);
    const world = new PlayerCollisionWorld();
    world.activate();
    world.setWorldRoot(root);
    const body = new PlayerBodyState();
    body.resetAt(new THREE.Vector3(0, -8, 0), world);
    const look = new PlayerLookState();
    const layer = { helperAdd: () => {}, helperRemove: () => {} };
    const grapple = new PlayerGrapple(world, look, layer, () => {}, new PlayerGrappleSound(() => null));
    body.setPull(grapple);
    for (let step = 0; step < 5; step++) body.update(NO_KEYS, look, world, STEP);
    expect(grapple.press(...aimAt(look, body, new THREE.Vector3(0, -0.8, 3)), 0)).toBe(true);
    for (let step = 0; step < 120; step++) body.update(NO_KEYS, look, world, STEP);
    grapple.release(2);
    for (let step = 0; step < 90; step++) body.update(NO_KEYS, look, world, STEP);
    expect(body.getIsGrounded()).toBe(true);
    expect(body.getFeetPosition().y).toBeCloseTo(0, 1);
    expect(body.getFeetPosition().z).toBeGreaterThan(3);
  });
});
