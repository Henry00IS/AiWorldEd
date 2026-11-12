import * as THREE from 'three';
import { PhysicsLevelPose } from './physics_level_pose.js';
import type { PhysicsLevelSyncReport } from './physics_level_sync_report.js';
import { physicsLevelTrimeshBuild } from './physics_level_trimesh.js';
import type { PhysicsLevelWorld } from './physics_level_world.js';

/** One collider owned by a tracker and the token of the data it was built from. */
interface PhysicsLevelTrackedCollider {
  sourceToken: unknown;
  localBounds: THREE.Box3;
}

/**
 * Base class that mirrors one scene object into keyed level colliders: it
 * follows the object's world transform (moving colliders rigidly, rebaking on
 * scale changes) and lets subclasses add, replace, and remove colliders by
 * comparing source tokens.
 */
export abstract class PhysicsLevelSourceTracker {
  protected readonly levelWorld: PhysicsLevelWorld;
  protected readonly pose: PhysicsLevelPose;
  protected readonly trackedColliders: Map<string, PhysicsLevelTrackedCollider>;
  private readonly scratchWorldBounds: THREE.Box3;

  /**
   * Creates a tracker that writes into a level world.
   *
   * @param levelWorld Destination level world.
   */
  constructor(levelWorld: PhysicsLevelWorld) {
    this.levelWorld = levelWorld;
    this.pose = new PhysicsLevelPose();
    this.trackedColliders = new Map();
    this.scratchWorldBounds = new THREE.Box3();
  }

  /**
   * Returns the scene object whose world matrix places the colliders.
   *
   * @returns Transform owner.
   */
  protected abstract getTransformObject(): THREE.Object3D;

  /**
   * Adds, replaces, and removes colliders so they match the source data.
   *
   * @param report Sync report to record changes into.
   * @param rebuildAll True when every collider must be rebuilt (scale changed).
   */
  protected abstract syncContent(report: PhysicsLevelSyncReport, rebuildAll: boolean): void;

  /**
   * Follows the transform and source data for one sync pass.
   *
   * @param report Sync report to record changes into.
   */
  sync(report: PhysicsLevelSyncReport): void {
    const transformObject = this.getTransformObject();
    transformObject.updateWorldMatrix(true, false);
    const change = this.pose.update(transformObject.matrixWorld);
    if (change === 'rigid') {
      this.moveAllColliders(report);
    }
    this.syncContent(report, change === 'scale');
  }

  /**
   * Removes every collider owned by this tracker.
   *
   * @param report Sync report to record changes into.
   */
  removeAll(report: PhysicsLevelSyncReport): void {
    for (const key of [...this.trackedColliders.keys()]) {
      this.removeTrackedCollider(key, report);
    }
  }

  /**
   * Returns whether a key was built from the same source token.
   *
   * @param key Collider key.
   * @param sourceToken Identity of the source data.
   * @returns True when unchanged.
   */
  protected isTrackedColliderCurrent(key: string, sourceToken: unknown): boolean {
    return this.trackedColliders.get(key)?.sourceToken === sourceToken;
  }

  /**
   * Builds (or replaces) one collider from local triangle positions.
   *
   * @param key Collider key.
   * @param sourceToken Identity of the source data.
   * @param trianglePositions Flat local-space triangle positions.
   * @param report Sync report to record changes into.
   */
  protected setTrackedCollider(
    key: string,
    sourceToken: unknown,
    trianglePositions: ArrayLike<number>,
    report: PhysicsLevelSyncReport,
  ): void {
    this.removeTrackedCollider(key, report);
    const buffers = physicsLevelTrimeshBuild(trianglePositions, this.pose.getBakeMatrix());
    const localBounds = new THREE.Box3();
    if (buffers) {
      localBounds.setFromArray(buffers.vertices);
      this.levelWorld.setTrimesh(key, buffers, this.pose.position, this.pose.quaternion);
    }
    this.trackedColliders.set(key, { sourceToken, localBounds });
    report.recordChange(this.resolveWorldBounds(localBounds));
  }

  /**
   * Removes one collider and records its old extent.
   *
   * @param key Collider key.
   * @param report Sync report to record changes into.
   */
  protected removeTrackedCollider(key: string, report: PhysicsLevelSyncReport): void {
    const tracked = this.trackedColliders.get(key);
    if (!tracked) {
      return;
    }
    this.levelWorld.removeCollider(key);
    this.trackedColliders.delete(key);
    report.recordChange(this.resolveWorldBounds(tracked.localBounds));
  }

  /**
   * Moves every collider to the current rigid pose.
   *
   * @param report Sync report to record changes into.
   */
  private moveAllColliders(report: PhysicsLevelSyncReport): void {
    for (const [key, tracked] of this.trackedColliders) {
      this.levelWorld.setColliderPose(key, this.pose.position, this.pose.quaternion);
      report.recordChange(this.resolveWorldBounds(tracked.localBounds));
    }
  }

  /**
   * Converts baked local bounds to world bounds with the current rigid pose.
   *
   * @param localBounds Bounds of baked collider vertices.
   * @returns Scratch world bounds.
   */
  private resolveWorldBounds(localBounds: THREE.Box3): THREE.Box3 {
    this.scratchWorldBounds.copy(localBounds);
    if (localBounds.isEmpty()) {
      return this.scratchWorldBounds;
    }
    scratchRigidMatrix.compose(this.pose.position, this.pose.quaternion, UNIT_SCALE);
    return this.scratchWorldBounds.applyMatrix4(scratchRigidMatrix);
  }
}

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const scratchRigidMatrix = new THREE.Matrix4();
