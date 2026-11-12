import * as THREE from 'three';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { isSolidModelObject } from '@/solid/model/solid_model_keys.js';
import { PhysicsLevelJobQueue } from './physics_level_job_queue.js';
import { PhysicsLevelMeshTracker } from './physics_level_mesh_tracker.js';
import { PhysicsLevelSolidTracker } from './physics_level_solid_tracker.js';
import type { PhysicsLevelSourceTracker } from './physics_level_source_tracker.js';
import { PhysicsLevelSyncReport } from './physics_level_sync_report.js';
import type { PhysicsLevelWorld } from './physics_level_world.js';

/** Default milliseconds between scene structure scans. */
export const PHYSICS_LEVEL_SCENE_RESCAN_INTERVAL_MILLISECONDS = 500;

/** Decides which ordinary meshes become level colliders. */
export type PhysicsLevelMeshPredicate = (mesh: THREE.Mesh) => boolean;

/** How a budgeted sync spends its time. */
export interface PhysicsLevelSyncBudget {
  /** Points the nearest pending changes are measured from (player, balls). */
  readonly focus: readonly THREE.Vector3[];
  /** Pending changes touching this region always run (no fall-through). */
  readonly region: THREE.Box3;
  /** Milliseconds for the other pending changes, nearest first. */
  readonly milliseconds: number;
}

/**
 * Keeps a level world in step with a scene: solid models contribute one
 * collider per brush chunk, ordinary meshes one collider each. Every geometry
 * change (local edits, remote edits, undo, loads) reaches collision through the
 * same revision checks, which queue collider jobs; sync() runs them all,
 * syncBudgeted() runs the ones near the player at once and the rest nearest
 * first within a time budget, keeping old colliders until their jobs run.
 */
export class PhysicsLevelSceneSync {
  private readonly levelWorld: PhysicsLevelWorld;
  private readonly isCollidableMesh: PhysicsLevelMeshPredicate;
  private readonly trackersBySource: Map<THREE.Object3D, PhysicsLevelSourceTracker>;
  private readonly foundSources: Set<THREE.Object3D>;
  private readonly report: PhysicsLevelSyncReport;
  private readonly queue: PhysicsLevelJobQueue;
  private root: THREE.Object3D | null;
  private isRescanRequested: boolean;
  private lastRescanMilliseconds: number;
  private rescanIntervalMilliseconds: number;

  /**
   * Creates a scene sync for a level world.
   *
   * @param levelWorld Destination level world.
   * @param isCollidableMesh Returns true for ordinary meshes that collide.
   */
  constructor(levelWorld: PhysicsLevelWorld, isCollidableMesh: PhysicsLevelMeshPredicate) {
    this.levelWorld = levelWorld;
    this.isCollidableMesh = isCollidableMesh;
    this.trackersBySource = new Map();
    this.foundSources = new Set();
    this.report = new PhysicsLevelSyncReport();
    this.queue = new PhysicsLevelJobQueue();
    this.root = null;
    this.isRescanRequested = true;
    this.lastRescanMilliseconds = -Infinity;
    this.rescanIntervalMilliseconds = PHYSICS_LEVEL_SCENE_RESCAN_INTERVAL_MILLISECONDS;
  }

  /**
   * Binds the scene root to mirror and schedules a structure scan.
   *
   * @param root Scene root, or null to mirror nothing.
   */
  setRoot(root: THREE.Object3D | null): void {
    this.root = root;
    this.requestRescan();
  }

  /** Schedules a scene structure scan on the next sync. */
  requestRescan(): void {
    this.isRescanRequested = true;
  }

  /**
   * Sets how often the scene structure is rescanned for added or removed
   * objects and visibility changes.
   *
   * @param milliseconds Interval in milliseconds.
   */
  setRescanIntervalMilliseconds(milliseconds: number): void {
    this.rescanIntervalMilliseconds = milliseconds;
  }

  /**
   * Returns how many scene sources are mirrored.
   *
   * @returns Tracker count.
   */
  getTrackedSourceCount(): number {
    return this.trackersBySource.size;
  }

  /**
   * Applies every pending scene change to the level world and commits it.
   *
   * @param nowMilliseconds Current time for the rescan interval.
   * @returns Report of this pass.
   */
  sync(nowMilliseconds: number = performance.now()): PhysicsLevelSyncReport {
    const startMilliseconds = this.collect(nowMilliseconds);
    this.queue.runAll(this.report);
    return this.finish(startMilliseconds);
  }

  /**
   * Applies the pending changes inside the budget region, then others nearest
   * to the focus first until the time budget is spent, and commits.
   *
   * @param budget Focus points, region and milliseconds.
   * @param nowMilliseconds Current time for the rescan interval.
   * @returns Report of this pass.
   */
  syncBudgeted(budget: PhysicsLevelSyncBudget, nowMilliseconds: number = performance.now()): PhysicsLevelSyncReport {
    const startMilliseconds = this.collect(nowMilliseconds);
    this.queue.runInside(budget.region, this.report);
    if (this.queue.size() > 0 && budget.milliseconds > 0)
      this.queue.runNearest(budget.focus, budget.milliseconds, this.report);
    return this.finish(startMilliseconds);
  }

  /**
   * Starts a pass: rescans when due and lets every tracker queue its changes.
   *
   * @param nowMilliseconds Current time for the rescan interval.
   * @returns Start time of the pass.
   */
  private collect(nowMilliseconds: number): number {
    const startMilliseconds = performance.now();
    this.report.reset();
    if (this.isRescanDue(nowMilliseconds)) {
      this.rescan(nowMilliseconds);
    }
    for (const tracker of this.trackersBySource.values()) {
      tracker.sync(this.report);
    }
    return startMilliseconds;
  }

  /**
   * Ends a pass: commits the level world and completes the report.
   *
   * @param startMilliseconds Start time of the pass.
   * @returns Report of this pass.
   */
  private finish(startMilliseconds: number): PhysicsLevelSyncReport {
    this.levelWorld.commit();
    this.report.pendingCount = this.queue.size();
    this.report.milliseconds = performance.now() - startMilliseconds;
    return this.report;
  }

  /**
   * Returns whether a structure scan should run now.
   *
   * @param nowMilliseconds Current time.
   * @returns True when requested or the interval elapsed.
   */
  private isRescanDue(nowMilliseconds: number): boolean {
    return this.isRescanRequested || nowMilliseconds - this.lastRescanMilliseconds >= this.rescanIntervalMilliseconds;
  }

  /**
   * Finds collidable sources under the root and adds or drops trackers.
   *
   * @param nowMilliseconds Current time.
   */
  private rescan(nowMilliseconds: number): void {
    this.isRescanRequested = false;
    this.lastRescanMilliseconds = nowMilliseconds;
    this.foundSources.clear();
    if (this.root) {
      this.visitObject(this.root);
    }
    this.dropTrackersNotFound();
  }

  /**
   * Visits one visible object: solid models end the descent, collidable meshes
   * are tracked, other objects recurse into children.
   *
   * @param object Scene object.
   */
  private visitObject(object: THREE.Object3D): void {
    if (!object.visible) {
      return;
    }
    if (isSolidModelObject(object)) {
      this.visitSolidModelRoot(object);
      return;
    }
    if (object instanceof THREE.Mesh && this.isCollidableMesh(object)) {
      this.trackSource(object, () => new PhysicsLevelMeshTracker(this.levelWorld, this.queue, object));
    }
    for (const child of object.children) {
      this.visitObject(child);
    }
  }

  /**
   * Tracks the result of a registered solid model when it is visible.
   *
   * @param root Solid model root object.
   */
  private visitSolidModelRoot(root: THREE.Object3D): void {
    const model = SolidModelRegistry.get(root);
    if (!model) {
      return;
    }
    const resultMesh = model.getResultMesh();
    if (!resultMesh.visible) {
      return;
    }
    this.trackSource(
      resultMesh,
      () => new PhysicsLevelSolidTracker(this.levelWorld, this.queue, resultMesh, model.getCollisionChunkSource()),
    );
  }

  /**
   * Marks a source as found and creates its tracker on first sight.
   *
   * @param source Scene object that owns the geometry.
   * @param createTracker Factory for a new tracker.
   */
  private trackSource(source: THREE.Object3D, createTracker: () => PhysicsLevelSourceTracker): void {
    this.foundSources.add(source);
    if (!this.trackersBySource.has(source)) {
      this.trackersBySource.set(source, createTracker());
    }
  }

  /** Removes trackers (and their colliders) whose source was not found. */
  private dropTrackersNotFound(): void {
    for (const [source, tracker] of [...this.trackersBySource]) {
      if (this.foundSources.has(source)) {
        continue;
      }
      tracker.removeAll();
      this.trackersBySource.delete(source);
    }
  }
}
