import type * as THREE from 'three';
import type { PhysicsLevelSyncReport } from './physics_level_sync_report.js';

/** One pending collider change: a rebuild from new triangles or a removal. */
export interface PhysicsLevelJob {
  /** World extent of the old and the new geometry, for priority and regions. */
  bounds: THREE.Box3;
  /** Applies the change to the level world. */
  run: (report: PhysicsLevelSyncReport) => void;
}

/** A pending job with its distance to the nearest focus point. */
interface PhysicsLevelRankedJob {
  key: string;
  job: PhysicsLevelJob;
  distance: number;
}

/**
 * Collider changes waiting to be applied, keyed by collider so a newer change
 * replaces an older one. The old collider stays in the level world until its
 * job runs. Jobs run all at once, inside a region, or nearest-first within a
 * time budget.
 */
export class PhysicsLevelJobQueue {
  private readonly jobs: Map<string, PhysicsLevelJob>;

  /** Creates an empty queue. */
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Queues a change, replacing any pending change of the same collider.
   *
   * @param key Collider key.
   * @param job Change to apply.
   */
  put(key: string, job: PhysicsLevelJob): void {
    this.jobs.delete(key);
    this.jobs.set(key, job);
  }

  /**
   * Forgets a pending change.
   *
   * @param key Collider key.
   */
  drop(key: string): void {
    this.jobs.delete(key);
  }

  /**
   * Returns how many changes are pending.
   *
   * @returns Pending count.
   */
  size(): number {
    return this.jobs.size;
  }

  /**
   * Applies every pending change.
   *
   * @param report Sync report to record changes into.
   * @returns Number of changes applied.
   */
  runAll(report: PhysicsLevelSyncReport): number {
    const keys = [...this.jobs.keys()];
    keys.forEach((key) => this.runKey(key, report));
    return keys.length;
  }

  /**
   * Applies the pending changes whose old or new geometry touches a region.
   *
   * @param region World box that must be exact.
   * @param report Sync report to record changes into.
   * @returns Number of changes applied.
   */
  runInside(region: THREE.Box3, report: PhysicsLevelSyncReport): number {
    if (this.jobs.size === 0) return 0;
    const keys = [...this.jobs].filter(([, job]) => job.bounds.intersectsBox(region)).map(([key]) => key);
    keys.forEach((key) => this.runKey(key, report));
    return keys.length;
  }

  /**
   * Applies pending changes nearest to the focus points first until the budget
   * is spent; at least one runs so the queue always drains.
   *
   * @param focus Points that matter most (players, balls); empty keeps queue
   *   order.
   * @param budgetMilliseconds Time allowed.
   * @param report Sync report to record changes into.
   * @returns Number of changes applied.
   */
  runNearest(focus: readonly THREE.Vector3[], budgetMilliseconds: number, report: PhysicsLevelSyncReport): number {
    const start = performance.now();
    let count = 0;
    for (const ranked of this.ranked(focus)) {
      if (count > 0 && performance.now() - start >= budgetMilliseconds) break;
      this.runKey(ranked.key, report);
      count++;
    }
    return count;
  }

  /**
   * Orders the pending changes by distance to the nearest focus point.
   *
   * @param focus Focus points.
   * @returns Ranked jobs, nearest first.
   */
  private ranked(focus: readonly THREE.Vector3[]): PhysicsLevelRankedJob[] {
    const ranked = [...this.jobs].map(([key, job]) => ({ key, job, distance: physicsLevelJobDistance(job, focus) }));
    return focus.length === 0 ? ranked : ranked.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Runs and forgets one pending change when it is still pending.
   *
   * @param key Collider key.
   * @param report Sync report to record changes into.
   */
  private runKey(key: string, report: PhysicsLevelSyncReport): void {
    const job = this.jobs.get(key);
    if (!job) return;
    this.jobs.delete(key);
    job.run(report);
  }
}

/**
 * Returns the distance from a job's extent to the nearest focus point.
 *
 * @param job Pending job.
 * @param focus Focus points.
 * @returns Distance in meters (0 without focus or bounds).
 */
function physicsLevelJobDistance(job: PhysicsLevelJob, focus: readonly THREE.Vector3[]): number {
  if (focus.length === 0 || job.bounds.isEmpty()) return 0;
  return Math.min(...focus.map((point) => job.bounds.distanceToPoint(point)));
}
