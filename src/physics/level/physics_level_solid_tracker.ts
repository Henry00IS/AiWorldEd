import type * as THREE from 'three';
import type { SolidCollisionChunkSource } from '@/solid/mesh/solid_collision_chunk_source.js';
import { PhysicsLevelSourceTracker } from './physics_level_source_tracker.js';
import type { PhysicsLevelSyncReport } from './physics_level_sync_report.js';
import type { PhysicsLevelWorld } from './physics_level_world.js';

/**
 * Mirrors a solid model's result into one triangle mesh collider per brush
 * chunk, rebuilding only the chunks that changed since the last pass.
 */
export class PhysicsLevelSolidTracker extends PhysicsLevelSourceTracker {
  private readonly resultMesh: THREE.Mesh;
  private readonly chunkSource: SolidCollisionChunkSource;
  private readonly keyPrefix: string;
  private lastSyncedRevision: number;
  private readonly seenKeys: Set<string>;

  /**
   * Creates a tracker for one solid model.
   *
   * @param levelWorld Destination level world.
   * @param resultMesh Result mesh whose world matrix places the chunks.
   * @param chunkSource Per-brush chunk access of the model.
   */
  constructor(levelWorld: PhysicsLevelWorld, resultMesh: THREE.Mesh, chunkSource: SolidCollisionChunkSource) {
    super(levelWorld);
    this.resultMesh = resultMesh;
    this.chunkSource = chunkSource;
    this.keyPrefix = `solid:${resultMesh.uuid}:`;
    this.lastSyncedRevision = -1;
    this.seenKeys = new Set();
  }

  /**
   * Returns the result mesh that places the colliders.
   *
   * @returns Result mesh.
   */
  protected getTransformObject(): THREE.Object3D {
    return this.resultMesh;
  }

  /**
   * Rebuilds changed brush chunks and drops chunks that disappeared.
   *
   * @param report Sync report to record changes into.
   * @param rebuildAll True when every chunk must be rebuilt.
   */
  protected syncContent(report: PhysicsLevelSyncReport, rebuildAll: boolean): void {
    const revision = this.chunkSource.getCollisionRevision();
    if (!rebuildAll && revision === this.lastSyncedRevision) {
      return;
    }
    this.lastSyncedRevision = revision;
    this.seenKeys.clear();
    this.chunkSource.forEachCollisionChunk((brushId, chunk) => {
      const key = this.keyPrefix + brushId;
      this.seenKeys.add(key);
      if (rebuildAll || !this.isTrackedColliderCurrent(key, chunk)) {
        this.setTrackedCollider(key, chunk, chunk.positions.subarray(0, chunk.triangleCount * 9), report);
      }
    });
    this.removeUnseenColliders(report);
  }

  /**
   * Removes colliders whose brush no longer produced a chunk.
   *
   * @param report Sync report to record changes into.
   */
  private removeUnseenColliders(report: PhysicsLevelSyncReport): void {
    for (const key of [...this.trackedColliders.keys()]) {
      if (!this.seenKeys.has(key)) {
        this.removeTrackedCollider(key, report);
      }
    }
  }
}
