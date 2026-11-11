import * as THREE from 'three';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';

/** A detached world built from saved room states. */
export interface WorldCollaborationSnapshot {
  /** World root holding the rebuilt objects; not part of the editor scene. */
  world: THREE.Group;
  /** Disposes the rebuilt objects. */
  dispose(): void;
}

/**
 * Rebuilds saved room states into a detached world, so it can be written out as
 * a level without touching the room.
 *
 * @param states Saved node states, parents first.
 * @returns Detached world.
 */
export function worldCollaborationSnapshotBuild(states: readonly NodeCollaborationState[]): WorldCollaborationSnapshot {
  const world = new THREE.Group();
  const replica = new ReplicaCollaborationScene(world);
  replica.snapshotApply(states);
  return { world, dispose: () => void replica.snapshotApply([]) };
}
