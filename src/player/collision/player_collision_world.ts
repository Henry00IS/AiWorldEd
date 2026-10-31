import * as THREE from 'three';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { PLAYER_FIGURINE_USERDATA_KEY } from '@/player/player_constants.js';
import { getOrBuildFacePickBvh } from '@/selection/pick/mesh_pick_acceleration.js';
import type { TriangleBvh } from '@/selection/pick/triangle_bvh.js';
import { SOLID_BRUSH_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { isResultMesh, SOLID_MODEL_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { PlayerTriangleSoup } from './player_triangle_soup.js';

/** One collidable mesh with a cached world AABB for raycasts. */
interface PlayerCollisionMeshEntry {
  mesh: THREE.Mesh;
  worldBox: THREE.Box3;
}

/** Cell size for the player collision raycast broadphase grid in meters. */
const COLLISION_GRID_CELL_SIZE_METERS = 4;

/**
 * Collects solid collision meshes into a static triangle soup for capsule
 * contacts, and keeps a mesh list with BVH raycasts for camera and placement.
 */
export class PlayerCollisionWorld {
  private readonly meshEntries: PlayerCollisionMeshEntry[];
  private readonly cellToEntryIndices: Map<number, number[]>;
  private readonly triangleSoup: PlayerTriangleSoup;
  private worldRoot: THREE.Object3D | null;
  private isMeshCacheDirty: boolean;
  private readonly scratchRay: THREE.Ray;
  private readonly scratchInverse: THREE.Matrix4;
  private readonly scratchLocalOrigin: THREE.Vector3;
  private readonly scratchLocalDirection: THREE.Vector3;
  private readonly scratchWorldPoint: THREE.Vector3;
  private readonly candidateIndices: number[];

  /** Creates an empty collision world. */
  constructor() {
    this.meshEntries = [];
    this.cellToEntryIndices = new Map();
    this.triangleSoup = new PlayerTriangleSoup();
    this.worldRoot = null;
    this.isMeshCacheDirty = true;
    this.scratchRay = new THREE.Ray();
    this.scratchInverse = new THREE.Matrix4();
    this.scratchLocalOrigin = new THREE.Vector3();
    this.scratchLocalDirection = new THREE.Vector3();
    this.scratchWorldPoint = new THREE.Vector3();
    this.candidateIndices = [];
  }

  /**
   * Binds the world root used when collecting collision meshes.
   *
   * @param worldRoot Scene root containing solid geometry.
   */
  setWorldRoot(worldRoot: THREE.Object3D | null): void {
    this.worldRoot = worldRoot;
    this.isMeshCacheDirty = true;
  }

  /** Marks the mesh cache dirty so the next query rebuilds broadphase data. */
  invalidateMeshCache(): void {
    this.isMeshCacheDirty = true;
  }

  /**
   * Returns the baked static triangle soup, rebuilding when dirty.
   *
   * @returns Triangle soup for capsule contacts.
   */
  getTriangleSoup(): PlayerTriangleSoup {
    this.ensureMeshCache();
    return this.triangleSoup;
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
    const hit = this.raycastNearest(origin, direction, maxDistance);
    if (!hit) {
      return null;
    }
    return hit.distance;
  }

  /**
   * Casts a ray and returns the nearest intersection, or null when none.
   *
   * @param origin World-space ray origin.
   * @param direction World-space unit direction.
   * @param maxDistance Maximum cast distance.
   * @returns Nearest intersection, or null.
   */
  raycastNearest(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): THREE.Intersection | null {
    this.ensureMeshCache();
    if (this.meshEntries.length === 0) {
      return null;
    }
    this.scratchRay.origin.copy(origin);
    this.scratchRay.direction.copy(direction);
    this.collectRayCandidates(origin, direction, maxDistance);
    let nearest: THREE.Intersection | null = null;
    for (let index = 0; index < this.candidateIndices.length; index++) {
      const entryIndex = this.candidateIndices[index];
      if (entryIndex === undefined) {
        continue;
      }
      const entry = this.meshEntries[entryIndex];
      if (!entry) {
        continue;
      }
      const hit = this.raycastMeshEntry(entry, maxDistance);
      if (!hit) {
        continue;
      }
      if (!nearest || hit.distance < nearest.distance) {
        nearest = hit;
      }
    }
    return nearest;
  }

  /** Rebuilds mesh entries, raycast grid, and triangle soup when dirty. */
  private ensureMeshCache(): void {
    if (!this.isMeshCacheDirty) {
      return;
    }
    this.rebuildMeshCache();
    this.isMeshCacheDirty = false;
  }

  /** Traverses the world root and rebuilds raycast and soup data. */
  private rebuildMeshCache(): void {
    this.meshEntries.length = 0;
    this.cellToEntryIndices.clear();
    this.triangleSoup.clear();
    if (!this.worldRoot) {
      return;
    }
    this.worldRoot.traverse((child) => {
      if (!this.isCollidableMesh(child)) {
        return;
      }
      this.addMeshEntry(child);
      this.triangleSoup.bakeMesh(child);
    });
  }

  /**
   * Returns whether an object should participate in player collision.
   *
   * @param object Scene object under test.
   * @returns True when the object is a visible collidable mesh.
   */
  private isCollidableMesh(object: THREE.Object3D): object is THREE.Mesh {
    if (!this.isCollisionMeshShape(object)) {
      return false;
    }
    if (this.isPlayerCollisionExcluded(object)) {
      return false;
    }
    if (isResultMesh(object)) {
      return true;
    }
    if (isEditorHelperObject(object)) {
      return false;
    }
    return !this.isUnderSolidModelRoot(object);
  }

  /**
   * Returns whether an object is a visible mesh with triangle data.
   *
   * @param object Scene object under test.
   * @returns True when the object can supply collision triangles.
   */
  private isCollisionMeshShape(object: THREE.Object3D): object is THREE.Mesh {
    if (!(object instanceof THREE.Mesh)) {
      return false;
    }
    if (!object.visible || !object.geometry) {
      return false;
    }
    return this.hasUsableTriangleGeometry(object);
  }

  /**
   * Returns whether a mesh is omitted from player collision.
   *
   * @param object Scene object under test.
   * @returns True for figurines, brush helpers, and modifier volumes.
   */
  private isPlayerCollisionExcluded(object: THREE.Object3D): boolean {
    if (object.userData[PLAYER_FIGURINE_USERDATA_KEY] === true) {
      return true;
    }
    if (object.userData[SOLID_BRUSH_USERDATA_KEY] === true) {
      return true;
    }
    return ModifierVolumeBevel.isVolume(object);
  }

  /**
   * Returns whether a mesh lives under a solid model root without being the
   * compiled result (brush children that lost their helper flag, etc.).
   *
   * @param object Scene object.
   * @returns True when an ancestor is a solid model root.
   */
  private isUnderSolidModelRoot(object: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object.parent;
    while (current) {
      if (current.userData[SOLID_MODEL_USERDATA_KEY] === true) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * Returns whether a mesh has at least one triangle to bake or raycast.
   *
   * @param mesh Candidate mesh.
   * @returns True when geometry has position data and triangles.
   */
  private hasUsableTriangleGeometry(mesh: THREE.Mesh): boolean {
    const geometry = mesh.geometry;
    if (!geometry) {
      return false;
    }
    const positions = geometry.getAttribute('position');
    if (!positions || positions.count < 3) {
      return false;
    }
    const index = geometry.getIndex();
    if (index && index.count < 3) {
      return false;
    }
    return true;
  }

  /**
   * Adds one mesh entry and inserts it into overlapping raycast grid cells.
   *
   * @param mesh Collidable mesh.
   */
  private addMeshEntry(mesh: THREE.Mesh): void {
    mesh.updateMatrixWorld(false);
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }
    const worldBox = new THREE.Box3();
    if (mesh.geometry.boundingBox) {
      worldBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    } else {
      worldBox.setFromObject(mesh);
    }
    const entryIndex = this.meshEntries.length;
    this.meshEntries.push({ mesh, worldBox });
    this.insertEntryIntoGrid(entryIndex, worldBox);
  }

  /**
   * Buckets an entry index into every overlapping XZ grid cell.
   *
   * @param entryIndex Mesh entry index.
   * @param worldBox World-space AABB.
   */
  private insertEntryIntoGrid(entryIndex: number, worldBox: THREE.Box3): void {
    const minX = Math.floor(worldBox.min.x / COLLISION_GRID_CELL_SIZE_METERS);
    const maxX = Math.floor(worldBox.max.x / COLLISION_GRID_CELL_SIZE_METERS);
    const minZ = Math.floor(worldBox.min.z / COLLISION_GRID_CELL_SIZE_METERS);
    const maxZ = Math.floor(worldBox.max.z / COLLISION_GRID_CELL_SIZE_METERS);
    for (let cellX = minX; cellX <= maxX; cellX++) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ++) {
        const key = packCollisionCellKey(cellX, cellZ);
        let bucket = this.cellToEntryIndices.get(key);
        if (!bucket) {
          bucket = [];
          this.cellToEntryIndices.set(key, bucket);
        }
        bucket.push(entryIndex);
      }
    }
  }

  /**
   * Collects unique mesh entry indices that may intersect a short ray segment.
   *
   * @param origin Ray origin.
   * @param direction Unit ray direction.
   * @param maxDistance Ray length.
   */
  private collectRayCandidates(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): void {
    this.candidateIndices.length = 0;
    const endX = origin.x + direction.x * maxDistance;
    const endZ = origin.z + direction.z * maxDistance;
    const minX = Math.floor(Math.min(origin.x, endX) / COLLISION_GRID_CELL_SIZE_METERS) - 1;
    const maxX = Math.floor(Math.max(origin.x, endX) / COLLISION_GRID_CELL_SIZE_METERS) + 1;
    const minZ = Math.floor(Math.min(origin.z, endZ) / COLLISION_GRID_CELL_SIZE_METERS) - 1;
    const maxZ = Math.floor(Math.max(origin.z, endZ) / COLLISION_GRID_CELL_SIZE_METERS) + 1;
    const seen = new Set<number>();
    for (let cellX = minX; cellX <= maxX; cellX++) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ++) {
        this.appendCellCandidates(packCollisionCellKey(cellX, cellZ), seen);
      }
    }
  }

  /**
   * Appends mesh indices from one grid cell into the candidate list.
   *
   * @param cellKey Packed cell key.
   * @param seen Already collected entry indices.
   */
  private appendCellCandidates(cellKey: number, seen: Set<number>): void {
    const bucket = this.cellToEntryIndices.get(cellKey);
    if (!bucket) {
      return;
    }
    for (let index = 0; index < bucket.length; index++) {
      const entryIndex = bucket[index];
      if (entryIndex === undefined || seen.has(entryIndex)) {
        continue;
      }
      seen.add(entryIndex);
      this.candidateIndices.push(entryIndex);
    }
  }

  /**
   * Raycasts one mesh entry using AABB reject then triangle BVH.
   *
   * @param entry Cached mesh entry.
   * @param maxDistance Maximum ray distance.
   * @returns Intersection, or null.
   */
  private raycastMeshEntry(entry: PlayerCollisionMeshEntry, maxDistance: number): THREE.Intersection | null {
    if (!this.scratchRay.intersectBox(entry.worldBox, this.scratchWorldPoint)) {
      return null;
    }
    const boxDistance = this.scratchRay.origin.distanceTo(this.scratchWorldPoint);
    if (boxDistance > maxDistance) {
      return null;
    }
    const bvh = getOrBuildFacePickBvh(entry.mesh);
    if (!bvh) {
      return this.raycastMeshFallback(entry.mesh, maxDistance);
    }
    return this.raycastMeshWithBvh(entry.mesh, bvh, maxDistance);
  }

  /**
   * Raycasts a mesh via the shared face-pick triangle BVH.
   *
   * @param mesh Target mesh.
   * @param bvh Triangle BVH for the mesh geometry.
   * @param maxDistance Maximum world distance.
   * @returns Intersection, or null.
   */
  private raycastMeshWithBvh(mesh: THREE.Mesh, bvh: TriangleBvh, maxDistance: number): THREE.Intersection | null {
    this.scratchInverse.copy(mesh.matrixWorld).invert();
    this.scratchLocalOrigin.copy(this.scratchRay.origin).applyMatrix4(this.scratchInverse);
    this.scratchLocalDirection.copy(this.scratchRay.direction).transformDirection(this.scratchInverse).normalize();
    const localMax = maxDistance * 2;
    const hit = bvh.raycastDoubleSided(this.scratchLocalOrigin, this.scratchLocalDirection, localMax);
    if (!hit) {
      return null;
    }
    this.scratchWorldPoint.copy(hit.point).applyMatrix4(mesh.matrixWorld);
    const worldDistance = this.scratchRay.origin.distanceTo(this.scratchWorldPoint);
    if (worldDistance > maxDistance) {
      return null;
    }
    return {
      distance: worldDistance,
      point: this.scratchWorldPoint.clone(),
      object: mesh,
      face: { normal: hit.localNormal.clone(), a: 0, b: 0, c: 0, materialIndex: 0 },
      faceIndex: hit.faceIndex,
    } as THREE.Intersection;
  }

  /**
   * Falls back to Three.js mesh raycast when a BVH is unavailable.
   *
   * @param mesh Target mesh.
   * @param maxDistance Maximum world distance.
   * @returns Intersection, or null.
   */
  private raycastMeshFallback(mesh: THREE.Mesh, maxDistance: number): THREE.Intersection | null {
    const raycaster = new THREE.Raycaster(this.scratchRay.origin, this.scratchRay.direction, 0, maxDistance);
    const hits = raycaster.intersectObject(mesh, false);
    return hits[0] ?? null;
  }
}

/**
 * Packs XZ grid cell coordinates into a single map key.
 *
 * @param cellX Cell X index.
 * @param cellZ Cell Z index.
 * @returns Packed key.
 */
function packCollisionCellKey(cellX: number, cellZ: number): number {
  return ((cellX + 0x100000) & 0x1fffff) | (((cellZ + 0x100000) & 0x1fffff) << 21);
}
