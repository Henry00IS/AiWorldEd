import type * as THREE from 'three';
import { PhysicsLevelSourceTracker } from './physics_level_source_tracker.js';
import type { PhysicsLevelSyncReport } from './physics_level_sync_report.js';
import { physicsLevelTrimeshExpandGeometry } from './physics_level_trimesh.js';
import type { PhysicsLevelWorld } from './physics_level_world.js';

/**
 * Mirrors one ordinary scene mesh into a single triangle mesh collider,
 * rebuilding it when the geometry object or its buffers change.
 */
export class PhysicsLevelMeshTracker extends PhysicsLevelSourceTracker {
  private readonly mesh: THREE.Mesh;
  private readonly colliderKey: string;
  private lastGeometry: THREE.BufferGeometry | null;
  private lastGeometryVersion: number;

  /**
   * Creates a tracker for one mesh.
   *
   * @param levelWorld Destination level world.
   * @param mesh Scene mesh.
   */
  constructor(levelWorld: PhysicsLevelWorld, mesh: THREE.Mesh) {
    super(levelWorld);
    this.mesh = mesh;
    this.colliderKey = `mesh:${mesh.uuid}`;
    this.lastGeometry = null;
    this.lastGeometryVersion = -1;
  }

  /**
   * Returns the mesh that places the collider.
   *
   * @returns Mesh.
   */
  protected getTransformObject(): THREE.Object3D {
    return this.mesh;
  }

  /**
   * Rebuilds the collider when the geometry changed.
   *
   * @param report Sync report to record changes into.
   * @param rebuildAll True when the collider must be rebuilt.
   */
  protected syncContent(report: PhysicsLevelSyncReport, rebuildAll: boolean): void {
    const geometry = this.mesh.geometry;
    const version = this.resolveGeometryVersion(geometry);
    if (!rebuildAll && geometry === this.lastGeometry && version === this.lastGeometryVersion) {
      return;
    }
    this.lastGeometry = geometry;
    this.lastGeometryVersion = version;
    this.setTrackedCollider(this.colliderKey, geometry, physicsLevelTrimeshExpandGeometry(geometry), report);
  }

  /**
   * Sums the position and index buffer versions into one change token.
   *
   * @param geometry Mesh geometry.
   * @returns Combined version number.
   */
  private resolveGeometryVersion(geometry: THREE.BufferGeometry): number {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    const index = geometry.getIndex();
    return (position?.version ?? 0) * 65536 + (index?.version ?? 0);
  }
}
