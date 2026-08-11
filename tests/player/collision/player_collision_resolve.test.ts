import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import {
  createPlayerCollisionScratch,
  playerCollisionIntegrateStep,
  playerCollisionSnapToGround,
} from '@/player/collision/player_collision_resolve.js';
import {
  PLAYER_COLLIDER_RADIUS_METERS,
  PLAYER_STEP_HEIGHT_METERS,
  PLAYER_WALL_SKIN_METERS,
} from '@/player/player_constants.js';

/**
 * Builds a box mesh at the given world center with the given size.
 *
 * @param center World center.
 * @param size Box size.
 * @returns Mesh ready for collision.
 */
function createBoxMesh(center: THREE.Vector3, size: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
  mesh.position.copy(center);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Builds a thin ramp surface so walking +X climbs without a leading wall face.
 *
 * @param length Horizontal length along X.
 * @param width Width along Z.
 * @param height Rise in Y.
 * @returns Mesh with low end at x=0,y=0 and high end at x=length,y=height.
 */
function createRampMesh(length: number, width: number, height: number): THREE.Mesh {
  const halfWidth = width * 0.5;
  const positions = new Float32Array([
    0,
    0,
    -halfWidth,
    length,
    height,
    -halfWidth,
    length,
    height,
    halfWidth,
    0,
    0,
    -halfWidth,
    length,
    height,
    halfWidth,
    0,
    0,
    halfWidth,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Builds a staircase of equal box treads along +X.
 *
 * @param stepCount Number of steps.
 * @param stepDepth Depth of each tread along X.
 * @param stepHeight Height of each riser.
 * @param stepWidth Width along Z.
 * @returns Group containing all step meshes.
 */
function createStaircase(stepCount: number, stepDepth: number, stepHeight: number, stepWidth: number): THREE.Group {
  const group = new THREE.Group();
  for (let index = 0; index < stepCount; index++) {
    const stackHeight = stepHeight * (index + 1);
    const x = stepDepth * (index + 0.5);
    const y = stackHeight * 0.5;
    group.add(createBoxMesh(new THREE.Vector3(x, y, 0), new THREE.Vector3(stepDepth, stackHeight, stepWidth)));
  }
  return group;
}

describe('playerCollisionIntegrateStep', () => {
  it('stops horizontal motion against a wall and allows strafing along it', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 20)));
    root.add(createBoxMesh(new THREE.Vector3(2, 1, 0), new THREE.Vector3(1, 2, 4)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(0, 0, 0);
    const scratch = createPlayerCollisionScratch();
    const towardWall = new THREE.Vector3(2, 0, 0);
    const afterWall = playerCollisionIntegrateStep(world, feet.clone(), towardWall, 0, 1 / 60, scratch);
    expect(afterWall.feetPosition.x).toBeLessThan(1.7);
    const alongWall = new THREE.Vector3(0.5, 0, 1);
    const start = afterWall.feetPosition.clone();
    const afterStrafe = playerCollisionIntegrateStep(world, start.clone(), alongWall, 0, 1 / 60, scratch);
    expect(afterStrafe.feetPosition.z).toBeGreaterThan(start.z);
  });

  it('keeps capsule radius clearance when approaching a wall sideways', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 20)));
    root.add(createBoxMesh(new THREE.Vector3(2, 1, 0), new THREE.Vector3(1, 2, 6)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(1.45, 0, 0);
    const scratch = createPlayerCollisionScratch();
    const alongWall = new THREE.Vector3(0, 0, 0.4);
    const result = playerCollisionIntegrateStep(world, feet, alongWall, 0, 1 / 60, scratch);
    const wallFaceX = 1.5;
    const minCenterX = wallFaceX - PLAYER_COLLIDER_RADIUS_METERS - PLAYER_WALL_SKIN_METERS + 0.05;
    expect(result.feetPosition.x).toBeLessThanOrEqual(minCenterX);
  });

  it('marks wall push when driving straight into a wall', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 20)));
    root.add(createBoxMesh(new THREE.Vector3(2, 1, 0), new THREE.Vector3(1, 2, 4)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const scratch = createPlayerCollisionScratch();
    const feet = new THREE.Vector3(0.8, 0, 0);
    let pushing = false;
    for (let step = 0; step < 40; step++) {
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0.2, 0, 0),
        0,
        1 / 60,
        scratch,
        new THREE.Vector3(1, 0, 0),
      );
      pushing = result.isWallPushing;
      if (pushing) {
        break;
      }
    }
    expect(pushing).toBe(true);
  });

  it('does not mark wall push against a short barrier below hand height', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 20)));
    root.add(createBoxMesh(new THREE.Vector3(2, 0.5, 0), new THREE.Vector3(1, 1, 4)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const scratch = createPlayerCollisionScratch();
    const feet = new THREE.Vector3(0.8, 0, 0);
    let pushing = false;
    let blockedX = feet.x;
    for (let step = 0; step < 50; step++) {
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0.2, 0, 0),
        0,
        1 / 60,
        scratch,
        new THREE.Vector3(1, 0, 0),
      );
      pushing = pushing || result.isWallPushing;
      blockedX = result.feetPosition.x;
    }
    expect(pushing).toBe(false);
    expect(blockedX).toBeLessThan(1.3);
  });

  it('does not mark wall push while strafing along a wall', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 20)));
    root.add(createBoxMesh(new THREE.Vector3(2, 1, 0), new THREE.Vector3(1, 2, 4)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const scratch = createPlayerCollisionScratch();
    const feet = new THREE.Vector3(1.1, 0, 0);
    playerCollisionIntegrateStep(
      world,
      feet,
      new THREE.Vector3(0.3, 0, 0),
      0,
      1 / 60,
      scratch,
      new THREE.Vector3(1, 0, 0),
    );
    const strafe = playerCollisionIntegrateStep(
      world,
      feet,
      new THREE.Vector3(0, 0, 0.4),
      0,
      1 / 60,
      scratch,
      new THREE.Vector3(0, 0, 1),
    );
    expect(strafe.isWallPushing).toBe(false);
  });

  it('keeps wall push stable across frames while sliding flush into a wall', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 20)));
    root.add(createBoxMesh(new THREE.Vector3(2, 1, 0), new THREE.Vector3(1, 2, 8)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const scratch = createPlayerCollisionScratch();
    const feet = new THREE.Vector3(1.0, 0, 0);
    const intoWall = new THREE.Vector3(0.85, 0, 0.5).normalize();
    let pushFrames = 0;
    let totalFrames = 0;
    for (let step = 0; step < 45; step++) {
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        intoWall.clone().multiplyScalar(0.12),
        -2,
        1 / 60,
        scratch,
        intoWall,
      );
      if (step >= 15) {
        totalFrames += 1;
        if (result.isWallPushing) {
          pushFrames += 1;
        }
        expect(result.wallNormal.lengthSq()).toBeGreaterThan(1e-6);
      }
    }
    expect(pushFrames / totalFrames).toBeGreaterThan(0.9);
  });

  it('snaps the body down onto a floor under the feet', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(10, 1, 10)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(0, 2, 0);
    const scratch = createPlayerCollisionScratch();
    const snapped = playerCollisionSnapToGround(world, feet, scratch);
    expect(snapped).toBe(true);
    expect(feet.y).toBeCloseTo(0, 1);
  });

  it('does not tunnel through a thin wall with a large horizontal step', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 20)));
    root.add(createBoxMesh(new THREE.Vector3(1.2, 1, 0), new THREE.Vector3(0.2, 2, 4)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(0, 0, 0);
    const scratch = createPlayerCollisionScratch();
    const result = playerCollisionIntegrateStep(world, feet, new THREE.Vector3(3, 0, 0), 0, 1 / 60, scratch);
    expect(result.feetPosition.x).toBeLessThan(1.2);
    expect(result.feetPosition.y).toBeGreaterThan(-0.05);
  });

  it('stays grounded when sliding along a wall on a floor', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 20)));
    root.add(createBoxMesh(new THREE.Vector3(2, 1, 0), new THREE.Vector3(1, 2, 8)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(1.1, 0, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionIntegrateStep(world, feet, new THREE.Vector3(0.4, 0, 0), 0, 1 / 60, scratch);
    let groundedFrames = 0;
    for (let step = 0; step < 30; step++) {
      const result = playerCollisionIntegrateStep(world, feet, new THREE.Vector3(0.05, 0, 0.25), -2, 1 / 60, scratch);
      if (result.isGrounded && result.feetPosition.y > -0.05) {
        groundedFrames += 1;
      }
    }
    expect(groundedFrames).toBeGreaterThan(20);
    expect(feet.y).toBeGreaterThan(-0.05);
  });

  it('lands on the floor when falling with gravity', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(10, 1, 10)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(0, 1.5, 0);
    const scratch = createPlayerCollisionScratch();
    let verticalVelocity = 0;
    let grounded = false;
    for (let step = 0; step < 120; step++) {
      verticalVelocity -= 20 * (1 / 60);
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0, 0, 0),
        verticalVelocity,
        1 / 60,
        scratch,
      );
      verticalVelocity = result.verticalVelocity;
      grounded = result.isGrounded;
      if (grounded) {
        break;
      }
    }
    expect(grounded).toBe(true);
    expect(feet.y).toBeLessThan(0.2);
  });

  it('walks up a moderate ramp without treating it as a hard wall', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(-1, -0.5, 0), new THREE.Vector3(4, 1, 4)));
    root.add(createRampMesh(4, 3, 1.0));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(-0.5, 0, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    const startY = feet.y;
    let maxY = startY;
    let maxX = feet.x;
    for (let step = 0; step < 180; step++) {
      playerCollisionIntegrateStep(world, feet, new THREE.Vector3(0.1, 0, 0), -8, 1 / 60, scratch);
      maxY = Math.max(maxY, feet.y);
      maxX = Math.max(maxX, feet.x);
    }
    expect(maxX).toBeGreaterThan(0.8);
    expect(maxY).toBeGreaterThan(startY + 0.15);
  });

  it('climbs a 1cm curb without locking into wall-push pose', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 6)));
    root.add(createBoxMesh(new THREE.Vector3(2, 0.005, 0), new THREE.Vector3(4, 0.01, 4)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(0.2, 0, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    const intent = new THREE.Vector3(1, 0, 0);
    let wallPushFrames = 0;
    let maxY = feet.y;
    let previousGrounded = true;
    for (let step = 0; step < 80; step++) {
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0.1, 0, 0),
        0,
        1 / 60,
        scratch,
        intent,
        previousGrounded,
      );
      if (result.isWallPushing) {
        wallPushFrames += 1;
      }
      maxY = Math.max(maxY, feet.y);
      previousGrounded = result.isGrounded;
    }
    expect(feet.x).toBeGreaterThan(1.5);
    expect(maxY).toBeGreaterThan(0.005);
    expect(wallPushFrames).toBe(0);
  });

  it('does not snap back down while only partly over a 0.125m step lip', () => {
    const rise = 0.125;
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 8)));
    root.add(createBoxMesh(new THREE.Vector3(3, rise * 0.5, 0), new THREE.Vector3(4, rise, 6)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(0.9, rise, 0);
    const scratch = createPlayerCollisionScratch();
    let previousGrounded = true;
    let minY = feet.y;
    for (let step = 0; step < 20; step++) {
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0.08, 0, 0),
        0,
        1 / 60,
        scratch,
        new THREE.Vector3(1, 0, 0),
        previousGrounded,
      );
      minY = Math.min(minY, feet.y);
      expect(result.isGrounded).toBe(true);
      previousGrounded = result.isGrounded;
    }
    expect(minY).toBeGreaterThan(rise - 0.02);
  });

  it('keeps stable feet Y after a 0.125m step onto flat ground', () => {
    const rise = 0.125;
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(40, 1, 8)));
    root.add(createBoxMesh(new THREE.Vector3(8, rise * 0.5, 0), new THREE.Vector3(12, rise, 6)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(-0.5, 0, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    let previousGrounded = true;
    let maxAbsDyOnFlat = 0;
    let framesOnFlat = 0;
    let yOscillationPairs = 0;
    let previousY = feet.y;
    let previousDy = 0;
    for (let step = 0; step < 140; step++) {
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0.12, 0, 0),
        0,
        1 / 60,
        scratch,
        new THREE.Vector3(1, 0, 0),
        previousGrounded,
      );
      const dy = feet.y - previousY;
      if (feet.x > 4 && feet.x < 12) {
        framesOnFlat += 1;
        maxAbsDyOnFlat = Math.max(maxAbsDyOnFlat, Math.abs(dy));
        expect(result.isGrounded).toBe(true);
        expect(feet.y).toBeGreaterThan(rise - 0.02);
        if (Math.abs(dy) > 0.01 && Math.abs(previousDy) > 0.01 && Math.sign(dy) !== Math.sign(previousDy)) {
          yOscillationPairs += 1;
        }
      }
      previousGrounded = result.isGrounded;
      previousDy = dy;
      previousY = feet.y;
    }
    expect(framesOnFlat).toBeGreaterThan(40);
    expect(maxAbsDyOnFlat).toBeLessThan(0.02);
    expect(yOscillationPairs).toBe(0);
  });

  it('stays grounded after a 0.0625m incline without every-frame unground thrash', () => {
    const rise = 0.0625;
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(40, 1, 8)));
    root.add(createRampMesh(3, 4, rise));
    root.add(createBoxMesh(new THREE.Vector3(3 + 5, rise - 0.5, 0), new THREE.Vector3(10, 1, 8)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(-0.5, 0, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    let previousGrounded = true;
    let groundedFlip = 0;
    let consecutiveFlipPairs = 0;
    let lastFlipStep = -10;
    for (let step = 0; step < 100; step++) {
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0.12, 0, 0),
        0,
        1 / 60,
        scratch,
        new THREE.Vector3(1, 0, 0),
        previousGrounded,
      );
      if (result.isGrounded !== previousGrounded) {
        groundedFlip += 1;
        if (step - lastFlipStep === 1) {
          consecutiveFlipPairs += 1;
        }
        lastFlipStep = step;
      }
      previousGrounded = result.isGrounded;
    }
    expect(feet.x).toBeGreaterThan(6);
    expect(previousGrounded).toBe(true);
    expect(consecutiveFlipPairs).toBe(0);
    expect(groundedFlip).toBeLessThan(3);
  });

  it('stays grounded while running over a 1cm incline', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(40, 1, 6)));
    root.add(createRampMesh(6, 3, 0.01));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(-0.5, 0, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    let previousGrounded = true;
    let groundedFlip = 0;
    let groundedFrames = 0;
    const frameCount = 80;
    for (let step = 0; step < frameCount; step++) {
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0.12, 0, 0),
        0,
        1 / 60,
        scratch,
        new THREE.Vector3(1, 0, 0),
        previousGrounded,
      );
      if (result.isGrounded !== previousGrounded) {
        groundedFlip += 1;
      }
      if (result.isGrounded) {
        groundedFrames += 1;
      }
      previousGrounded = result.isGrounded;
    }
    expect(feet.x).toBeGreaterThan(4);
    expect(groundedFrames).toBe(frameCount);
    expect(groundedFlip).toBe(0);
  });

  it('walks down a moderate ramp while staying mostly grounded', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(-1, -0.5, 0), new THREE.Vector3(4, 1, 4)));
    root.add(createRampMesh(4, 3, 1.0));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(3.4, 1.0, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    const startY = feet.y;
    let groundedFrames = 0;
    let airborneSpikes = 0;
    let wasGrounded = true;
    let maxDropSpike = 0;
    let previousY = feet.y;
    for (let step = 0; step < 140; step++) {
      const result = playerCollisionIntegrateStep(world, feet, new THREE.Vector3(-0.08, 0, 0), -8, 1 / 60, scratch);
      if (result.isGrounded) {
        groundedFrames += 1;
      } else if (wasGrounded) {
        airborneSpikes += 1;
      }
      maxDropSpike = Math.max(maxDropSpike, previousY - feet.y);
      previousY = feet.y;
      wasGrounded = result.isGrounded;
    }
    expect(feet.x).toBeLessThan(1.5);
    expect(feet.y).toBeLessThan(startY - 0.2);
    expect(groundedFrames).toBeGreaterThan(70);
    expect(airborneSpikes).toBeLessThan(15);
    expect(maxDropSpike).toBeLessThan(0.25);
  });

  it('climbs a multi-step staircase within step height', () => {
    const stepHeight = Math.min(0.25, PLAYER_STEP_HEIGHT_METERS - 0.05);
    const stepDepth = 0.55;
    const stepCount = 4;
    const topY = stepHeight * stepCount;
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(-1, -0.5, 0), new THREE.Vector3(4, 1, 6)));
    root.add(createStaircase(stepCount, stepDepth, stepHeight, 2));
    root.add(createBoxMesh(new THREE.Vector3(stepDepth * stepCount + 1, topY - 0.5, 0), new THREE.Vector3(3, 1, 4)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(-0.8, 0, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    let maxY = feet.y;
    let maxX = feet.x;
    let maxSingleRise = 0;
    let previousY = feet.y;
    let maxPlanarJump = 0;
    for (let step = 0; step < 320; step++) {
      const beforeX = feet.x;
      const beforeZ = feet.z;
      playerCollisionIntegrateStep(world, feet, new THREE.Vector3(0.08, 0, 0), -4, 1 / 60, scratch);
      const rise = feet.y - previousY;
      maxSingleRise = Math.max(maxSingleRise, rise);
      maxPlanarJump = Math.max(maxPlanarJump, Math.hypot(feet.x - beforeX, feet.z - beforeZ));
      previousY = feet.y;
      maxY = Math.max(maxY, feet.y);
      maxX = Math.max(maxX, feet.x);
    }
    expect(maxY).toBeGreaterThan(topY - 0.3);
    expect(maxX).toBeGreaterThan(stepDepth * (stepCount - 1) - 0.15);
    expect(maxSingleRise).toBeLessThanOrEqual(PLAYER_STEP_HEIGHT_METERS + 0.05);
    expect(maxPlanarJump).toBeLessThan(PLAYER_COLLIDER_RADIUS_METERS + 0.15);
  });

  it('climbs a staircase on a diagonal approach without teleporting', () => {
    const stepHeight = 0.2;
    const stepDepth = 0.5;
    const stepCount = 5;
    const topY = stepHeight * stepCount;
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(-1, -0.5, 0), new THREE.Vector3(6, 1, 8)));
    root.add(createStaircase(stepCount, stepDepth, stepHeight, 3));
    root.add(createBoxMesh(new THREE.Vector3(stepDepth * stepCount + 1, topY - 0.5, 0), new THREE.Vector3(3, 1, 4)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(-0.7, 0, -0.4);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    let maxY = feet.y;
    let maxSingleRise = 0;
    let previousY = feet.y;
    let maxPlanarJump = 0;
    let wallPushFrames = 0;
    for (let step = 0; step < 360; step++) {
      const beforeX = feet.x;
      const beforeZ = feet.z;
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0.07, 0, 0.04),
        -4,
        1 / 60,
        scratch,
        new THREE.Vector3(0.9, 0, 0.4).normalize(),
      );
      maxSingleRise = Math.max(maxSingleRise, feet.y - previousY);
      maxPlanarJump = Math.max(maxPlanarJump, Math.hypot(feet.x - beforeX, feet.z - beforeZ));
      previousY = feet.y;
      maxY = Math.max(maxY, feet.y);
      if (result.isWallPushing) {
        wallPushFrames += 1;
      }
    }
    expect(maxY).toBeGreaterThan(topY * 0.4);
    expect(maxSingleRise).toBeLessThanOrEqual(PLAYER_STEP_HEIGHT_METERS + 0.05);
    expect(maxPlanarJump).toBeLessThan(PLAYER_COLLIDER_RADIUS_METERS + 0.15);
    expect(wallPushFrames).toBeLessThan(80);
  });

  it('descends a staircase while staying mostly grounded', () => {
    const stepHeight = 0.2;
    const stepDepth = 0.55;
    const stepCount = 4;
    const topY = stepHeight * stepCount;
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(-1, -0.5, 0), new THREE.Vector3(6, 1, 6)));
    root.add(createStaircase(stepCount, stepDepth, stepHeight, 2));
    root.add(createBoxMesh(new THREE.Vector3(stepDepth * stepCount + 0.8, topY - 0.5, 0), new THREE.Vector3(2, 1, 4)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(stepDepth * stepCount + 0.5, topY, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    let groundedFrames = 0;
    let minX = feet.x;
    for (let step = 0; step < 200; step++) {
      const result = playerCollisionIntegrateStep(world, feet, new THREE.Vector3(-0.12, 0, 0), -4, 1 / 60, scratch);
      minX = Math.min(minX, feet.x);
      if (result.isGrounded) {
        groundedFrames += 1;
      }
    }
    expect(minX).toBeLessThan(stepDepth);
    expect(groundedFrames).toBeGreaterThan(50);
  });

  it('blocks a riser taller than the step height like a wall', () => {
    const tallRiser = PLAYER_STEP_HEIGHT_METERS + 0.4;
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(10, 1, 10)));
    root.add(createBoxMesh(new THREE.Vector3(1.5, tallRiser * 0.5, 0), new THREE.Vector3(1, tallRiser, 3)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(0.5, 0, 0);
    const scratch = createPlayerCollisionScratch();
    for (let step = 0; step < 40; step++) {
      playerCollisionIntegrateStep(world, feet, new THREE.Vector3(0.15, 0, 0), -2, 1 / 60, scratch);
    }
    expect(feet.x).toBeLessThan(1.2);
    expect(feet.y).toBeLessThan(0.2);
  });

  it('climbs stairs without grounded or wall-push flip-flop while walking straight', () => {
    const stepHeight = Math.min(0.25, PLAYER_STEP_HEIGHT_METERS - 0.05);
    const stepDepth = 0.55;
    const stepCount = 8;
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(-1, -0.5, 0), new THREE.Vector3(4, 1, 6)));
    root.add(createStaircase(stepCount, stepDepth, stepHeight, 3));
    root.add(
      createBoxMesh(
        new THREE.Vector3(stepDepth * stepCount + 1, stepHeight * stepCount - 0.5, 0),
        new THREE.Vector3(3, 1, 4),
      ),
    );
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(-0.5, 0, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    const intent = new THREE.Vector3(1, 0, 0);
    let groundedFlip = 0;
    let wallPushFlip = 0;
    let wallPushFrames = 0;
    let airFramesWhileClimbing = 0;
    let previousGrounded = true;
    let previousWallPush = false;
    let maxY = feet.y;
    const climbEndX = stepDepth * (stepCount - 1) - 0.1;
    for (let step = 0; step < 400; step++) {
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0.08, 0, 0),
        -4,
        1 / 60,
        scratch,
        intent,
      );
      const stillClimbing = feet.x < climbEndX;
      if (result.isGrounded !== previousGrounded) {
        groundedFlip += 1;
      }
      if (result.isWallPushing !== previousWallPush) {
        wallPushFlip += 1;
      }
      if (result.isWallPushing) {
        wallPushFrames += 1;
      }
      if (stillClimbing && !result.isGrounded) {
        airFramesWhileClimbing += 1;
      }
      previousGrounded = result.isGrounded;
      previousWallPush = result.isWallPushing;
      maxY = Math.max(maxY, feet.y);
      if (feet.x > stepDepth * (stepCount - 1) + 0.2) {
        break;
      }
    }
    expect(maxY).toBeGreaterThan(stepHeight * (stepCount - 2) - 0.15);
    expect(airFramesWhileClimbing).toBe(0);
    expect(groundedFlip).toBeLessThan(4);
    expect(wallPushFrames).toBe(0);
    expect(wallPushFlip).toBe(0);
  });

  it('stays grounded across a micro-gap when the previous frame was grounded', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(20, 1, 20)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const scratch = createPlayerCollisionScratch();
    const feet = new THREE.Vector3(0, 0.08, 0);
    let groundedFlip = 0;
    let previousGrounded = true;
    for (let step = 0; step < 30; step++) {
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0.05, 0, 0),
        -0.2,
        1 / 60,
        scratch,
        new THREE.Vector3(1, 0, 0),
        previousGrounded,
      );
      if (result.isGrounded !== previousGrounded) {
        groundedFlip += 1;
      }
      previousGrounded = result.isGrounded;
      expect(result.isGrounded).toBe(true);
      expect(result.verticalVelocity).toBe(0);
      expect(feet.y).toBeLessThan(0.06);
    }
    expect(groundedFlip).toBe(0);
  });

  it('does not flip grounded after landing from a tall drop while walking', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(40, 1, 40)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const scratch = createPlayerCollisionScratch();
    const feet = new THREE.Vector3(0, 8, 0);
    let verticalVelocity = 0;
    let previousGrounded = false;
    let landFrame = -1;
    let groundedFlip = 0;
    for (let step = 0; step < 400; step++) {
      verticalVelocity -= 16 / 60;
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0, 0, 0.08),
        verticalVelocity,
        1 / 60,
        scratch,
        new THREE.Vector3(0, 0, 1),
        previousGrounded,
      );
      verticalVelocity = result.verticalVelocity;
      if (result.isGrounded !== previousGrounded) {
        groundedFlip += 1;
        if (result.isGrounded && landFrame < 0) {
          landFrame = step;
        }
      }
      previousGrounded = result.isGrounded;
      if (landFrame >= 0 && step - landFrame > 90) {
        break;
      }
    }
    expect(landFrame).toBeGreaterThanOrEqual(0);
    expect(groundedFlip).toBe(1);
    expect(previousGrounded).toBe(true);
    expect(feet.y).toBeLessThan(0.08);
  });

  it('climbs a moderate ramp without wall-push pose while walking straight', () => {
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(-1, -0.5, 0), new THREE.Vector3(4, 1, 4)));
    root.add(createRampMesh(6, 3, 2));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(-0.3, 0, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    const intent = new THREE.Vector3(1, 0, 0);
    let wallPushFrames = 0;
    let groundedFlip = 0;
    let previousGrounded = true;
    let maxY = feet.y;
    for (let step = 0; step < 160; step++) {
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0.08, 0, 0),
        -4,
        1 / 60,
        scratch,
        intent,
      );
      if (result.isWallPushing) {
        wallPushFrames += 1;
      }
      if (result.isGrounded !== previousGrounded) {
        groundedFlip += 1;
      }
      previousGrounded = result.isGrounded;
      maxY = Math.max(maxY, feet.y);
      if (feet.x > 5.2) {
        break;
      }
    }
    expect(maxY).toBeGreaterThan(1.2);
    expect(wallPushFrames).toBe(0);
    expect(groundedFlip).toBeLessThan(3);
  });

  it('does not auto-climb a staircase without walking into each riser', () => {
    const stepHeight = 0.2;
    const stepDepth = 0.55;
    const stepCount = 6;
    const topY = stepHeight * stepCount;
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(-1, -0.5, 0), new THREE.Vector3(6, 1, 8)));
    root.add(createStaircase(stepCount, stepDepth, stepHeight, 3));
    root.add(createBoxMesh(new THREE.Vector3(stepDepth * stepCount + 3, topY - 0.5, 0), new THREE.Vector3(6, 1, 6)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(stepDepth * 0.5, stepHeight, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    const startY = feet.y;
    let previousGrounded = true;
    let autoRises = 0;
    for (let step = 0; step < 40; step++) {
      const yBefore = feet.y;
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0, 0, 0.04),
        0,
        1 / 60,
        scratch,
        new THREE.Vector3(0, 0, 1),
        previousGrounded,
      );
      if (feet.y - yBefore > 0.05 && !result.didStepUp) {
        autoRises += 1;
      }
      previousGrounded = result.isGrounded;
    }
    expect(autoRises).toBe(0);
    expect(Math.abs(feet.y - startY)).toBeLessThan(0.04);
  });

  it('stays level on the flat landing after climbing a staircase', () => {
    const stepHeight = 0.2;
    const stepDepth = 0.55;
    const stepCount = 5;
    const topY = stepHeight * stepCount;
    const landingCenterX = stepDepth * stepCount + 3;
    const landingHalfExtentX = 3;
    const landingMinX = landingCenterX - landingHalfExtentX + 0.3;
    const landingMaxX = landingCenterX + landingHalfExtentX - 0.3;
    const root = new THREE.Group();
    root.add(createBoxMesh(new THREE.Vector3(-1, -0.5, 0), new THREE.Vector3(6, 1, 8)));
    root.add(createStaircase(stepCount, stepDepth, stepHeight, 3));
    root.add(createBoxMesh(new THREE.Vector3(landingCenterX, topY - 0.5, 0), new THREE.Vector3(6, 1, 6)));
    const world = new PlayerCollisionWorld();
    world.setWorldRoot(root);
    const feet = new THREE.Vector3(-0.5, 0, 0);
    const scratch = createPlayerCollisionScratch();
    playerCollisionSnapToGround(world, feet, scratch);
    let previousGrounded = true;
    let reachedLanding = false;
    let landingFrames = 0;
    let maxAbsDyOnLanding = 0;
    let risesOnLanding = 0;
    let stepUpsOnLanding = 0;
    let previousY = feet.y;
    for (let step = 0; step < 400; step++) {
      const result = playerCollisionIntegrateStep(
        world,
        feet,
        new THREE.Vector3(0.08, 0, 0),
        0,
        1 / 60,
        scratch,
        new THREE.Vector3(1, 0, 0),
        previousGrounded,
      );
      const dy = feet.y - previousY;
      const onLandingPad = feet.x >= landingMinX && feet.x <= landingMaxX && feet.y > topY - 0.15;
      if (onLandingPad) {
        reachedLanding = true;
        landingFrames += 1;
        maxAbsDyOnLanding = Math.max(maxAbsDyOnLanding, Math.abs(dy));
        if (dy > 0.02) {
          risesOnLanding += 1;
        }
        if (result.didStepUp) {
          stepUpsOnLanding += 1;
        }
        expect(result.isGrounded).toBe(true);
      }
      previousGrounded = result.isGrounded;
      previousY = feet.y;
      if (reachedLanding && landingFrames > 50) {
        break;
      }
    }
    expect(reachedLanding).toBe(true);
    expect(landingFrames).toBeGreaterThan(40);
    expect(risesOnLanding).toBe(0);
    expect(stepUpsOnLanding).toBe(0);
    expect(maxAbsDyOnLanding).toBeLessThan(0.03);
    expect(feet.y).toBeGreaterThan(topY - 0.05);
    expect(feet.y).toBeLessThan(topY + 0.08);
  });
});
