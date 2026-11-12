import * as THREE from 'three';
import { PhysicsLevelPose } from './physics_level_pose.js';
import type { PhysicsLevelJobQueue } from './physics_level_job_queue.js';
import type { PhysicsLevelSyncReport } from './physics_level_sync_report.js';
import { physicsLevelTrimeshBuild } from './physics_level_trimesh.js';
import type { PhysicsLevelWorld } from './physics_level_world.js';

/** One collider owned by a tracker and the token of the data it was built from. */
interface PhysicsLevelTrackedCollider {
  sourceToken: unknown;
  localBounds: THREE.Box3;
}

/** Pending token of a collider whose removal is queued. */
const PHYSICS_LEVEL_REMOVAL = Symbol('removal');

/**
 * Base class that mirrors one scene object into keyed level colliders: it
 * follows the object's world transform (moving colliders rigidly at once,
 * rebaking on scale changes) and lets subclasses add, replace, and remove
 * colliders by comparing source tokens. Rebuilds and removals are queued as
 * jobs; the old collider stays in the level world until its job runs.
 */
export abstract class PhysicsLevelSourceTracker {
  protected readonly levelWorld: PhysicsLevelWorld;
  protected readonly pose: PhysicsLevelPose;
  protected readonly trackedColliders: Map<string, PhysicsLevelTrackedCollider>;
  private readonly queue: PhysicsLevelJobQueue;
  private readonly pendingTokens: Map<string, unknown>;
  private readonly scratchWorldBounds: THREE.Box3;

  /**
   * Creates a tracker that writes into a level world through a job queue.
   *
   * @param levelWorld Destination level world.
   * @param queue Queue of pending collider changes.
   */
  constructor(levelWorld: PhysicsLevelWorld, queue: PhysicsLevelJobQueue) {
    this.levelWorld = levelWorld;
    this.pose = new PhysicsLevelPose();
    this.trackedColliders = new Map();
    this.queue = queue;
    this.pendingTokens = new Map();
    this.scratchWorldBounds = new THREE.Box3();
  }

  /**
   * Returns the scene object whose world matrix places the colliders.
   *
   * @returns Transform owner.
   */
  protected abstract getTransformObject(): THREE.Object3D;

  /**
   * Queues additions, rebuilds, and removals so colliders match the source.
   *
   * @param rebuildAll True when every collider must be rebuilt (scale changed).
   */
  protected abstract syncContent(rebuildAll: boolean): void;

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
    this.syncContent(change === 'scale');
  }

  /** Queues the removal of every collider owned by this tracker. */
  removeAll(): void {
    this.ownedKeys().forEach((key) => this.queueRemoval(key));
  }

  /**
   * Lists the keys of built colliders and of colliders with a pending job.
   *
   * @returns Keys.
   */
  protected ownedKeys(): string[] {
    return [...new Set([...this.trackedColliders.keys(), ...this.pendingTokens.keys()])];
  }

  /**
   * Returns whether a key was built from the same source token.
   *
   * @param key Collider key.
   * @param sourceToken Identity of the source data.
   * @returns True when unchanged.
   */
  protected isTrackedColliderCurrent(key: string, sourceToken: unknown): boolean {
    const current = this.pendingTokens.has(key)
      ? this.pendingTokens.get(key)
      : this.trackedColliders.get(key)?.sourceToken;
    return current === sourceToken;
  }

  /**
   * Queues the build (or rebuild) of one collider. Its priority and region come
   * from the old collider's extent and the new source bounds.
   *
   * @param key Collider key.
   * @param sourceToken Identity of the source data.
   * @param sourceBounds Bounds of the source positions in the transform
   *   object's local space.
   * @param trianglePositions Reads the flat local-space triangle positions when
   *   the job runs.
   */
  protected queueCollider(
    key: string,
    sourceToken: unknown,
    sourceBounds: THREE.Box3,
    trianglePositions: () => ArrayLike<number>,
  ): void {
    const bounds = this.oldWorldBounds(key).union(
      sourceBounds.clone().applyMatrix4(this.getTransformObject().matrixWorld),
    );
    this.pendingTokens.set(key, sourceToken);
    this.queue.put(key, {
      bounds,
      run: (report) => this.buildCollider(key, sourceToken, trianglePositions(), report),
    });
  }

  /**
   * Queues the removal of one collider (or forgets its pending build).
   *
   * @param key Collider key.
   */
  protected queueRemoval(key: string): void {
    if (this.trackedColliders.has(key) === false) {
      this.pendingTokens.delete(key);
      this.queue.drop(key);
      return;
    }
    this.pendingTokens.set(key, PHYSICS_LEVEL_REMOVAL);
    this.queue.put(key, { bounds: this.oldWorldBounds(key), run: (report) => this.removeCollider(key, report) });
  }

  /**
   * Returns the world extent of a built collider (empty when none).
   *
   * @param key Collider key.
   * @returns Copy of the bounds.
   */
  private oldWorldBounds(key: string): THREE.Box3 {
    const tracked = this.trackedColliders.get(key);
    return tracked ? this.resolveWorldBounds(tracked.localBounds).clone() : new THREE.Box3();
  }

  /**
   * Builds (or replaces) one collider from local triangle positions (a job).
   *
   * @param key Collider key.
   * @param sourceToken Identity of the source data.
   * @param trianglePositions Flat local-space triangle positions.
   * @param report Sync report to record changes into.
   */
  private buildCollider(
    key: string,
    sourceToken: unknown,
    trianglePositions: ArrayLike<number>,
    report: PhysicsLevelSyncReport,
  ): void {
    this.removeCollider(key, report);
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
   * Removes one collider and records its old extent (a job).
   *
   * @param key Collider key.
   * @param report Sync report to record changes into.
   */
  private removeCollider(key: string, report: PhysicsLevelSyncReport): void {
    this.pendingTokens.delete(key);
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
