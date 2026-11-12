import * as THREE from 'three';
import type { SolidCollisionChunkSource } from '@/solid/mesh/solid_collision_chunk_source.js';
import { PhysicsLevelSourceTracker } from './physics_level_source_tracker.js';
import type { PhysicsLevelJobQueue } from './physics_level_job_queue.js';
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
   * @param queue Queue of pending collider changes.
   * @param resultMesh Result mesh whose world matrix places the chunks.
   * @param chunkSource Per-brush chunk access of the model.
   */
  constructor(
    levelWorld: PhysicsLevelWorld,
    queue: PhysicsLevelJobQueue,
    resultMesh: THREE.Mesh,
    chunkSource: SolidCollisionChunkSource,
  ) {
    super(levelWorld, queue);
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
   * Queues rebuilds of changed brush chunks and removals of chunks that
   * disappeared.
   *
   * @param rebuildAll True when every chunk must be rebuilt.
   */
  protected syncContent(rebuildAll: boolean): void {
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
        const positions = chunk.positions.subarray(0, chunk.triangleCount * 9);
        this.queueCollider(key, chunk, new THREE.Box3().setFromArray(positions), () => positions);
      }
    });
    this.removeUnseenColliders();
  }

  /** Queues the removal of colliders whose brush no longer produced a chunk. */
  private removeUnseenColliders(): void {
    for (const key of this.ownedKeys()) {
      if (!this.seenKeys.has(key)) {
        this.queueRemoval(key);
      }
    }
  }
}
