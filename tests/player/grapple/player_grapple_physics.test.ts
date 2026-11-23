import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PLAYER_GRAPPLE_CLEARANCE_METERS,
  PLAYER_GRAPPLE_MAX_SPEED_METERS_PER_SECOND,
  PLAYER_GRAPPLE_PULL_METERS_PER_SECOND_SQUARED,
  PLAYER_GRAPPLE_PULL_PER_METER,
  PLAYER_GRAPPLE_ROPE_STIFFNESS_PER_SECOND_SQUARED,
  PLAYER_GRAPPLE_SLACK_METERS,
  PLAYER_GRAPPLE_SWING_DAMPING_PER_SECOND,
  PLAYER_GRAPPLE_YANK_AWAY_KEPT,
  PLAYER_GRAPPLE_YANK_LIFT_METERS_PER_SECOND,
  PLAYER_GRAPPLE_YANK_METERS_PER_SECOND,
} from '@/player/grapple/player_grapple_constants.js';
import {
  playerGrappleOffset,
  playerGrapplePull,
  playerGrappleTarget,
  playerGrappleYank,
} from '@/player/grapple/player_grapple_physics.js';
import { PLAYER_CAPSULE_CENTER_ABOVE_FEET_METERS } from '@/player/collision/player_collision_character_rig.js';
import {
  PLAYER_COLLIDER_HEIGHT_METERS,
  PLAYER_COLLIDER_RADIUS_METERS,
  PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED,
} from '@/player/player_constants.js';

/**
 * Where a body hangs below a target on the rope (slack plus stretch under
 * gravity).
 */
const HANG =
  PLAYER_GRAPPLE_SLACK_METERS +
  PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED / PLAYER_GRAPPLE_ROPE_STIFFNESS_PER_SECOND_SQUARED;

const STEP = 1 / 120;

/**
 * Flies a point under gravity and the pull toward a target.
 *
 * @param start Start position (the pulled point).
 * @param target Pull target.
 * @param seconds Simulated time.
 * @returns Final position, velocity and the fastest speed reached.
 */
function fly(start: THREE.Vector3, target: THREE.Vector3, seconds: number) {
  const position = start.clone();
  const velocity = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const aim = target.clone().sub(start).normalize();
  let fastest = 0;
  let closest = Number.POSITIVE_INFINITY;
  for (let time = 0; time < seconds; time += STEP) {
    velocity.y -= PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED * STEP;
    playerGrapplePull(velocity, offset.subVectors(target, position), aim, STEP);
    position.addScaledVector(velocity, STEP);
    fastest = Math.max(fastest, velocity.length());
    closest = Math.min(closest, position.distanceTo(target));
  }
  return { position, velocity, fastest, closest };
}

describe('player grapple physics', () => {
  it('aims the body center off the hit surface by the capsule reach and a clearance', () => {
    const ceiling = playerGrappleTarget(new THREE.Vector3(1, 5, 2), new THREE.Vector3(0, -1, 0), new THREE.Vector3());
    expect(ceiling.x).toBe(1);
    expect(ceiling.z).toBe(2);
    expect(5 - (ceiling.y + PLAYER_COLLIDER_HEIGHT_METERS / 2)).toBeCloseTo(PLAYER_GRAPPLE_CLEARANCE_METERS, 6);
    const wall = playerGrappleTarget(new THREE.Vector3(0, 5, 3), new THREE.Vector3(0, 0, -1), new THREE.Vector3());
    expect(3 - (wall.z + PLAYER_COLLIDER_RADIUS_METERS)).toBeCloseTo(PLAYER_GRAPPLE_CLEARANCE_METERS, 6);
    const offset = playerGrappleOffset(new THREE.Vector3(1, 0, 0), ceiling, new THREE.Vector3());
    expect(offset.y).toBeCloseTo(ceiling.y - PLAYER_CAPSULE_CENTER_ABOVE_FEET_METERS);
    expect(offset.x).toBe(0);
    expect(offset.z).toBe(2);
  });

  it('hangs below a ceiling hook on the rope slack, with the head and eye well off the ceiling', () => {
    const ceiling = playerGrappleTarget(new THREE.Vector3(0, 12, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3());
    const result = fly(new THREE.Vector3(3, 0, 0), ceiling, 4);
    expect(result.position.y).toBeCloseTo(ceiling.y - HANG, 1);
    expect(result.velocity.length()).toBeLessThan(0.05);
    const head = result.position.y + PLAYER_COLLIDER_HEIGHT_METERS / 2;
    expect(12 - head).toBeGreaterThan(PLAYER_GRAPPLE_CLEARANCE_METERS + PLAYER_GRAPPLE_SLACK_METERS);
  });

  it('yanks toward the anchor and always lifts off the ground', () => {
    const level = new THREE.Vector3();
    playerGrappleYank(level, new THREE.Vector3(10, 0, 0), true);
    expect(level.x).toBeCloseTo(PLAYER_GRAPPLE_YANK_METERS_PER_SECOND);
    expect(level.y).toBe(PLAYER_GRAPPLE_YANK_LIFT_METERS_PER_SECOND);
    const airborne = new THREE.Vector3(0, -3, 0);
    playerGrappleYank(airborne, new THREE.Vector3(0, 0, -5), false);
    expect(airborne.toArray()).toEqual([0, -3, -PLAYER_GRAPPLE_YANK_METERS_PER_SECOND]);
    const fleeing = new THREE.Vector3(20, 0, 3);
    playerGrappleYank(fleeing, new THREE.Vector3(-10, 0, 0), false);
    expect(fleeing.x).toBeCloseTo(20 * PLAYER_GRAPPLE_YANK_AWAY_KEPT - PLAYER_GRAPPLE_YANK_METERS_PER_SECOND);
    expect(fleeing.z).toBe(3);
  });

  it('accelerates toward the target, harder for a long beam', () => {
    const velocity = new THREE.Vector3();
    playerGrapplePull(velocity, new THREE.Vector3(0, 0, 20), new THREE.Vector3(0, 0, 1), 0.1);
    const pull = PLAYER_GRAPPLE_PULL_METERS_PER_SECOND_SQUARED + PLAYER_GRAPPLE_PULL_PER_METER * 20;
    expect(velocity.z).toBeGreaterThan(pull * 0.1);
    expect(velocity.x).toBe(0);
    const short = new THREE.Vector3();
    playerGrapplePull(short, new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, 1), 0.1);
    expect(short.z).toBeLessThan(velocity.z);
  });

  it('damps only the velocity across the beam', () => {
    const velocity = new THREE.Vector3(10, 0, 0);
    playerGrapplePull(velocity, new THREE.Vector3(0, 30, 0), new THREE.Vector3(0, 1, 0), 0.1);
    expect(velocity.x).toBeCloseTo(10 * Math.exp(-PLAYER_GRAPPLE_SWING_DAMPING_PER_SECOND * 0.1), 6);
    expect(velocity.x).toBeGreaterThan(8);
    expect(velocity.y).toBeGreaterThan(0);
  });

  it('never pulls faster than the cap', () => {
    const velocity = new THREE.Vector3(0, 0, 31.9);
    for (let step = 0; step < 60; step++)
      playerGrapplePull(velocity, new THREE.Vector3(0, 0, 60), new THREE.Vector3(0, 0, 1), STEP);
    expect(velocity.length()).toBeCloseTo(PLAYER_GRAPPLE_MAX_SPEED_METERS_PER_SECOND, 6);
  });

  it('flies fast to a far anchor and settles there without jitter', () => {
    const target = new THREE.Vector3(30, 25, 0);
    const result = fly(new THREE.Vector3(), target, 4);
    expect(result.fastest).toBeCloseTo(PLAYER_GRAPPLE_MAX_SPEED_METERS_PER_SECOND, 6);
    expect(result.position.distanceTo(target)).toBeLessThan(HANG + 0.05);
    expect(result.velocity.length()).toBeLessThan(0.05);
    const later = fly(new THREE.Vector3(), target, 4.5);
    expect(later.position.distanceTo(result.position)).toBeLessThan(0.01);
  });

  it('brakes a straight pull so the rope catches it at the slack instead of overshooting', () => {
    const target = new THREE.Vector3(0, 30, 0);
    const position = new THREE.Vector3();
    const velocity = new THREE.Vector3();
    const offset = new THREE.Vector3();
    let highest = 0;
    let fastest = 0;
    for (let time = 0; time < 3; time += STEP) {
      velocity.y -= PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED * STEP;
      playerGrapplePull(velocity, offset.subVectors(target, position), new THREE.Vector3(0, 1, 0), STEP);
      position.addScaledVector(velocity, STEP);
      highest = Math.max(highest, position.y);
      fastest = Math.max(fastest, velocity.length());
    }
    expect(fastest).toBeGreaterThan(25);
    expect(highest).toBeLessThan(target.y + PLAYER_GRAPPLE_SLACK_METERS);
    expect(position.distanceTo(target)).toBeLessThan(HANG + 0.05);
  });

  it('swings in an arc under an anchor ahead instead of a straight line', () => {
    const target = new THREE.Vector3(20, 10, 0);
    const position = new THREE.Vector3();
    const velocity = new THREE.Vector3(0, 0, 8);
    const offset = new THREE.Vector3();
    const aim = new THREE.Vector3(1, 0, 0);
    let sideways = 0;
    for (let time = 0; time < 0.6; time += STEP) {
      velocity.y -= PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED * STEP;
      playerGrapplePull(velocity, offset.subVectors(target, position), aim, STEP);
      position.addScaledVector(velocity, STEP);
      sideways = Math.max(sideways, position.z);
    }
    expect(sideways).toBeGreaterThan(2);
    expect(position.x).toBeGreaterThan(3);
  });
});
