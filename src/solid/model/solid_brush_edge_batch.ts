import * as THREE from 'three';
import { isSolidModelObject } from './solid_model_keys.js';
import { SolidBrushVisual, SOLID_BRUSH_OPERATION_USERDATA_KEY } from './solid_brush_visual.js';
import { SolidBrushEdgeMaterials, SOLID_BRUSH_EDGE_USERDATA_KEY } from './solid_brush_edge_materials.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierStackDerivedByRoot } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import type { SolidBrushInstance } from './solid_brush_instance.js';

/** UserData flag on merged static brush-edge LineSegments under a solid root. */
export const SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY = 'isSolidBrushEdgeBatch';

/** UserData key storing the CSG operation of a batch line object. */
export const SOLID_BRUSH_EDGE_BATCH_OPERATION_KEY = 'solidBrushEdgeBatchOperation';

/** Name prefix for batch line objects parented under solid roots. */
const BATCH_OBJECT_NAME_PREFIX = 'solid_brush_edge_batch_';

/** Render order for batched static edges (matches per-brush edges). */
const BATCH_EDGE_RENDER_ORDER = 4;

/** Scratch matrix for transforming local edge verts into solid-root space. */
const scratchMatrix = new THREE.Matrix4();

/** Scratch vector for vertex transforms. */
const scratchVertex = new THREE.Vector3();

/**
 * Cached brush edge positions in mesh-local and solid-root space. Solid-space
 * entries stay valid until geometry changes or a structural rebuild.
 */
interface CachedBrushEdges {
  /** Three.js geometry identity used when local edges were extracted. */
  geometryUuid: string;
  /** Flat xyz components in mesh-local space. */
  localPositions: Float32Array;
  /** Solid root uuid the solid-space cache was built against. */
  solidRootUuid: string;
  /**
   * Flat xyz components in solid-root space (null until first solid-space
   * bake).
   */
  solidSpacePositions: Float32Array | null;
}

/**
 * Brushes marked individual by selection. Static batches always include every
 * visible brush, so selection never remounts thousand-brush buffers. Personal
 * edge LineSegments are only kept when a structural rebuild runs while a brush
 * is individual (e.g. transform commit) so live pose edges can track the mesh;
 * idle selection relies on the batch plus the orange selection outline.
 */
const individualMeshes = new Set<THREE.Mesh>();

/**
 * Brushes currently in a live pose transform. They receive personal edges that
 * follow the mesh and are omitted from static batches so wireframes never lag
 * behind gizmo or single-use moves.
 */
const livePoseMeshes = new Set<THREE.Mesh>();

/** Per-mesh edge caches. */
const edgeCache = new WeakMap<THREE.Mesh, CachedBrushEdges>();

/**
 * Solid-space edge positions of brushes that modifiers and generators derive. A
 * reused compile hands back the same instances, so entries stay valid.
 */
const derivedEdgeCache = new WeakMap<SolidBrushInstance, Float32Array | null>();

/**
 * Merges solid-brush wireframes into a few shared LineSegments per solid model
 * (one batch per CSG operation). Idle selection only updates membership
 * tracking — it never remounts static batches. Structural edits call
 * {@link rebuildForSolidRoot} to rebake solid-space poses into the batches.
 */
export class SolidBrushEdgeBatch {
  /**
   * Records which brush meshes are individual for selection tracking. Does not
   * remount static batches and does not attach personal edges on idle select
   * (batches already draw every brush; the orange outline marks selection).
   *
   * @param _worldRoot Unused; kept for call-site compatibility.
   * @param meshes Brush previews treated as individual (usually selection).
   */
  static setIndividualMeshesAndSync(_worldRoot: THREE.Object3D | null, meshes: Iterable<THREE.Mesh>): void {
    const nextIndividuals = this.collectBrushMeshesFromIterable(meshes);
    if (this.areMeshSetsEqual(individualMeshes, nextIndividuals)) {
      return;
    }
    const leaving = this.collectMeshesLeavingSet(individualMeshes, nextIndividuals);
    this.replaceIndividualMeshes(nextIndividuals);
    this.stripPersonalEdges(leaving);
  }

  /**
   * Rebuilds static edge batches for every solid model under a root.
   *
   * @param worldRoot World or solid ancestor to scan.
   */
  static syncUnder(worldRoot: THREE.Object3D): void {
    worldRoot.traverse((object) => {
      if (!(object instanceof THREE.Group)) return;
      if (!isSolidModelObject(object)) return;
      this.rebuildForSolidRoot(object);
    });
  }

  /**
   * Rebuilds static edge batches for one solid model root (structural edits or
   * transform commits). Rebakes solid-space poses for every visible brush and
   * keeps personal edges on currently individual meshes.
   *
   * @param solidRoot Solid model root.
   */
  static rebuildForSolidRoot(solidRoot: THREE.Group): void {
    const brushes = this.collectBrushMeshes(solidRoot);
    for (const mesh of brushes) {
      this.syncLocalEdgesForStructuralRebuild(mesh);
      this.invalidateSolidSpaceCache(mesh);
    }
    this.rebuildBatchGeometryForSolid(solidRoot, brushes);
  }

  /**
   * Returns whether a mesh is marked individual by the current selection set.
   *
   * @param mesh Brush preview mesh.
   * @returns True when the mesh is in the individual set.
   */
  static isIndividual(mesh: THREE.Mesh): boolean {
    return individualMeshes.has(mesh);
  }

  /**
   * Starts live pose tracking for brushes being transformed. Attaches personal
   * edges and rebuilds static batches only when membership changes (first
   * sample of a drag), omitting live brushes so wireframes cannot lag. Later
   * samples only ensure personal edges — personal LineSegments follow the mesh
   * matrix without rebaking the whole solid.
   *
   * @param meshes Brush or other meshes involved in the live transform.
   */
  static beginLivePoseTracking(meshes: Iterable<THREE.Mesh>): void {
    const solidRoots = new Set<THREE.Group>();
    let membershipChanged = false;
    for (const mesh of meshes) {
      if (!SolidBrushVisual.isBrushObject(mesh)) {
        continue;
      }
      if (!livePoseMeshes.has(mesh)) {
        livePoseMeshes.add(mesh);
        membershipChanged = true;
      }
      SolidBrushVisual.ensureLocalEdges(mesh);
      const solidRoot = this.findSolidRoot(mesh);
      if (solidRoot) {
        solidRoots.add(solidRoot);
      }
    }
    if (!membershipChanged) {
      return;
    }
    for (const solidRoot of solidRoots) {
      this.rebuildForSolidRoot(solidRoot);
    }
  }

  /**
   * Ends live pose tracking after transform commit or cancel. Rebuilds static
   * batches at the final poses; personal edges remain only for individual
   * selection brushes.
   */
  static endLivePoseTracking(): void {
    if (livePoseMeshes.size === 0) {
      return;
    }
    const solidRoots = new Set<THREE.Group>();
    for (const mesh of livePoseMeshes) {
      const solidRoot = this.findSolidRoot(mesh);
      if (solidRoot) {
        solidRoots.add(solidRoot);
      }
    }
    livePoseMeshes.clear();
    for (const solidRoot of solidRoots) {
      this.rebuildForSolidRoot(solidRoot);
    }
  }

  /**
   * Drops all cached edges for a brush (tests / geometry replacement helpers).
   *
   * @param mesh Brush preview mesh.
   */
  static invalidateLocalEdgeCache(mesh: THREE.Mesh): void {
    edgeCache.delete(mesh);
  }

  /**
   * Collects solid brush meshes from an arbitrary iterable.
   *
   * @param meshes Candidate objects.
   * @returns Set of brush preview meshes.
   */
  private static collectBrushMeshesFromIterable(meshes: Iterable<THREE.Mesh>): Set<THREE.Mesh> {
    const result = new Set<THREE.Mesh>();
    for (const mesh of meshes) {
      if (SolidBrushVisual.isBrushObject(mesh)) {
        result.add(mesh);
      }
    }
    return result;
  }

  /**
   * Returns whether two mesh sets contain the same membership.
   *
   * @param left First set.
   * @param right Second set.
   * @returns True when both sets have identical mesh membership.
   */
  private static areMeshSetsEqual(left: Set<THREE.Mesh>, right: Set<THREE.Mesh>): boolean {
    if (left.size !== right.size) return false;
    for (const mesh of left) {
      if (!right.has(mesh)) return false;
    }
    return true;
  }

  /**
   * Collects meshes present in previous but absent from next.
   *
   * @param previous Previous membership.
   * @param next Next membership.
   * @returns Meshes that left the set.
   */
  private static collectMeshesLeavingSet(previous: Set<THREE.Mesh>, next: Set<THREE.Mesh>): THREE.Mesh[] {
    const leaving: THREE.Mesh[] = [];
    for (const mesh of previous) {
      if (!next.has(mesh)) leaving.push(mesh);
    }
    return leaving;
  }

  /**
   * Replaces the global individual-mesh set with the given membership.
   *
   * @param nextIndividuals Next individual brushes.
   */
  private static replaceIndividualMeshes(nextIndividuals: Set<THREE.Mesh>): void {
    individualMeshes.clear();
    nextIndividuals.forEach((mesh) => individualMeshes.add(mesh));
  }

  /**
   * Strips personal edge LineSegments from brushes leaving the individual set.
   *
   * @param leaving Meshes that left the individual set.
   */
  private static stripPersonalEdges(leaving: THREE.Mesh[]): void {
    for (const mesh of leaving) {
      if (SolidBrushVisual.hasLocalEdges(mesh)) {
        SolidBrushVisual.stripLocalEdges(mesh);
      }
    }
  }

  /**
   * Ensures or strips personal edges during a full structural rebuild.
   *
   * @param mesh Brush preview mesh.
   */
  private static syncLocalEdgesForStructuralRebuild(mesh: THREE.Mesh): void {
    if (individualMeshes.has(mesh) || livePoseMeshes.has(mesh)) {
      SolidBrushVisual.ensureLocalEdges(mesh);
      return;
    }
    if (SolidBrushVisual.hasLocalEdges(mesh)) {
      SolidBrushVisual.stripLocalEdges(mesh);
    }
  }

  /**
   * Walks parents to find the solid model root for a brush mesh.
   *
   * @param mesh Brush preview mesh.
   * @returns Solid root group, or null when not under a solid model.
   */
  private static findSolidRoot(mesh: THREE.Mesh): THREE.Group | null {
    let current: THREE.Object3D | null = mesh.parent;
    while (current) {
      if (current instanceof THREE.Group && isSolidModelObject(current)) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * Clears the solid-space portion of a brush cache.
   *
   * @param mesh Brush preview mesh.
   */
  private static invalidateSolidSpaceCache(mesh: THREE.Mesh): void {
    const cache = edgeCache.get(mesh);
    if (!cache) return;
    cache.solidSpacePositions = null;
    cache.solidRootUuid = '';
  }

  /**
   * Collects solid brush preview meshes under a solid root.
   *
   * @param solidRoot Solid model root.
   * @returns Brush meshes.
   */
  private static collectBrushMeshes(solidRoot: THREE.Group): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    solidRoot.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!SolidBrushVisual.isBrushObject(object)) return;
      meshes.push(object);
    });
    return meshes;
  }

  /**
   * Builds operation batches for a solid from every visible brush, including
   * brushes currently marked individual by selection.
   *
   * @param solidRoot Solid model root.
   * @param brushes Brush meshes under the solid.
   */
  /**
   * Solid root whose world matrices were refreshed for the current batch
   * rebuild.
   */
  private static freshMatrixRoot: THREE.Group | null = null;
  private static rebuildBatchGeometryForSolid(solidRoot: THREE.Group, brushes: readonly THREE.Mesh[]): void {
    // Refresh the solid subtree's world matrices once per rebuild instead of
    // once per brush (each call walks the whole subtree: O(brushes^2)).
    solidRoot.updateMatrixWorld(false);
    this.freshMatrixRoot = solidRoot;
    let chunksByOperation;
    try {
      chunksByOperation = this.collectSolidSpaceChunks(solidRoot, brushes);
    } finally {
      this.freshMatrixRoot = null;
    }
    this.applyBatchChunksToSolidRoot(solidRoot, chunksByOperation);
  }

  /**
   * Gathers solid-space edge arrays keyed by CSG operation for all visible
   * brushes under the solid.
   *
   * @param solidRoot Solid model root.
   * @param brushes Brush meshes under the solid.
   * @returns Operation to list of solid-space position arrays.
   */
  private static collectSolidSpaceChunks(
    solidRoot: THREE.Group,
    brushes: readonly THREE.Mesh[],
  ): Map<SolidOperation, Float32Array[]> {
    const chunksByOperation = new Map<SolidOperation, Float32Array[]>();
    for (const mesh of brushes) {
      if (!mesh.visible) {
        continue;
      }
      if (livePoseMeshes.has(mesh)) {
        continue;
      }
      const solidSpace = this.getOrBuildSolidSpacePositions(mesh, solidRoot);
      if (!solidSpace || solidSpace.length < 6) {
        continue;
      }
      this.appendChunk(chunksByOperation, this.readOperation(mesh), solidSpace);
    }
    this.collectDerivedBrushChunks(solidRoot, chunksByOperation);
    return chunksByOperation;
  }

  /**
   * Adds the edges of every visible brush that the last compile of a solid
   * derived from modifiers and generators. They have no scene mesh, so without
   * this the orthographic views would not draw them at all.
   *
   * @param solidRoot Solid model root.
   * @param chunksByOperation Operation buckets to append to.
   */
  private static collectDerivedBrushChunks(
    solidRoot: THREE.Group,
    chunksByOperation: Map<SolidOperation, Float32Array[]>,
  ): void {
    for (const brush of modifierStackDerivedByRoot.get(solidRoot)?.values() ?? []) {
      if (!brush.visible) continue;
      const solidSpace = this.getOrBuildDerivedBrushPositions(brush);
      if (solidSpace && solidSpace.length >= 6) this.appendChunk(chunksByOperation, brush.operation, solidSpace);
    }
  }

  /**
   * Returns the solid-space edge positions of a derived brush from cache or a
   * fresh bake of its model-space hull.
   *
   * @param brush Derived brush instance.
   * @returns Solid-space positions, or null when empty.
   */
  private static getOrBuildDerivedBrushPositions(brush: SolidBrushInstance): Float32Array | null {
    const cached = derivedEdgeCache.get(brush);
    if (cached !== undefined) return cached;
    const hull = SolidBrushVisual.buildHullGeometry(brush.getModelSpaceBrush());
    const positions = this.extractLocalEdgePositions(hull);
    hull.dispose();
    derivedEdgeCache.set(brush, positions);
    return positions;
  }

  /**
   * Pushes one solid-space chunk into an operation bucket.
   *
   * @param chunksByOperation Operation buckets.
   * @param operation CSG operation.
   * @param solidSpace Solid-space edge positions.
   */
  private static appendChunk(
    chunksByOperation: Map<SolidOperation, Float32Array[]>,
    operation: SolidOperation,
    solidSpace: Float32Array,
  ): void {
    const bucket = chunksByOperation.get(operation);
    if (bucket) {
      bucket.push(solidSpace);
      return;
    }
    chunksByOperation.set(operation, [solidSpace]);
  }

  /**
   * Returns solid-root-space edge positions from cache or a fresh bake.
   *
   * @param mesh Brush preview mesh.
   * @param solidRoot Solid model root.
   * @returns Solid-space positions, or null when empty.
   */
  private static getOrBuildSolidSpacePositions(mesh: THREE.Mesh, solidRoot: THREE.Group): Float32Array | null {
    const cache = this.getOrBuildLocalEdgeCache(mesh);
    if (!cache) return null;
    if (cache.solidSpacePositions && cache.solidRootUuid === solidRoot.uuid) {
      return cache.solidSpacePositions;
    }
    this.computeRelativeMatrix(mesh, solidRoot, scratchMatrix);
    const solidSpace = this.transformLocalEdgesToSolidSpace(cache.localPositions, scratchMatrix);
    cache.solidRootUuid = solidRoot.uuid;
    cache.solidSpacePositions = solidSpace;
    return solidSpace;
  }

  /**
   * Ensures the local-edge portion of the cache exists for a mesh.
   *
   * @param mesh Brush preview mesh.
   * @returns Cache entry, or null when geometry has no edges.
   */
  private static getOrBuildLocalEdgeCache(mesh: THREE.Mesh): CachedBrushEdges | null {
    const geometry = mesh.geometry;
    const existing = edgeCache.get(mesh);
    if (existing && existing.geometryUuid === geometry.uuid) {
      return existing;
    }
    const localPositions = this.extractLocalEdgePositions(geometry);
    if (!localPositions) {
      edgeCache.delete(mesh);
      return null;
    }
    const cache: CachedBrushEdges = {
      geometryUuid: geometry.uuid,
      localPositions,
      solidRootUuid: '',
      solidSpacePositions: null,
    };
    edgeCache.set(mesh, cache);
    return cache;
  }

  /**
   * Extracts edge segment positions from a mesh geometry in local space.
   *
   * @param geometry Brush mesh geometry.
   * @returns Flat xyz Float32Array, or null when empty.
   */
  private static extractLocalEdgePositions(geometry: THREE.BufferGeometry): Float32Array | null {
    const edges = new THREE.EdgesGeometry(geometry, 1);
    const attribute = edges.getAttribute('position');
    if (!attribute || attribute.count < 2) {
      edges.dispose();
      return null;
    }
    const localPositions = this.copyAttributeToFloat32(attribute);
    edges.dispose();
    return localPositions;
  }

  /**
   * Copies a buffer attribute into a dense Float32Array.
   *
   * @param attribute Source position attribute.
   * @returns Flat xyz components.
   */
  private static copyAttributeToFloat32(
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  ): Float32Array {
    const localPositions = new Float32Array(attribute.count * 3);
    for (let index = 0; index < attribute.count; index += 1) {
      localPositions[index * 3] = attribute.getX(index);
      localPositions[index * 3 + 1] = attribute.getY(index);
      localPositions[index * 3 + 2] = attribute.getZ(index);
    }
    return localPositions;
  }

  /**
   * Writes solidRoot^-1 * mesh.matrixWorld into the target matrix.
   *
   * @param mesh Brush preview mesh.
   * @param solidRoot Solid model root.
   * @param target Output matrix.
   */
  private static computeRelativeMatrix(mesh: THREE.Mesh, solidRoot: THREE.Group, target: THREE.Matrix4): void {
    if (this.freshMatrixRoot !== solidRoot) {
      mesh.updateMatrixWorld(false);
      solidRoot.updateMatrixWorld(false);
    }
    target.copy(solidRoot.matrixWorld).invert().multiply(mesh.matrixWorld);
  }

  /**
   * Transforms local edge positions by a relative matrix into a new array.
   *
   * @param localPositions Mesh-local edge positions.
   * @param relativeMatrix SolidRoot^-1 * mesh.matrixWorld.
   * @returns Solid-space edge positions.
   */
  private static transformLocalEdgesToSolidSpace(
    localPositions: Float32Array,
    relativeMatrix: THREE.Matrix4,
  ): Float32Array {
    const solidSpace = new Float32Array(localPositions.length);
    for (let index = 0; index < localPositions.length; index += 3) {
      scratchVertex
        .set(localPositions[index]!, localPositions[index + 1]!, localPositions[index + 2]!)
        .applyMatrix4(relativeMatrix);
      solidSpace[index] = scratchVertex.x;
      solidSpace[index + 1] = scratchVertex.y;
      solidSpace[index + 2] = scratchVertex.z;
    }
    return solidSpace;
  }

  /**
   * Creates or updates batch LineSegments from solid-space chunks.
   *
   * @param solidRoot Solid model root.
   * @param chunksByOperation Edge chunks keyed by CSG operation.
   */
  private static applyBatchChunksToSolidRoot(
    solidRoot: THREE.Group,
    chunksByOperation: Map<SolidOperation, Float32Array[]>,
  ): void {
    const remaining = new Set(this.listExistingBatches(solidRoot));
    for (const operation of [SolidOperation.Additive, SolidOperation.Subtractive, SolidOperation.Intersecting]) {
      this.applyOneOperationBatch(solidRoot, operation, chunksByOperation, remaining);
    }
    remaining.forEach((batch) => {
      solidRoot.remove(batch);
      batch.geometry.dispose();
    });
  }

  /**
   * Updates or removes the batch for a single CSG operation under a solid.
   *
   * @param solidRoot Solid model root.
   * @param operation CSG operation bucket.
   * @param chunksByOperation Edge chunks keyed by operation.
   * @param remaining Existing batches not yet claimed this rebuild.
   */
  private static applyOneOperationBatch(
    solidRoot: THREE.Group,
    operation: SolidOperation,
    chunksByOperation: Map<SolidOperation, Float32Array[]>,
    remaining: Set<THREE.LineSegments>,
  ): void {
    const chunks = chunksByOperation.get(operation);
    if (!chunks || chunks.length === 0) return;
    const positions = this.concatFloat32Chunks(chunks);
    if (positions.length < 6) return;
    const batch = this.getOrCreateBatch(solidRoot, operation);
    remaining.delete(batch);
    this.writeBatchGeometry(batch, positions);
    batch.visible = true;
  }

  /**
   * Concatenates solid-space edge chunks into one dense buffer.
   *
   * @param chunks Per-brush solid-space arrays.
   * @returns Single flat xyz buffer.
   */
  private static concatFloat32Chunks(chunks: readonly Float32Array[]): Float32Array {
    let totalLength = 0;
    for (const chunk of chunks) {
      totalLength += chunk.length;
    }
    const output = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }

  /**
   * Lists existing batch line objects under a solid root.
   *
   * @param solidRoot Solid model root.
   * @returns Batch LineSegments.
   */
  private static listExistingBatches(solidRoot: THREE.Group): THREE.LineSegments[] {
    return solidRoot.children.filter(
      (child): child is THREE.LineSegments =>
        child instanceof THREE.LineSegments && child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true,
    );
  }

  /**
   * Returns the batch line object for an operation, creating it when needed.
   *
   * @param solidRoot Solid model root.
   * @param operation CSG operation.
   * @returns Batch line segments.
   */
  private static getOrCreateBatch(solidRoot: THREE.Group, operation: SolidOperation): THREE.LineSegments {
    const existing = this.listExistingBatches(solidRoot).find(
      (batch) => batch.userData[SOLID_BRUSH_EDGE_BATCH_OPERATION_KEY] === operation,
    );
    if (existing) return existing;
    return this.createBatchLine(solidRoot, operation);
  }

  /**
   * Creates and parents a new empty batch LineSegments for an operation.
   *
   * @param solidRoot Solid model root.
   * @param operation CSG operation.
   * @returns New batch line object.
   */
  private static createBatchLine(solidRoot: THREE.Group, operation: SolidOperation): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    const lines = new THREE.LineSegments(geometry, SolidBrushEdgeMaterials.getFrontMaterial(operation));
    lines.name = `${BATCH_OBJECT_NAME_PREFIX}${operation}`;
    lines.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] = true;
    lines.userData[SOLID_BRUSH_EDGE_BATCH_OPERATION_KEY] = operation;
    lines.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] = true;
    lines.renderOrder = BATCH_EDGE_RENDER_ORDER;
    lines.frustumCulled = true;
    solidRoot.add(lines);
    return lines;
  }

  /**
   * Writes batch positions, reusing the existing GPU buffer when the length is
   * unchanged.
   *
   * @param batch Batch line object.
   * @param positions Flat xyz component list (two verts per segment).
   */
  private static writeBatchGeometry(batch: THREE.LineSegments, positions: Float32Array): void {
    if (this.tryWriteBatchGeometryInPlace(batch, positions)) {
      return;
    }
    this.replaceBatchGeometry(batch, positions);
  }

  /**
   * Copies positions into the existing buffer attribute when sizes match.
   *
   * @param batch Batch line object.
   * @param positions New solid-space positions.
   * @returns True when the existing buffer was updated in place.
   */
  private static tryWriteBatchGeometryInPlace(batch: THREE.LineSegments, positions: Float32Array): boolean {
    const attribute = batch.geometry.getAttribute('position');
    if (!(attribute instanceof THREE.BufferAttribute)) return false;
    if (!(attribute.array instanceof Float32Array)) return false;
    if (attribute.array.length !== positions.length) return false;
    attribute.array.set(positions);
    attribute.needsUpdate = true;
    batch.geometry.computeBoundingSphere();
    return true;
  }

  /**
   * Replaces batch geometry with a newly allocated position buffer.
   *
   * @param batch Batch line object.
   * @param positions Flat xyz component list (two verts per segment).
   */
  private static replaceBatchGeometry(batch: THREE.LineSegments, positions: Float32Array): void {
    const previous = batch.geometry;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    batch.geometry = geometry;
    previous.dispose();
  }

  /**
   * Reads the CSG operation stored on a brush mesh.
   *
   * @param mesh Brush preview mesh.
   * @returns Solid operation.
   */
  private static readOperation(mesh: THREE.Mesh): SolidOperation {
    const value = mesh.userData[SOLID_BRUSH_OPERATION_USERDATA_KEY];
    if (value === SolidOperation.Subtractive) return SolidOperation.Subtractive;
    if (value === SolidOperation.Intersecting) return SolidOperation.Intersecting;
    return SolidOperation.Additive;
  }
}
