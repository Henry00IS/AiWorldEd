import * as THREE from 'three';

/** What one scene-to-collision sync pass changed. */
export class PhysicsLevelSyncReport {
  /** Colliders created, replaced, moved, or removed in the pass. */
  changedColliderCount: number;
  /** World bounds covering the old and new extent of every change. */
  readonly changedBounds: THREE.Box3;
  /** Wall-clock milliseconds spent in the pass, commit included. */
  milliseconds: number;
  /** Collider changes still waiting after the pass (budget spent). */
  pendingCount: number;

  /** Creates an empty report. */
  constructor() {
    this.changedColliderCount = 0;
    this.changedBounds = new THREE.Box3();
    this.milliseconds = 0;
    this.pendingCount = 0;
  }

  /** Clears the report for a new pass. */
  reset(): void {
    this.changedColliderCount = 0;
    this.changedBounds.makeEmpty();
    this.milliseconds = 0;
    this.pendingCount = 0;
  }

  /**
   * Records one changed collider and grows the changed bounds.
   *
   * @param worldBounds World bounds touched by the change.
   */
  recordChange(worldBounds: THREE.Box3 | null): void {
    this.changedColliderCount++;
    if (worldBounds && !worldBounds.isEmpty()) {
      this.changedBounds.union(worldBounds);
    }
  }
}
