import * as THREE from 'three';
import { modifierVolumeIs } from '@/modifier/volume/modifier_volume_is.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { PLAYER_FIGURINE_USERDATA_KEY } from '@/player/player_constants.js';
import { SOLID_BRUSH_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import { PhysicsLevelSceneSync, type PhysicsLevelSyncBudget } from '@/physics/level/physics_level_scene_sync.js';
import type { PhysicsLevelSyncReport } from '@/physics/level/physics_level_sync_report.js';
import type { PhysicsLevelQueryHit } from '@/physics/level/physics_level_query_hit.js';
import { PlayerCollisionCharacterRig } from './player_collision_character_rig.js';

/** Nearest hit of a ray or sphere cast against level geometry. */
export type PlayerCollisionRayHit = PhysicsLevelQueryHit;

/** Milliseconds per frame window in which one collision rebuild budget is spent. */
export const PLAYER_COLLISION_WINDOW_MILLISECONDS = 16;

/** Milliseconds of collider rebuilds per frame window beyond the focus region. */
export const PLAYER_COLLISION_BUDGET_MILLISECONDS = 1;

/** Reach around each focus point inside which pending rebuilds always run. */
export const PLAYER_COLLISION_FLUSH_RADIUS_METERS = 8;

/**
 * Player-facing collision world: mirrors the scene into a Rapier level world
 * (incrementally, per brush chunk), owns the shared character controller, and
 * answers ray and sphere casts for the camera and spawn. It costs nothing until
 * play mode activates it and is freed on release, so editing outside play mode
 * never touches physics. Once built, scene edits reach collision budgeted:
 * changes near the focus points (player, own balls) apply at once, the rest
 * nearest first within PLAYER_COLLISION_BUDGET_MILLISECONDS per frame window,
 * with old colliders kept until their replacements are ready.
 */
export class PlayerCollisionWorld {
  private worldRoot: THREE.Object3D | null;
  private levelWorld: PhysicsLevelWorld | null;
  private sceneSync: PhysicsLevelSceneSync | null;
  private characterRig: PlayerCollisionCharacterRig | null;
  private readonly pendingChangedBounds: THREE.Box3;
  private readonly focusSets: Map<string, readonly THREE.Vector3[]>;
  private active: boolean;
  private built: boolean;
  private budgetAt: number;

  /** Creates an inactive collision world and starts loading the physics module. */
  constructor() {
    this.worldRoot = null;
    this.levelWorld = null;
    this.sceneSync = null;
    this.characterRig = null;
    this.pendingChangedBounds = new THREE.Box3();
    this.focusSets = new Map();
    this.active = false;
    this.built = false;
    this.budgetAt = Number.NEGATIVE_INFINITY;
    void PhysicsRapierRuntime.ensureLoaded();
  }

  /**
   * Starts demand (entering play mode); the level world is built on the first
   * query.
   */
  activate(): void {
    this.active = true;
  }

  /**
   * Returns whether play mode demands collision.
   *
   * @returns True while active.
   */
  isActive(): boolean {
    return this.active;
  }

  /** Ends demand (leaving play mode) and frees the level world. */
  release(): void {
    this.active = false;
    this.levelWorld?.dispose();
    this.levelWorld = null;
    this.sceneSync = null;
    this.characterRig = null;
    this.built = false;
    this.budgetAt = Number.NEGATIVE_INFINITY;
    this.focusSets.clear();
    this.pendingChangedBounds.makeEmpty();
  }

  /**
   * Sets where collision matters most (the player's feet, the own balls);
   * without any focus every pending change applies at once.
   *
   * @param name Focus owner.
   * @param points Focus points.
   */
  setFocus(name: string, points: readonly THREE.Vector3[]): void {
    this.focusSets.set(name, points);
  }

  /**
   * Binds the world root used when collecting collision geometry.
   *
   * @param worldRoot Scene root containing solid geometry.
   */
  setWorldRoot(worldRoot: THREE.Object3D | null): void {
    this.worldRoot = worldRoot;
    this.sceneSync?.setRoot(worldRoot);
  }

  /** Forces a scene structure rescan on the next query. */
  invalidateMeshCache(): void {
    this.sceneSync?.requestRescan();
  }

  /**
   * Returns whether the physics module is loaded and queries are live.
   *
   * @returns True when ready.
   */
  isReady(): boolean {
    return this.ensureLevelWorld() !== null;
  }

  /**
   * Applies pending scene changes to collision and returns the level world.
   *
   * @returns Level world, or null while physics is still loading.
   */
  syncLevelWorld(): PhysicsLevelWorld | null {
    const levelWorld = this.ensureLevelWorld();
    if (!levelWorld || !this.sceneSync) {
      return null;
    }
    const report = this.syncScene(this.sceneSync, performance.now());
    if (!report.changedBounds.isEmpty()) {
      this.pendingChangedBounds.union(report.changedBounds);
    }
    return levelWorld;
  }

  /**
   * Builds the whole level on the first sync or without focus, and budgeted
   * afterwards (the time budget once per frame window).
   *
   * @param sceneSync Scene sync.
   * @param now Current time in milliseconds.
   * @returns Report of the pass.
   */
  private syncScene(sceneSync: PhysicsLevelSceneSync, now: number): PhysicsLevelSyncReport {
    const focus = [...this.focusSets.values()].flat();
    if (this.built === false || focus.length === 0) {
      this.built = true;
      return sceneSync.sync(now);
    }
    const due = now - this.budgetAt >= PLAYER_COLLISION_WINDOW_MILLISECONDS;
    if (due) this.budgetAt = now;
    return sceneSync.syncBudgeted(playerCollisionBudget(focus, due ? PLAYER_COLLISION_BUDGET_MILLISECONDS : 0), now);
  }

  /**
   * Returns the scene sync, for tuning and diagnostics.
   *
   * @returns Scene sync, or null while physics is still loading.
   */
  getSceneSync(): PhysicsLevelSceneSync | null {
    this.ensureLevelWorld();
    return this.sceneSync;
  }

  /**
   * Returns the shared character controller rig after syncing geometry.
   *
   * @returns Rig, or null while physics is still loading.
   */
  getCharacterRig(): PlayerCollisionCharacterRig | null {
    const levelWorld = this.syncLevelWorld();
    if (!levelWorld) {
      return null;
    }
    if (!this.characterRig) {
      this.characterRig = new PlayerCollisionCharacterRig(levelWorld);
    }
    return this.characterRig;
  }

  /**
   * Returns and clears the world bounds of geometry changed since the last
   * call.
   *
   * @param target Destination box.
   * @returns The target box (empty when nothing changed).
   */
  takeChangedBounds(target: THREE.Box3): THREE.Box3 {
    target.copy(this.pendingChangedBounds);
    this.pendingChangedBounds.makeEmpty();
    return target;
  }

  /**
   * Casts a ray and returns the nearest hit distance, or null when none.
   *
   * @param origin World-space ray origin.
   * @param direction World-space unit direction.
   * @param maxDistance Maximum cast distance.
   * @returns Nearest hit distance, or null.
   */
  raycastNearestDistance(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): number | null {
    return this.raycastNearest(origin, direction, maxDistance)?.distance ?? null;
  }

  /**
   * Casts a ray against level geometry and returns the nearest hit.
   *
   * @param origin World-space ray origin.
   * @param direction World-space unit direction.
   * @param maxDistance Maximum cast distance.
   * @returns Nearest hit, or null.
   */
  raycastNearest(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): PlayerCollisionRayHit | null {
    return this.syncLevelWorld()?.castRay(origin, direction, maxDistance) ?? null;
  }

  /**
   * Sweeps a sphere against level geometry and returns the nearest hit.
   *
   * @param origin World-space sphere center at the start.
   * @param direction World-space unit direction.
   * @param radius Sphere radius.
   * @param maxDistance Maximum travel distance.
   * @param stopAtPenetration When false, overlaps at the start are ignored
   *   while the sphere moves away from them.
   * @returns Nearest hit, or null when the path is clear.
   */
  castSphere(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    radius: number,
    maxDistance: number,
    stopAtPenetration: boolean = true,
  ): PlayerCollisionRayHit | null {
    return this.syncLevelWorld()?.castSphere(origin, direction, radius, maxDistance, stopAtPenetration) ?? null;
  }

  /**
   * Returns how many triangles the level colliders hold after syncing.
   *
   * @returns Triangle count, or zero while physics is still loading.
   */
  getCollisionTriangleCount(): number {
    return this.syncLevelWorld()?.getStats().triangleCount ?? 0;
  }

  /**
   * Creates the level world once the physics module has loaded.
   *
   * @returns Level world, or null while loading.
   */
  private ensureLevelWorld(): PhysicsLevelWorld | null {
    if (this.levelWorld || this.active === false) {
      return this.levelWorld;
    }
    const rapier = PhysicsRapierRuntime.getLoaded();
    if (!rapier) {
      return null;
    }
    this.levelWorld = new PhysicsLevelWorld(rapier);
    this.sceneSync = new PhysicsLevelSceneSync(this.levelWorld, playerCollisionIsCollidableMesh);
    this.sceneSync.setRoot(this.worldRoot);
    return this.levelWorld;
  }
}

/**
 * Builds a sync budget: the region around every focus point always runs, the
 * rest nearest first within the given time.
 *
 * @param focus Focus points.
 * @param milliseconds Time for changes outside the region.
 * @returns Budget.
 */
export function playerCollisionBudget(focus: readonly THREE.Vector3[], milliseconds: number): PhysicsLevelSyncBudget {
  const region = new THREE.Box3();
  const reach = new THREE.Vector3().setScalar(PLAYER_COLLISION_FLUSH_RADIUS_METERS);
  focus.forEach((point) => region.union(new THREE.Box3(point.clone().sub(reach), point.clone().add(reach))));
  return { focus, region, milliseconds };
}

/**
 * Returns whether an ordinary scene mesh participates in player collision.
 *
 * @param mesh Scene mesh (solid model results are handled separately).
 * @returns True for visible meshes with triangles that are not helpers.
 */
export function playerCollisionIsCollidableMesh(mesh: THREE.Mesh): boolean {
  if (!mesh.geometry || !playerCollisionHasUsableTriangles(mesh.geometry)) {
    return false;
  }
  if (playerCollisionIsExcludedObject(mesh)) {
    return false;
  }
  if (isResultMesh(mesh)) {
    return true;
  }
  return !isEditorHelperObject(mesh);
}

/**
 * Returns whether a mesh is omitted from player collision.
 *
 * @param object Scene object under test.
 * @returns True for figurines, brush helpers, and modifier volumes.
 */
function playerCollisionIsExcludedObject(object: THREE.Object3D): boolean {
  if (object.userData[PLAYER_FIGURINE_USERDATA_KEY] === true) {
    return true;
  }
  if (object.userData[SOLID_BRUSH_USERDATA_KEY] === true) {
    return true;
  }
  return modifierVolumeIs(object);
}

/**
 * Returns whether a geometry has at least one triangle.
 *
 * @param geometry Candidate geometry.
 * @returns True when there is position data for a triangle.
 */
function playerCollisionHasUsableTriangles(geometry: THREE.BufferGeometry): boolean {
  const positions = geometry.getAttribute('position');
  if (!positions || positions.count < 3) {
    return false;
  }
  const index = geometry.getIndex();
  return !index || index.count >= 3;
}
