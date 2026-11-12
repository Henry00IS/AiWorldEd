import * as THREE from 'three';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushGeometryEquality } from '@/solid/brush/solid_brush_geometry_equality.js';
import { BrushShapeFingerprint } from '@/solid/algorithm/spatial/brush_shape_fingerprint.js';
import { SolidCompileCache } from './solid_compile_cache.js';
import type { PreparedBrush, SolidCompileOptions } from './solid_compile_types.js';
import { isSolidBrushMarkedNonConvex } from '@/edit/transform/brush_edit_convexity.js';

/**
 * Transforms visible brush instances into prepared model-space snapshots,
 * reusing cache entries when transforms and operations are unchanged.
 */
export class SolidBrushPreparer {
  private readonly cache: SolidCompileCache;
  private readonly refreshedBrushIds = new Set<string>();

  /**
   * Creates a brush preparer.
   *
   * @param cache Compile cache storing prepared geometry.
   */
  constructor(cache: SolidCompileCache) {
    this.cache = cache;
  }

  /**
   * Returns brush ids refreshed during the most recent prepare pass.
   *
   * @returns Set of refreshed brush ids.
   */
  getRefreshedBrushIds(): ReadonlySet<string> {
    return this.refreshedBrushIds;
  }

  /** Clears the set of brushes refreshed on the last prepare pass. */
  clearRefreshedBrushIds(): void {
    this.refreshedBrushIds.clear();
  }

  /**
   * Transforms visible instances into model-space prepared brushes.
   *
   * @param instances Source instances.
   * @param options Compile options (dirty seeds).
   * @returns Prepared brush list.
   */
  prepareBrushes(instances: SolidBrushInstance[], options: SolidCompileOptions): PreparedBrush[] {
    const dirtySeeds = this.resolveDirtySeeds(options);
    if (dirtySeeds) {
      return this.prepareBrushesPartial(instances, dirtySeeds);
    }
    return this.prepareBrushesFull(instances);
  }

  /**
   * Prepares every visible brush, validating cache reuse for each instance.
   *
   * @param instances Source instances.
   * @returns Prepared brush list.
   */
  private prepareBrushesFull(instances: SolidBrushInstance[]): PreparedBrush[] {
    const prepared: PreparedBrush[] = [];
    for (const instance of instances) {
      if (!instance.visible) {
        continue;
      }
      if (instance.mesh && isSolidBrushMarkedNonConvex(instance.mesh)) {
        continue;
      }
      prepared.push(this.prepareOneBrush(instance, null));
    }
    return prepared;
  }

  /**
   * Prepares only dirty seeds with mesh pulls; reuses cache for other brushes
   * without per-brush pose scans when the evaluation list is partial.
   *
   * @param instances Source instances.
   * @param dirtySeeds Seed dirty ids.
   * @returns Prepared brush list.
   */
  private prepareBrushesPartial(instances: SolidBrushInstance[], dirtySeeds: Set<string>): PreparedBrush[] {
    const prepared: PreparedBrush[] = [];
    for (const instance of instances) {
      if (!instance.visible) {
        continue;
      }
      if (instance.mesh && isSolidBrushMarkedNonConvex(instance.mesh)) {
        continue;
      }
      prepared.push(this.prepareOneBrushPartial(instance, dirtySeeds));
    }
    return prepared;
  }

  /**
   * Prepares one brush on the partial path: dirty seeds always refresh; other
   * brushes reuse cache when local TRS and operation still match the snapshot
   * (cheap, no parent-chain walks).
   *
   * @param instance Source instance.
   * @param dirtySeeds Seed dirty ids.
   * @returns Prepared brush entry.
   */
  private prepareOneBrushPartial(instance: SolidBrushInstance, dirtySeeds: Set<string>): PreparedBrush {
    if (dirtySeeds.has(instance.id)) {
      return this.prepareOneBrush(instance, dirtySeeds);
    }
    if (this.canReusePreparedTransformOnly(instance)) {
      return this.preparedFromCache(instance);
    }
    this.refreshedBrushIds.add(instance.id);
    return this.prepareAndCacheBrush(instance);
  }

  /**
   * Returns whether cached prepared geometry matches the instance local pose
   * and operation without mesh or parent-chain scans.
   *
   * @param instance Brush instance.
   * @returns True when the prepare cache snapshot is still valid.
   */
  private canReusePreparedTransformOnly(instance: SolidBrushInstance): boolean {
    const cached = this.cache.getPrepared(instance.id);
    if (!cached) {
      return false;
    }
    if (cached.operation !== instance.operation) {
      return false;
    }
    if (cached.visible !== instance.visible) {
      return false;
    }
    if (!cached.position.equals(instance.position)) {
      return false;
    }
    if (!this.eulerEquals(cached.rotation, instance.rotation)) {
      return false;
    }
    if (!cached.scale.equals(instance.scale)) {
      return false;
    }
    if ((cached.parentChainPoseKey ?? '') !== instance.getParentChainPoseKey()) {
      return false;
    }
    return true;
  }

  /**
   * Prepares one brush, reusing cached model-space data when still valid.
   * Always pulls the live mesh pose first so inspector or gizmo writes that
   * only updated Object3D transforms cannot leave CSG on a stale prepared
   * snapshot.
   *
   * @param instance Source instance.
   * @param dirtySeeds Seed dirty ids, or null to force re-prepare.
   * @returns Prepared brush entry.
   */
  prepareOneBrush(instance: SolidBrushInstance, dirtySeeds: Set<string> | null): PreparedBrush {
    instance.pullTransformFromMesh();
    const mustRefresh = dirtySeeds === null || dirtySeeds.has(instance.id) || !this.canReusePrepared(instance);
    if (!mustRefresh) {
      return this.preparedFromCache(instance);
    }
    this.refreshedBrushIds.add(instance.id);
    return this.prepareAndCacheBrush(instance);
  }

  /**
   * Returns whether cached prepared geometry still matches the instance.
   * Compares local TRS and parent-chain pose key (so group moves invalidate
   * nested brushes without walking matrixWorld for every brush). Also rejects
   * reuse when the preview mesh pose has drifted ahead of the instance data
   * (inspector and some gizmo paths write the mesh first).
   *
   * @param instance Brush instance.
   * @returns True when cache is reusable.
   */
  canReusePrepared(instance: SolidBrushInstance): boolean {
    const cached = this.cache.getPrepared(instance.id);
    if (!cached) return false;
    if (cached.operation !== instance.operation) return false;
    if (cached.visible !== instance.visible) return false;
    if (!this.instanceMatchesMeshPose(instance)) return false;
    if (!cached.position.equals(instance.position)) return false;
    if (!this.eulerEquals(cached.rotation, instance.rotation)) return false;
    if (!cached.scale.equals(instance.scale)) return false;
    if ((cached.parentChainPoseKey ?? '') !== instance.getParentChainPoseKey()) return false;
    return true;
  }

  /**
   * Returns whether instance local TRS still matches its preview mesh.
   *
   * @param instance Brush instance.
   * @returns False when the mesh pose is ahead of the instance data.
   */
  private instanceMatchesMeshPose(instance: SolidBrushInstance): boolean {
    const mesh = instance.mesh;
    if (!mesh) return true;
    if (!instance.position.equals(mesh.position)) return false;
    if (!this.eulerEquals(instance.rotation, mesh.rotation)) return false;
    if (!instance.scale.equals(mesh.scale)) return false;
    return true;
  }

  /**
   * Builds a prepared entry from the prepare cache.
   *
   * @param instance Brush instance.
   * @returns Prepared brush using cached geometry.
   */
  preparedFromCache(instance: SolidBrushInstance): PreparedBrush {
    const cached = this.cache.getPrepared(instance.id);
    if (!cached) {
      return this.prepareAndCacheBrush(instance);
    }
    return {
      instance,
      brush: cached.brush,
      bounds: cached.bounds,
      overlappingPeerIndices: [],
      operation: instance.operation,
    };
  }

  /**
   * Transforms an instance into model space and stores the prepare cache entry.
   *
   * @param instance Brush instance.
   * @returns Fresh prepared brush.
   */
  prepareAndCacheBrush(instance: SolidBrushInstance): PreparedBrush {
    const brush = instance.getModelSpaceBrush();
    if (this.cachedGeometryIdentical(instance, brush)) {
      this.refreshedBrushIds.delete(instance.id);
      this.cachedPoseUpdate(instance);
      return this.preparedFromCache(instance);
    }
    const bounds = brush.computeLocalBounds();
    this.storePreparedCacheEntry(instance, brush, bounds);
    return {
      instance,
      brush,
      bounds,
      overlappingPeerIndices: [],
      operation: instance.operation,
    };
  }

  /**
   * Copies the current pose of an instance into its cached prepared entry so
   * later transform-only reuse checks match, keeping the cached geometry and
   * bounds objects.
   *
   * @param instance Brush instance whose cached entry is updated.
   */
  private cachedPoseUpdate(instance: SolidBrushInstance): void {
    const cached = this.cache.getPrepared(instance.id);
    if (!cached) {
      return;
    }
    cached.position.copy(instance.position);
    cached.rotation.copy(instance.rotation);
    cached.scale.copy(instance.scale);
    cached.parentChainPoseKey = instance.getParentChainPoseKey();
    cached.shapeFingerprint = BrushShapeFingerprint.fromBrush(instance.brush);
  }

  /**
   * Returns whether the cached prepared entry of a brush was built from
   * geometry bit-identical to a freshly computed model-space brush, with the
   * same operation and visibility.
   *
   * @param instance Brush instance.
   * @param brush Freshly computed model-space brush.
   * @returns True when the cached entry can stand in for the new geometry.
   */
  private cachedGeometryIdentical(instance: SolidBrushInstance, brush: PreparedBrush['brush']): boolean {
    const cached = this.cache.getPrepared(instance.id);
    if (!cached || cached.operation !== instance.operation || cached.visible !== instance.visible) {
      return false;
    }
    return SolidBrushGeometryEquality.equals(cached.brush, brush);
  }

  /**
   * Compares two Euler rotations component-wise.
   *
   * @param a First rotation.
   * @param b Second rotation.
   * @returns True when all components match.
   */
  eulerEquals(a: THREE.Euler, b: THREE.Euler): boolean {
    return a.x === b.x && a.y === b.y && a.z === b.z && a.order === b.order;
  }

  /**
   * Resolves dirty seed set for prepare, or null to force full re-prepare.
   *
   * @param options Compile options.
   * @returns Dirty seed set, or null when every brush must refresh.
   */
  private resolveDirtySeeds(options: SolidCompileOptions): Set<string> | null {
    if (options.forceFull) {
      return null;
    }
    if (!options.dirtyBrushIds) {
      return null;
    }
    return new Set(options.dirtyBrushIds);
  }

  /**
   * Writes a prepared geometry snapshot into the compile cache.
   *
   * @param instance Source instance.
   * @param brush Model-space brush.
   * @param bounds Model-space bounds.
   */
  private storePreparedCacheEntry(
    instance: SolidBrushInstance,
    brush: PreparedBrush['brush'],
    bounds: THREE.Box3,
  ): void {
    this.cache.setPrepared(instance.id, {
      brush,
      bounds,
      operation: instance.operation,
      position: instance.position.clone(),
      rotation: instance.rotation.clone(),
      scale: instance.scale.clone(),
      visible: instance.visible,
      shapeFingerprint: BrushShapeFingerprint.fromBrush(instance.brush),
      parentChainPoseKey: instance.getParentChainPoseKey(),
    });
  }
}
