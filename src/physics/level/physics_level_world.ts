import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type { PhysicsRapierModule } from '@/physics/rapier/physics_rapier_runtime.js';
import {
  PHYSICS_LEVEL_GROUPS_LEVEL_COLLIDER,
  PHYSICS_LEVEL_GROUPS_LEVEL_QUERY,
} from './physics_level_collision_groups.js';
import type { PhysicsLevelQueryHit } from './physics_level_query_hit.js';
import type { PhysicsLevelTrimeshBuffers } from './physics_level_trimesh.js';

/** One static level collider and the bookkeeping kept for it. */
interface PhysicsLevelColliderEntry {
  collider: RAPIER.Collider;
  triangleCount: number;
}

/** Running totals of level collision work, for diagnostics and benchmarks. */
export interface PhysicsLevelWorldStats {
  colliderCount: number;
  triangleCount: number;
  revision: number;
  lastCommitMilliseconds: number;
  totalColliderBuildMilliseconds: number;
  collidersBuilt: number;
  collidersRemoved: number;
}

/**
 * Static level geometry inside one Rapier world: keyed triangle mesh colliders
 * that can be added, replaced, moved, and removed one at a time, plus ray and
 * shape queries that only see level geometry.
 */
/** Distance a crossing-count ray advances past each surface it hits. */
const PHYSICS_LEVEL_CROSSING_ADVANCE_METERS = 1e-4;

/** Length of the rays used to count surface crossings. */
const PHYSICS_LEVEL_CROSSING_RAY_LENGTH_METERS = 1e5;

export class PhysicsLevelWorld {
  private readonly rapier: PhysicsRapierModule;
  private readonly world: RAPIER.World;
  private readonly entriesByKey: Map<string, PhysicsLevelColliderEntry>;
  private readonly keysByHandle: Map<number, string>;
  private readonly stats: PhysicsLevelWorldStats;
  private isBroadPhaseDirty: boolean;
  private readonly scratchRay: RAPIER.Ray;
  private readonly scratchSphereShapes: Map<number, RAPIER.Ball>;

  /**
   * Creates an empty level world with zero gravity.
   *
   * @param rapier Loaded Rapier module.
   */
  constructor(rapier: PhysicsRapierModule) {
    this.rapier = rapier;
    this.world = new rapier.World({ x: 0, y: 0, z: 0 });
    this.entriesByKey = new Map();
    this.keysByHandle = new Map();
    this.stats = physicsLevelWorldCreateStats();
    this.isBroadPhaseDirty = false;
    this.scratchRay = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.scratchSphereShapes = new Map();
  }

  /**
   * Returns the Rapier module this world was created with.
   *
   * @returns Rapier module.
   */
  getRapier(): PhysicsRapierModule {
    return this.rapier;
  }

  /**
   * Returns the underlying Rapier world for advanced queries.
   *
   * @returns Rapier world.
   */
  getRapierWorld(): RAPIER.World {
    return this.world;
  }

  /**
   * Returns a live view of the collision statistics.
   *
   * @returns Statistics object.
   */
  getStats(): Readonly<PhysicsLevelWorldStats> {
    return this.stats;
  }

  /**
   * Returns the revision counter, bumped by every committed geometry change.
   *
   * @returns Revision number.
   */
  getRevision(): number {
    return this.stats.revision;
  }

  /**
   * Returns whether a collider exists for a key.
   *
   * @param key Collider key.
   * @returns True when present.
   */
  hasCollider(key: string): boolean {
    return this.entriesByKey.has(key);
  }

  /**
   * Returns the key of a collider handle owned by this world.
   *
   * @param handle Rapier collider handle.
   * @returns Collider key, or null when unknown.
   */
  getKeyForHandle(handle: number): string | null {
    return this.keysByHandle.get(handle) ?? null;
  }

  /**
   * Creates or replaces the triangle mesh collider stored under a key.
   *
   * @param key Collider key.
   * @param buffers Triangle mesh buffers in the collider's local space.
   * @param position World translation of the collider.
   * @param quaternion World rotation of the collider.
   */
  setTrimesh(
    key: string,
    buffers: PhysicsLevelTrimeshBuffers,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
  ): void {
    const startMilliseconds = performance.now();
    this.removeCollider(key);
    const description = this.createTrimeshDescription(buffers, position, quaternion);
    const collider = this.world.createCollider(description);
    this.entriesByKey.set(key, { collider, triangleCount: buffers.triangleCount });
    this.keysByHandle.set(collider.handle, key);
    this.stats.triangleCount += buffers.triangleCount;
    this.stats.colliderCount = this.entriesByKey.size;
    this.stats.collidersBuilt++;
    this.stats.totalColliderBuildMilliseconds += performance.now() - startMilliseconds;
    this.isBroadPhaseDirty = true;
  }

  /**
   * Builds the collider description for a level triangle mesh.
   *
   * @param buffers Triangle mesh buffers.
   * @param position World translation.
   * @param quaternion World rotation.
   * @returns Collider description.
   */
  private createTrimeshDescription(
    buffers: PhysicsLevelTrimeshBuffers,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
  ): RAPIER.ColliderDesc {
    const flags = this.rapier.TriMeshFlags.FIX_INTERNAL_EDGES | this.rapier.TriMeshFlags.ORIENTED;
    return this.rapier.ColliderDesc.trimesh(buffers.vertices, buffers.indices, flags)
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
      .setCollisionGroups(PHYSICS_LEVEL_GROUPS_LEVEL_COLLIDER)
      .setFriction(0.6)
      .setRestitution(0);
  }

  /**
   * Moves an existing collider without rebuilding its triangles.
   *
   * @param key Collider key.
   * @param position New world translation.
   * @param quaternion New world rotation.
   */
  setColliderPose(key: string, position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    const entry = this.entriesByKey.get(key);
    if (!entry) {
      return;
    }
    entry.collider.setTranslation({ x: position.x, y: position.y, z: position.z });
    entry.collider.setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w });
    this.isBroadPhaseDirty = true;
  }

  /**
   * Removes the collider stored under a key, when present.
   *
   * @param key Collider key.
   */
  removeCollider(key: string): void {
    const entry = this.entriesByKey.get(key);
    if (!entry) {
      return;
    }
    this.keysByHandle.delete(entry.collider.handle);
    this.world.removeCollider(entry.collider, false);
    this.entriesByKey.delete(key);
    this.stats.triangleCount -= entry.triangleCount;
    this.stats.colliderCount = this.entriesByKey.size;
    this.stats.collidersRemoved++;
    this.isBroadPhaseDirty = true;
  }

  /**
   * Returns every collider key currently stored.
   *
   * @returns Keys snapshot.
   */
  listColliderKeys(): string[] {
    return [...this.entriesByKey.keys()];
  }

  /**
   * Publishes pending collider changes to scene queries by updating the broad
   * phase. Queries made before a commit do not see new colliders.
   *
   * @returns True when there were pending changes.
   */
  commit(): boolean {
    if (!this.isBroadPhaseDirty) {
      return false;
    }
    const startMilliseconds = performance.now();
    this.world.step();
    this.isBroadPhaseDirty = false;
    this.stats.revision++;
    this.stats.lastCommitMilliseconds = performance.now() - startMilliseconds;
    return true;
  }

  /**
   * Returns whether collider changes are waiting for a commit.
   *
   * @returns True when uncommitted.
   */
  hasPendingChanges(): boolean {
    return this.isBroadPhaseDirty;
  }

  /**
   * Casts a ray against level geometry (both triangle sides).
   *
   * @param origin World ray origin.
   * @param direction World unit direction.
   * @param maxDistance Maximum travel distance.
   * @returns Nearest hit, or null.
   */
  castRay(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): PhysicsLevelQueryHit | null {
    this.scratchRay.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.scratchRay.dir = { x: direction.x, y: direction.y, z: direction.z };
    const hit = this.world.castRayAndGetNormal(
      this.scratchRay,
      maxDistance,
      false,
      undefined,
      PHYSICS_LEVEL_GROUPS_LEVEL_QUERY,
    );
    if (!hit) {
      return null;
    }
    const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
    if (normal.dot(direction) > 0) {
      normal.negate();
    }
    const point = origin.clone().addScaledVector(direction, hit.timeOfImpact);
    return { distance: hit.timeOfImpact, point, normal, colliderKey: this.keysByHandle.get(hit.collider.handle) ?? '' };
  }

  /**
   * Returns whether a point lies inside closed level geometry, by counting
   * surface crossings straight up and straight down: both must be odd. Works on
   * per-brush shells that are only closed together.
   *
   * @param point World point.
   * @param maxCrossings Crossings counted per direction before giving up.
   * @returns True when enclosed.
   */
  isPointEnclosed(point: THREE.Vector3, maxCrossings: number = 64): boolean {
    const up = this.countRayCrossings(point, 1, maxCrossings);
    return up % 2 === 1 && this.countRayCrossings(point, -1, maxCrossings) % 2 === 1;
  }

  /**
   * Counts how many level surfaces a vertical ray crosses, collider by collider
   * so coincident faces of neighbouring colliders all count.
   *
   * @param point World start point.
   * @param directionY Plus one for up, minus one for down.
   * @param maxCrossings Maximum crossings to count per collider.
   * @returns Crossing count.
   */
  private countRayCrossings(point: THREE.Vector3, directionY: number, maxCrossings: number): number {
    this.scratchRay.origin = { x: point.x, y: point.y, z: point.z };
    this.scratchRay.dir = { x: 0, y: directionY, z: 0 };
    let crossings = 0;
    this.world.intersectionsWithRay(
      this.scratchRay,
      PHYSICS_LEVEL_CROSSING_RAY_LENGTH_METERS,
      false,
      (intersection) => {
        crossings += this.countColliderCrossings(intersection.collider, point, directionY, maxCrossings);
        return true;
      },
      undefined,
      PHYSICS_LEVEL_GROUPS_LEVEL_QUERY,
    );
    return crossings;
  }

  /**
   * Counts how many faces of one collider a vertical ray crosses.
   *
   * @param collider Level collider.
   * @param point World start point.
   * @param directionY Plus one for up, minus one for down.
   * @param maxCrossings Maximum crossings to count.
   * @returns Crossing count.
   */
  private countColliderCrossings(
    collider: RAPIER.Collider,
    point: THREE.Vector3,
    directionY: number,
    maxCrossings: number,
  ): number {
    const ray = new this.rapier.Ray({ x: point.x, y: point.y, z: point.z }, { x: 0, y: directionY, z: 0 });
    let crossings = 0;
    while (crossings < maxCrossings) {
      const timeOfImpact = collider.castRay(ray, PHYSICS_LEVEL_CROSSING_RAY_LENGTH_METERS, false);
      if (timeOfImpact < 0) {
        return crossings;
      }
      crossings++;
      ray.origin = {
        x: point.x,
        y: ray.origin.y + directionY * (timeOfImpact + PHYSICS_LEVEL_CROSSING_ADVANCE_METERS),
        z: point.z,
      };
    }
    return crossings;
  }

  /**
   * Sweeps a sphere along a direction against level geometry.
   *
   * @param origin World sphere center at the start.
   * @param direction World unit direction.
   * @param radius Sphere radius.
   * @param maxDistance Maximum travel distance.
   * @param stopAtPenetration When false, contacts the sphere already overlaps
   *   at the start are ignored while it moves away from them.
   * @returns Nearest hit, or null when the path is clear.
   */
  castSphere(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    radius: number,
    maxDistance: number,
    stopAtPenetration: boolean = true,
  ): PhysicsLevelQueryHit | null {
    const hit = this.world.castShape(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: direction.x, y: direction.y, z: direction.z },
      this.resolveSphereShape(radius),
      0,
      maxDistance,
      stopAtPenetration,
      undefined,
      PHYSICS_LEVEL_GROUPS_LEVEL_QUERY,
    );
    if (!hit) {
      return null;
    }
    return this.buildSphereHit(origin, direction, radius, hit);
  }

  /**
   * Converts a sphere cast hit into a level query hit.
   *
   * @param origin Sphere start center.
   * @param direction Unit cast direction.
   * @param radius Sphere radius.
   * @param hit Rapier shape cast hit.
   * @returns Level query hit.
   */
  private buildSphereHit(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    radius: number,
    hit: RAPIER.ColliderShapeCastHit,
  ): PhysicsLevelQueryHit {
    const normal = new THREE.Vector3(-hit.normal2.x, -hit.normal2.y, -hit.normal2.z);
    if (normal.lengthSq() < 1e-12) {
      normal.copy(direction).negate();
    }
    normal.normalize();
    const point = origin.clone().addScaledVector(direction, hit.time_of_impact).addScaledVector(normal, -radius);
    return {
      distance: hit.time_of_impact,
      point,
      normal,
      colliderKey: this.keysByHandle.get(hit.collider.handle) ?? '',
    };
  }

  /**
   * Returns a cached Rapier ball shape for a radius.
   *
   * @param radius Sphere radius.
   * @returns Ball shape.
   */
  private resolveSphereShape(radius: number): RAPIER.Ball {
    const cached = this.scratchSphereShapes.get(radius);
    if (cached) {
      return cached;
    }
    const shape = new this.rapier.Ball(radius);
    if (this.scratchSphereShapes.size > 32) {
      this.scratchSphereShapes.clear();
    }
    this.scratchSphereShapes.set(radius, shape);
    return shape;
  }

  /** Frees the Rapier world and forgets every collider. */
  dispose(): void {
    this.entriesByKey.clear();
    this.keysByHandle.clear();
    this.world.free();
  }
}

/**
 * Creates zeroed level world statistics.
 *
 * @returns Statistics object.
 */
function physicsLevelWorldCreateStats(): PhysicsLevelWorldStats {
  return {
    colliderCount: 0,
    triangleCount: 0,
    revision: 0,
    lastCommitMilliseconds: 0,
    totalColliderBuildMilliseconds: 0,
    collidersBuilt: 0,
    collidersRemoved: 0,
  };
}
