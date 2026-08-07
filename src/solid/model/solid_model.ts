import * as THREE from 'three';
import { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushInstance } from './solid_brush_instance.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { NotificationGlobal } from '@/audio/notification/notification_global.js';
import { SolidBrushVisual } from './solid_brush_visual.js';
import { FaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import {
  SOLID_MODEL_USERDATA_KEY,
  SOLID_TRIANGLE_SOURCES_USERDATA_KEY,
  isSolidModelObject as isSolidModelObjectKey,
  isResultMesh as isResultMeshKey,
} from './solid_model_keys.js';
import { SolidModelRegistry } from './solid_model_registry.js';
import { SolidBrushCollection } from './solid_brush_collection.js';
import { SolidModelPresentation, type BrushUvSnapshot } from './solid_model_presentation.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { SolidModelRebuildPipeline } from './solid_model_rebuild_pipeline.js';
import { disposeBrushPreviewResources } from './solid_model_mesh_disposal.js';
import { SolidBrushEdgeBatch } from './solid_brush_edge_batch.js';
import {
  pullAllBrushTransforms,
  pullChangedBrushTransforms,
  pullLiveBrushTransform,
  pullTransformIfChanged,
  sameBrushOrder,
} from './solid_brush_transform_sync.js';
import type { SolidBrushTextureLockBaseline } from '@/texture/lock/solid_brush_texture_lock.js';
import { normalizeTextureLockFlags, type TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';
import {
  collectBrushIdsForTriangles,
  writeMapEntryToBrushFaces,
  type SolidTriangleSource,
} from './solid_model_authored_uv.js';
import * as solidOps from './solid_model_ops.js';
import type { SolidModelOpsHost } from './solid_model_ops.js';
import { findSolidModelRoot, isSolidCsgGroup, isValidSolidTreeParent } from './solid_group.js';
import { brushRemovalExecute } from './solid_brush_removal_dirty.js';
import {
  hierarchyMutationRefreshFromRoots,
  hierarchyMutationRefreshOnHost,
} from './hierarchy/solid_hierarchy_mutation_refresh.js';
import { hierarchySeedBrushIdsCollectUnder } from './hierarchy/solid_hierarchy_seed_collector.js';

export {
  SOLID_MODEL_USERDATA_KEY,
  SOLID_MODEL_RESULT_USERDATA_KEY,
  SOLID_TRIANGLE_SOURCES_USERDATA_KEY,
} from './solid_model_keys.js';

/**
 * A hierarchical solid model: group root, selectable brush children, and a
 * textured compiled result mesh rebuilt via ordered solid CSG.
 */
export class SolidModel {
  readonly root: THREE.Group;
  private resultMesh: THREE.Mesh;
  private readonly brushes: SolidBrushCollection;
  private readonly pipeline: SolidModelRebuildPipeline;
  private readonly presentation = new SolidModelPresentation();
  /** Per-brush texture lock baselines for the active interactive drag. */
  private readonly textureLockBaselines = new Map<string, SolidBrushTextureLockBaseline>();
  /**
   * Creates a solid model group ready for the scene hierarchy.
   *
   * @param name Optional display name.
   */
  constructor(name?: string) {
    this.root = new THREE.Group();
    this.root.name = this.resolveSolidRootDisplayName(name);
    this.root.userData[SOLID_MODEL_USERDATA_KEY] = true;
    SolidModelRegistry.register(this.root, this);
    this.brushes = new SolidBrushCollection(this.root);
    this.pipeline = new SolidModelRebuildPipeline({
      getResultMesh: () => this.resultMesh,
      findBrush: (id) => this.brushes.findBrush(id),
      getEvaluationList: () => this.brushes.getEvaluationList(),
      syncBrushOrderFromScene: () => this.brushes.syncBrushOrderFromScene(),
    });
    this.resultMesh = this.presentation.createResultMesh();
    this.root.add(this.resultMesh);
  }

  /**
   * Resolves the solid root display name. Explicit names (load, import, API)
   * are preserved and registered; omitted names allocate SolidModel.xxx.
   *
   * @param name Optional constructor name.
   * @returns Hierarchy display name.
   */
  private resolveSolidRootDisplayName(name?: string): string {
    if (name !== undefined && name !== '') {
      hierarchyNameAllocator.noteExistingName(name);
      return name;
    }
    return hierarchyNameAllocator.allocate('SolidModel');
  }

  /**
   * Sets whether interactive UV stick mode is active (legacy). Solid UVs always
   * bake in world space; stick is applied by updating face mappings on
   * transform using position/stretch locks. Flag-only — no remesh or
   * conversion.
   *
   * @param enabled True when either lock is considered on for bake hints.
   */
  setUvStickToBrush(enabled: boolean): void {
    this.pipeline.setUvStickToBrush(enabled);
  }

  /**
   * Returns whether this solid uses inverted-world CSG (starts solid).
   *
   * @returns True when subtractive brushes carve rooms from a full world.
   */
  isInvertedWorld(): boolean {
    return this.pipeline.isInvertedWorld();
  }

  /**
   * Enables or disables inverted-world CSG and rebuilds the solid.
   *
   * @param enabled True for inverted (carved rooms) workflow.
   */
  setInvertedWorld(enabled: boolean): void {
    if (this.pipeline.isInvertedWorld() === enabled) return;
    this.pipeline.setInvertedWorld(enabled);
    this.rebuild(true);
  }

  /**
   * Returns the compiled result mesh.
   *
   * @returns Compiled result mesh.
   */
  get mesh(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Returns whether an object is a solid model root group. Brush meshes and the
   * result mesh do not match.
   *
   * @param object Candidate scene object.
   * @returns True only when the object itself is a solid model root.
   */
  static isSolidModelObject(object: THREE.Object3D): boolean {
    return isSolidModelObjectKey(object);
  }

  /**
   * Returns whether an object is the compiled result mesh of a solid model.
   *
   * @param object Candidate object.
   * @returns True for result meshes.
   */
  static isResultMesh(object: THREE.Object3D): boolean {
    return isResultMeshKey(object);
  }

  /**
   * Resolves the SolidModel for a root, brush, or result object.
   *
   * @param object Candidate object.
   * @returns SolidModel or null.
   */
  static fromObject(object: THREE.Object3D): SolidModel | null {
    return SolidModelRegistry.fromObject(object);
  }

  /**
   * Resyncs brush order from the scene graph and fully rebuilds every solid
   * under a root.
   *
   * @param root Scene or world root to scan.
   */
  static rebuildAllUnder(root: THREE.Object3D): void {
    for (const model of SolidModelRegistry.collectUnder(root)) {
      model.syncBrushOrderFromScene();
      model.markDirty();
      model.rebuild(true);
    }
  }

  /**
   * After undo/redo: only recompile solids that actually changed. Transform
   * undos use partial CSG; brush-order changes force a full model rebuild.
   * Texture-only undos that already remeshed presentation are left alone.
   *
   * @param root Scene or world root to scan.
   */
  static refreshAfterHistoryChange(root: THREE.Object3D): void {
    for (const model of SolidModelRegistry.collectUnder(root)) {
      model.refreshAfterHistoryChange();
    }
  }

  /**
   * Syncs mesh poses / brush order after an external edit (undo, redo). Full
   * rebuild only when evaluation order changed; otherwise partial CSG.
   */
  refreshAfterHistoryChange(): void {
    const previousOrder = this.pipeline.getLastBrushOrder();
    this.syncBrushOrderFromScene();
    if (!sameBrushOrder(previousOrder, this.brushes.getEvaluationList())) {
      this.markDirty();
      this.rebuild(true);
      return;
    }
    solidOps.rebuildChangedHistoryTransforms(this.getOpsHost());
  }

  /**
   * Returns brush instances in tree order.
   *
   * @returns Brush list copy.
   */
  getBrushes(): SolidBrushInstance[] {
    return this.brushes.getBrushes();
  }

  /**
   * Returns the number of brushes.
   *
   * @returns Brush count.
   */
  getBrushCount(): number {
    return this.brushes.getBrushCount();
  }

  /**
   * Finds a brush by id.
   *
   * @param id Brush id.
   * @returns Brush or undefined.
   */
  findBrush(id: string): SolidBrushInstance | undefined {
    return this.brushes.findBrush(id);
  }

  /**
   * Finds a brush by its scene mesh.
   *
   * @param mesh Candidate mesh.
   * @returns Brush or undefined.
   */
  findBrushByMesh(mesh: THREE.Object3D): SolidBrushInstance | undefined {
    return this.brushes.findBrushByMesh(mesh);
  }

  /**
   * Returns the compiled result mesh.
   *
   * @returns Result mesh.
   */
  getResultMesh(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Adds a centered box brush as a selectable child mesh and rebuilds.
   *
   * @param size Cube edge length.
   * @param operation CSG operation.
   * @param parent Optional solid root or solid CSG group to append under.
   *   Defaults to the solid root when omitted or invalid.
   * @param rebuildAfter When false, defers CSG so the caller can pose the brush
   *   first (avoids a wasteful origin compile before spawn offset).
   * @returns Created brush instance.
   */
  addBoxBrush(
    size: number = 1,
    operation: SolidOperation = SolidOperation.Additive,
    parent: THREE.Object3D | null = null,
    rebuildAfter: boolean = true,
  ): SolidBrushInstance {
    this.brushes.nextBrushCounter();
    const name = hierarchyNameAllocator.allocate('Brush');
    const brush = SolidBrushFactory.createCenteredBox(size, size, size);
    const instance = new SolidBrushInstance(this.brushes.allocateBrushId(), name, brush, operation);
    const preview = SolidBrushVisual.createBoxPreview(name, size, operation);
    instance.attachMesh(preview);
    const targetParent = this.resolveBrushInsertParent(parent);
    targetParent.add(preview);
    this.brushes.appendPreparedBrush(instance);
    this.syncBrushOrderFromScene();
    this.markBrushesDirty([instance.id]);
    if (rebuildAfter) {
      this.rebuild();
    }
    return instance;
  }

  /**
   * Chooses a valid hierarchy parent for a new brush under this solid.
   *
   * @param parent Requested parent, or null for the solid root.
   * @returns Solid root or solid CSG group under this model.
   */
  resolveBrushInsertParent(parent: THREE.Object3D | null): THREE.Object3D {
    if (!parent) return this.root;
    if (isValidSolidTreeParent(this.root, parent, this.root)) {
      return parent;
    }
    return this.root;
  }

  /**
   * Prepares a hull-preview brush from convex topology without adding it to the
   * model.
   *
   * @param brush Centered local convex topology.
   * @param operation CSG operation for the new brush.
   * @param localPosition Model-local placement for the brush origin.
   * @param textureId Optional default surface texture identity.
   * @returns Configured instance not yet registered on this model.
   */
  prepareTopologyBrush(
    brush: SolidBrush,
    operation: SolidOperation,
    localPosition: THREE.Vector3,
    textureId?: string,
  ): SolidBrushInstance {
    this.brushes.nextBrushCounter();
    const name = hierarchyNameAllocator.allocate('Brush');
    const instance = new SolidBrushInstance(this.brushes.allocateBrushId(), name, brush, operation);
    instance.position.copy(localPosition);
    if (textureId) {
      instance.setAllFacesTextureId(textureId);
    }
    const preview = SolidBrushVisual.createHullPreview(name, brush, operation);
    instance.attachMesh(preview);
    return instance;
  }

  /**
   * Adds a prebuilt brush instance, creating a preview mesh when missing.
   *
   * @param instance Brush instance to own.
   * @param previewSize Size used when creating a default box preview.
   */
  addBrushInstance(instance: SolidBrushInstance, previewSize: number = 2): void {
    this.brushes.registerBrushAt(instance, this.brushes.getBrushCount(), previewSize);
    this.markBrushesDirty([instance.id]);
    this.rebuild();
  }

  /**
   * Adds many brush instances and optionally performs a single CSG rebuild.
   *
   * @param instances Brush instances to own (previews attached when missing).
   * @param previewSize Fallback box size when an instance has no mesh.
   * @param rebuild When true, recompiles the result mesh once after all
   *   inserts.
   */
  addBrushInstancesBatch(instances: SolidBrushInstance[], previewSize: number = 2, rebuild: boolean = true): void {
    for (const instance of instances) {
      this.brushes.registerBrushAt(instance, this.brushes.getBrushCount(), previewSize);
    }
    this.markDirty();
    if (rebuild) {
      this.rebuild(true);
    }
  }

  /**
   * Inserts a brush at a list index and restores sibling order for CSG.
   *
   * @param instance Brush instance to own.
   * @param listIndex Index in the brush evaluation list.
   * @param previewSize Size used when creating a default box preview.
   * @param hierarchy Optional nested parent placement; skips root brush
   *   reorder.
   * @param rebuildAfter When false, only registers the brush and marks it dirty
   *   so callers can batch a single compile.
   */
  insertBrushInstance(
    instance: SolidBrushInstance,
    listIndex: number,
    previewSize: number = 2,
    hierarchy?: { parent: THREE.Object3D; siblingIndex: number },
    rebuildAfter: boolean = true,
  ): void {
    this.brushes.registerBrushAt(instance, listIndex, previewSize, hierarchy);
    this.markBrushesDirty([instance.id]);
    if (rebuildAfter) {
      this.rebuild();
    }
  }

  /**
   * Removes a brush, marks partial CSG seeds, and optionally rebuilds.
   *
   * @param id Brush id.
   * @param disposeResources When true, disposes preview GPU resources.
   * @param rebuildAfter When false, defers rebuild for batched removals.
   * @returns True when removed.
   */
  removeBrush(id: string, disposeResources: boolean = true, rebuildAfter: boolean = true): boolean {
    return brushRemovalExecute(this.getOpsHost(), this.pipeline, this.brushes, id, disposeResources, rebuildAfter);
  }

  /**
   * Partial CSG after hierarchy edits for this solid (seeds + touch peers).
   *
   * @param seedBrushIds Brushes whose hierarchy role changed.
   */
  hierarchyMutationRefresh(seedBrushIds: readonly string[]): void {
    hierarchyMutationRefreshOnHost(this.getOpsHost(), seedBrushIds);
  }

  /**
   * Partial CSG for solids that own the given hierarchy roots only.
   *
   * @param seedRoots Hierarchy nodes that moved, grouped, or ungrouped.
   */
  static hierarchyMutationRefreshFromRoots(seedRoots: readonly THREE.Object3D[]): void {
    hierarchyMutationRefreshFromRoots(seedRoots);
  }

  /**
   * Collects owned brush ids under a hierarchy root.
   *
   * @param root Hierarchy node to scan.
   * @returns Brush instance ids under the root.
   */
  hierarchyBrushIdsCollectUnder(root: THREE.Object3D): string[] {
    return hierarchySeedBrushIdsCollectUnder(this, root);
  }

  /**
   * Disposes GPU resources for a brush preview mesh (history drop / permanent
   * delete).
   *
   * @param mesh Brush preview mesh.
   */
  disposeBrushMeshResources(mesh: THREE.Mesh): void {
    disposeBrushPreviewResources(mesh);
  }

  /**
   * Updates a brush operation, restyles its preview, and rebuilds. Uses partial
   * CSG (seed + touch peers only), never a full-map force rebuild.
   *
   * @param id Brush id.
   * @param operation New operation.
   * @returns True when found.
   */
  setBrushOperation(id: string, operation: SolidOperation): boolean {
    const brush = this.findBrush(id);
    if (!brush) return false;
    if (brush.operation === operation) return true;
    brush.operation = operation;
    if (brush.mesh) {
      SolidBrushVisual.applyOperationStyle(brush.mesh, operation);
    }
    this.markBrushesDirty([id]);
    this.rebuild(true);
    NotificationGlobal.onSolidCsgOperationFlipped();
    return true;
  }

  /**
   * Updates brush transform data and the preview mesh, then rebuilds.
   *
   * @param id Brush id.
   * @param position Optional position.
   * @param rotation Optional rotation.
   * @param scale Optional scale.
   * @returns True when found.
   */
  setBrushTransform(id: string, position?: THREE.Vector3, rotation?: THREE.Euler, scale?: THREE.Vector3): boolean {
    const brush = this.findBrush(id);
    if (!brush) return false;
    if (position) brush.position.copy(position);
    if (rotation) brush.rotation.copy(rotation);
    if (scale) brush.scale.copy(scale);
    brush.pushTransformToMesh();
    this.markBrushesDirty([id]);
    this.rebuild();
    return true;
  }

  /**
   * Renames a brush and its preview mesh.
   *
   * @param id Brush id.
   * @param name New name.
   * @returns True when found.
   */
  renameBrush(id: string, name: string): boolean {
    const brush = this.findBrush(id);
    if (!brush) return false;
    brush.name = name;
    if (brush.mesh) brush.mesh.name = name;
    return true;
  }

  /**
   * Duplicates a brush inside this solid model at the same local transform. The
   * clone stays under the same hierarchy parent as the source (including solid
   * CSG groups) so nested CSG order is preserved.
   *
   * @param id Source brush id.
   * @param offset Optional position offset applied after cloning (default
   *   none).
   * @returns The new brush instance, or null when the source is missing.
   */
  duplicateBrush(id: string, offset: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): SolidBrushInstance | null {
    const source = this.findBrush(id);
    if (!source) return null;
    const clone = solidOps.cloneBrushWithPreview(this.getOpsHost(), source, offset);
    this.brushes.appendPreparedBrush(clone);
    this.syncBrushOrderFromScene();
    this.markBrushesDirty([clone.id]);
    this.rebuild();
    return clone;
  }

  /**
   * Duplicates a solid CSG group and all nested brushes/groups under the same
   * parent, inserted immediately after the source group.
   *
   * @param sourceGroup Solid CSG group to duplicate.
   * @param offset Optional local position offset on the cloned group root.
   * @returns Cloned group, or null when the source is not a group under this
   *   solid.
   */
  duplicateSolidCsgGroup(
    sourceGroup: THREE.Group,
    offset: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  ): THREE.Group | null {
    if (!isSolidCsgGroup(sourceGroup)) return null;
    if (findSolidModelRoot(sourceGroup) !== this.root) return null;
    const createdBrushIds: string[] = [];
    const cloneGroup = solidOps.cloneSolidCsgGroupSubtree(this.getOpsHost(), sourceGroup, offset, createdBrushIds);
    const parent = sourceGroup.parent ?? this.root;
    parent.add(cloneGroup);
    this.insertObjectAfterSibling(parent, cloneGroup, sourceGroup);
    this.syncBrushOrderFromScene();
    if (createdBrushIds.length > 0) this.markBrushesDirty(createdBrushIds);
    else this.markDirty();
    this.rebuild();
    return cloneGroup;
  }

  /**
   * Moves an object to the slot immediately after a sibling under the same
   * parent.
   *
   * @param parent Shared parent.
   * @param object Object to place.
   * @param sibling Sibling that should precede the object.
   */
  private insertObjectAfterSibling(parent: THREE.Object3D, object: THREE.Object3D, sibling: THREE.Object3D): void {
    const siblingIndex = parent.children.indexOf(sibling);
    const currentIndex = parent.children.indexOf(object);
    if (siblingIndex < 0 || currentIndex < 0) return;
    parent.children.splice(currentIndex, 1);
    const insertIndex = Math.min(siblingIndex + 1, parent.children.length);
    parent.children.splice(insertIndex, 0, object);
  }

  /**
   * Pulls transforms from all brush meshes (e.g. after gizmo edits). Marks only
   * brushes whose transforms actually changed when order is stable.
   *
   * @param textureLockEnabled Whether Tex Lock should stick face UVs on move.
   */
  syncBrushesFromScene(textureLockEnabled: boolean | TextureLockFlags = false): void {
    const locks = normalizeTextureLockFlags(textureLockEnabled);
    const evaluationList = this.brushes.getEvaluationList();
    const orderBefore = evaluationList.map((brush) => brush.id);
    this.syncBrushOrderFromScene();
    if (!sameBrushOrder(orderBefore, this.brushes.getEvaluationList())) {
      pullAllBrushTransforms(this.brushes.getEvaluationList(), locks);
      this.markDirty();
      return;
    }
    const changedIds = pullChangedBrushTransforms(evaluationList, locks);
    if (changedIds.length > 0) {
      this.markBrushesDirty(changedIds);
    }
  }

  /**
   * Live-drag sync: only inspect selected brush meshes for transform changes.
   * Avoids O(n) mesh compares across the whole solid on every pointer move.
   *
   * @param selectedMeshes Meshes currently being transformed.
   * @param textureLockEnabled Whether Tex Lock should stick face UVs on move.
   * @returns True when at least one owned brush changed.
   */
  syncSelectedBrushesFromScene(
    selectedMeshes: readonly THREE.Mesh[],
    textureLockEnabled: boolean | TextureLockFlags = false,
  ): boolean {
    const locks = normalizeTextureLockFlags(textureLockEnabled);
    const selectedSet = new Set(selectedMeshes);
    const changedIds: string[] = [];
    for (const brush of this.brushes.getEvaluationList()) {
      if (!brush.mesh || !selectedSet.has(brush.mesh)) continue;
      if (pullTransformIfChanged(brush, locks)) {
        changedIds.push(brush.id);
      }
    }
    if (changedIds.length === 0) return false;
    this.markBrushesDirty(changedIds);
    return true;
  }

  /**
   * Pulls selected brush transforms from their meshes, always marks those
   * brushes dirty, and marks interactive geometry as not current. When texture
   * lock is enabled, sticks face UV mappings on each pulled transform.
   *
   * @param selectedMeshes Meshes currently being transformed.
   * @param textureLockEnabled Whether Tex Lock should stick face UVs on move.
   * @returns True when any selected brush belongs to this model.
   */
  prepareLiveBrushEdit(
    selectedMeshes: readonly THREE.Mesh[],
    textureLockEnabled: boolean | TextureLockFlags = false,
  ): boolean {
    const locks = normalizeTextureLockFlags(textureLockEnabled);
    const selectedSet = new Set(selectedMeshes);
    const dirtyIds: string[] = [];
    for (const brush of this.brushes.getEvaluationList()) {
      if (!brush.mesh || !selectedSet.has(brush.mesh)) continue;
      pullLiveBrushTransform(brush, locks, this.textureLockBaselines);
      dirtyIds.push(brush.id);
    }
    if (dirtyIds.length === 0) return false;
    this.markBrushesDirty(dirtyIds);
    this.pipeline.setInteractiveGeometryCurrent(false);
    return true;
  }

  /**
   * Applies an outliner/scene visibility change for a brush under this model.
   * Hidden brushes leave the CSG evaluation set; showing them re-includes them.
   * Uses partial dirty expansion so only the brush and its touch peers
   * recompile.
   *
   * @param object Brush mesh (or other child) whose visibility changed.
   * @returns True when a brush was found and the model was rebuilt.
   */
  applyBrushVisibilityChange(object: THREE.Object3D): boolean {
    const brush = this.findBrushByMesh(object);
    if (!brush) return false;
    const wasVisible = brush.visible;
    brush.pullTransformFromMesh();
    if (brush.visible === wasVisible) return false;
    solidOps.markVisibilityDirtyAndRebuild(this.getOpsHost(), brush);
    return true;
  }

  /**
   * Reorders the internal brush list to match outliner / scene-graph sibling
   * order. CSG tree order follows this list (first = earliest in boolean
   * evaluation).
   */
  syncBrushOrderFromScene(): void {
    this.brushes.syncBrushOrderFromScene();
  }

  /** Marks the model for a full CSG rebuild of every brush. */
  markDirty(): void {
    this.pipeline.markDirty();
  }

  /**
   * Marks specific brushes dirty for a partial CSG rebuild. Neighbor brushes
   * that touch these are included automatically by the compiler.
   *
   * @param brushIds Brush instance ids that changed (transform, shape, op,
   *   texture).
   */
  markBrushesDirty(brushIds: Iterable<string>): void {
    this.pipeline.markBrushesDirty(brushIds);
  }

  /**
   * Clears routing tables after evaluation-order changes so the next partial
   * recompile rebuilds tables with current prepared indices.
   */
  clearRoutingTables(): void {
    this.pipeline.clearRoutingTables();
  }

  /**
   * Returns cached touch-peer brush ids for partial CSG seeds.
   *
   * @param brushId Brush instance id.
   * @returns Peer brush ids from the last compile.
   */
  getCachedTouchPeerIds(brushId: string): string[] {
    return this.pipeline.getCachedTouchPeerIds(brushId);
  }

  /**
   * Rebuilds the compiled result mesh from current brush transforms.
   *
   * @param force Rebuild even when not marked dirty.
   * @param options Optional rebuild flags.
   * @param options.skipEdgeBatchRefresh When true, leaves static brush edge
   *   batches untouched (safe for CSG-order-only edits such as To First/Last).
   */
  rebuild(force: boolean = false, options: { skipEdgeBatchRefresh?: boolean } = {}): void {
    if (!this.pipeline.isDirty() && !force) {
      return;
    }
    this.pipeline.compileResultGeometry();
    solidOps.applyPresentationIfGeometryExists(this.getOpsHost(), true);
    this.pipeline.resetResultLocalTransform();
    this.pipeline.clearDirtyFlag();
    this.pipeline.setInteractiveGeometryCurrent(true);
    if (!options.skipEdgeBatchRefresh) {
      this.refreshStaticBrushEdgeBatches();
    }
  }

  /**
   * Finishes an interactive transform after selected brushes were prepared
   * dirty. Recompiles whenever seeds are dirty or live geometry is not trusted
   * current. Surface materials are scheduled on the next frame for
   * responsiveness.
   */
  finalizeAfterInteractiveEdit(): void {
    this.textureLockBaselines.clear();
    const needsCompile =
      this.pipeline.isFullRebuildRequired() ||
      this.pipeline.getDirtyBrushIdCount() > 0 ||
      !this.pipeline.isInteractiveGeometryCurrent();
    if (needsCompile) {
      this.pipeline.compileResultGeometry(false);
      this.pipeline.setInteractiveGeometryCurrent(true);
    }
    this.pipeline.resetResultLocalTransform();
    this.pipeline.clearDirtyFlag();
    solidOps.schedulePresentationRefresh(this.getOpsHost());
    this.refreshStaticBrushEdgeBatches();
  }

  /**
   * Async full rebuild that yields during CSG and mesh-chunk batches. Keeps the
   * browser responsive for large VMF imports.
   *
   * @param onProgress Optional progress (0..1) and status label.
   */
  async rebuildAsync(onProgress?: (ratio: number, label: string) => void): Promise<void> {
    solidOps.prepareFullAsyncRebuild(this.getOpsHost());
    onProgress?.(0.05, 'Compiling solid CSG…');
    await this.pipeline.compileFullAsync((ratio) => onProgress?.(0.05 + ratio * 0.55, 'Compiling solid CSG…'));
    await this.pipeline.finishAsyncAfterCompile((ratio) => onProgress?.(0.6 + ratio * 0.3, 'Building result mesh…'));
    solidOps.finishAsyncRebuildPresentation(this.getOpsHost(), onProgress);
    this.refreshStaticBrushEdgeBatches();
  }

  /**
   * Live rebuild during interactive drag: partial CSG + chunk remesh. Only
   * resyncs dirty brush meshes so large maps stay interactive. Reapplies
   * surface materials so multi-texture draw ranges stay valid.
   */
  rebuildLive(): void {
    if (this.pipeline.getDirtyBrushIdCount() === 0 && !this.pipeline.isFullRebuildRequired()) {
      solidOps.markMeshesThatDriftedDirty(this.getOpsHost());
    }
    this.pipeline.compileResultGeometry(true);
    this.pipeline.resetResultLocalTransform();
    this.applyLiveSurfaceLayoutIfNeeded();
    this.pipeline.setDirtyFlag(true);
    this.pipeline.setInteractiveGeometryCurrent(true);
  }

  /**
   * Applies surface materials after a live rebuild only when the result layout
   * may have changed. In-place partial patches keep material ranges valid.
   */
  private applyLiveSurfaceLayoutIfNeeded(): void {
    if (!this.pipeline.hasResultGeometry()) {
      return;
    }
    if (this.pipeline.wasLastResultWritePartial()) {
      return;
    }
    solidOps.applySurfaceLayoutToResult(this.getOpsHost(), false);
  }

  /**
   * Moves brushes to the start of CSG evaluation order (first boolean operand).
   * Relative order among the moved brushes is preserved.
   *
   * @param brushIds Brush ids to move (scene selection order ignored; list
   *   order used).
   * @returns True when the evaluation order changed.
   */
  moveBrushesToFirst(brushIds: readonly string[]): boolean {
    return solidOps.reorderBrushesAndRebuild(this.getOpsHost(), brushIds, 'first');
  }

  /**
   * Moves brushes to the end of CSG evaluation order (last boolean operand).
   * Relative order among the moved brushes is preserved.
   *
   * @param brushIds Brush ids to move.
   * @returns True when the evaluation order changed.
   */
  moveBrushesToLast(brushIds: readonly string[]): boolean {
    return solidOps.reorderBrushesAndRebuild(this.getOpsHost(), brushIds, 'last');
  }

  /**
   * Returns evaluation-list indices for the given brush ids.
   *
   * @param brushIds Brush ids to look up.
   * @returns Parallel list of indices (-1 when missing).
   */
  getBrushOrderIndices(brushIds: readonly string[]): number[] {
    return this.brushes.getBrushOrderIndices(brushIds);
  }

  /**
   * Restores an explicit brush evaluation order and rebuilds CSG.
   *
   * @param orderedBrushIds Full or partial ordered brush id list.
   * @returns True when any brush was reordered.
   */
  applyBrushOrder(orderedBrushIds: readonly string[]): boolean {
    if (!this.brushes.applyBrushOrderList(orderedBrushIds)) return false;
    this.markDirty();
    this.rebuild(true);
    return true;
  }

  /**
   * Sets the default surface texture for a whole brush and remeshes that brush
   * only. Does not re-run CSG (geometry is unchanged).
   *
   * @param brushId Brush id.
   * @param textureId Texture identity to apply to all faces of that brush.
   * @returns True when the brush was found.
   */
  setBrushSurfaceTexture(brushId: string, textureId: string): boolean {
    const brush = this.findBrush(brushId);
    if (!brush) return false;
    brush.setAllFacesTextureId(textureId);
    return this.refreshBrushPresentations([brushId]);
  }

  /**
   * Sets one brush face texture and remeshes that brush only (no CSG).
   *
   * @param brushId Brush id.
   * @param surfaceIndex Brush face index.
   * @param textureId Texture identity.
   * @returns True when the brush was found.
   */
  setBrushFaceTexture(brushId: string, surfaceIndex: number, textureId: string): boolean {
    const brush = this.findBrush(brushId);
    if (!brush) return false;
    brush.setFaceTextureId(surfaceIndex, textureId);
    return this.refreshBrushPresentations([brushId]);
  }

  /**
   * Remeshes result presentation for brushes whose face mappings changed.
   * Updates polygon texture ids and mesh chunks only — never runs CSG.
   *
   * @param brushIds Brushes that need UV/material refresh.
   * @returns True when at least one brush was refreshed.
   */
  refreshBrushPresentations(brushIds: readonly string[]): boolean {
    if (brushIds.length === 0) return false;
    const uniqueIds = Array.from(new Set(brushIds));
    const remeshed = this.presentation.collectRemeshedBrushIds(uniqueIds, (brushId) =>
      this.pipeline.updateBrushPolygonTextures(brushId),
    );
    if (remeshed.length === 0) {
      return solidOps.fallbackFullPresentationRebuild(this.getOpsHost(), uniqueIds);
    }
    return solidOps.finishPresentationRemesh(this.getOpsHost(), remeshed);
  }

  /**
   * Returns the result mesh for clone geometry propagation after live rebuild.
   *
   * @returns Result mesh.
   */
  getResultMeshForSync(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Exposes last CSG compile diagnostics for unit tests and profiling.
   *
   * @returns Copy of compiler stats from the most recent compile.
   */
  getCompilerStatsForTesting(): {
    fullRebuild: boolean;
    recompiledBrushCount: number;
    reusedBrushCount: number;
    preparedBrushCount: number;
  } {
    return this.pipeline.getCompilerStatsForTesting();
  }

  /**
   * Exposes whether the last result mesh write was an in-place partial patch.
   *
   * @returns True after a successful dirty-range patch.
   */
  wasLastResultWritePartialForTesting(): boolean {
    return this.pipeline.wasLastResultWritePartialForTesting();
  }

  /**
   * Captures default and per-face UV mappings for every brush (smear
   * undo/redo).
   *
   * @returns Snapshot list keyed by brush id.
   */
  captureBrushUvSnapshots(): BrushUvSnapshot[] {
    return this.presentation.captureBrushUvSnapshots(this.brushes.getEvaluationList());
  }

  /**
   * Restores brush UV mappings from a smear undo/redo snapshot.
   *
   * @param snapshots Brush UV snapshots previously captured.
   */
  restoreBrushUvSnapshots(snapshots: BrushUvSnapshot[]): void {
    this.presentation.restoreBrushUvSnapshots(snapshots, (id) => this.findBrush(id));
  }

  /**
   * Writes UV editor changes on the result mesh back onto owning brush faces.
   * Call after face-texture apply or UV smear so CSG rebuilds keep phase/scale.
   * Rebakes only the affected brush mesh chunks (never drops the rest of the
   * world).
   */
  syncAuthoredMappingsFromResultMesh(): void {
    const maps = getFaceTextureMaps(this.resultMesh);
    const sources = this.getResultTriangleSources();
    this.pipeline.syncAuthoredMappingsFromMaps(maps, sources, (triangleIndices, mapping, sourceList) => {
      writeMapEntryToBrushFaces(triangleIndices, mapping, sourceList, (id) => this.findBrush(id), this.root);
    });
    if (this.pipeline.hasResultGeometry()) {
      solidOps.applySurfaceLayoutToResult(this.getOpsHost(), true);
    }
  }

  /**
   * Writes only the given result-mesh triangle regions back onto brush faces
   * and remeshes only those brushes (never all coplanar neighbors).
   *
   * @param triangleIndices Result triangles that were authored.
   * @param mapping Mapping applied to those triangles.
   */
  syncAuthoredMappingForTriangles(triangleIndices: number[], mapping: FaceTextureMapping): void {
    this.syncAuthoredMappingsForRegions([{ triangleIndices, mapping }]);
  }

  /**
   * Writes multiple result-mesh triangle regions onto brush faces, then
   * remeshes once. Callers must capture all mappings before this runs so
   * multi-select UV edits are not lost when the result mesh is rebuilt
   * mid-loop.
   *
   * @param regions Triangle regions with their world-space mappings.
   */
  syncAuthoredMappingsForRegions(
    regions: ReadonlyArray<{ triangleIndices: number[]; mapping: FaceTextureMapping }>,
  ): void {
    if (regions.length === 0) return;
    const sources = this.getResultTriangleSources();
    const brushIds = new Set<string>();
    for (const region of regions) {
      writeMapEntryToBrushFaces(region.triangleIndices, region.mapping, sources, (id) => this.findBrush(id), this.root);
      collectBrushIdsForTriangles(region.triangleIndices, sources).forEach((id) => brushIds.add(id));
    }
    this.pipeline.rebakeMeshChunksForBrushes(brushIds);
    if (this.pipeline.hasResultGeometry()) {
      solidOps.applySurfaceLayoutToResult(this.getOpsHost(), true);
    }
  }

  /**
   * Reads per-triangle brush surface sources from the result mesh.
   *
   * @returns Triangle source list (empty when unset).
   */
  private getResultTriangleSources(): SolidTriangleSource[] {
    const sources = this.resultMesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as SolidTriangleSource[] | undefined;
    return sources ?? [];
  }

  /**
   * Builds the ops host bag for shared lifecycle helpers.
   *
   * @returns Solid model ops host.
   */
  private getOpsHost(): SolidModelOpsHost {
    return {
      root: this.root,
      resultMesh: this.resultMesh,
      brushes: this.brushes,
      pipeline: this.pipeline,
      presentation: this.presentation,
      findBrush: (id) => this.findBrush(id),
      markBrushesDirty: (ids) => this.markBrushesDirty(ids),
      markDirty: () => this.markDirty(),
      rebuild: (force, options) => this.rebuild(force, options),
    };
  }

  /** Rebakes static brush edge batches under this solid root. */
  private refreshStaticBrushEdgeBatches(): void {
    SolidBrushEdgeBatch.rebuildForSolidRoot(this.root);
  }
}
