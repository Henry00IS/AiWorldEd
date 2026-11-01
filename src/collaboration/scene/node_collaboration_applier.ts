import { snapSceneExternalEditNotify } from '@/snap/session/snap_scene_revision.js';
import * as THREE from 'three';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { releaseSharedContentMaterials } from '@/viewports/shared/shared_content_material_store.js';
import type { ObjectEntry } from '@/io/scene/io_types.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { setObjectLocked } from '@/utils/object_lock.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { pullLiveBrushTransform } from '@/solid/model/solid_brush_transform_sync.js';
import { nodeUvApply, nodeUvPose, nodeUvPoseOf } from '@/collaboration/scene/node_collaboration_uv.js';
import type { SolidBrushTextureLockBaseline } from '@/texture/lock/solid_brush_texture_lock.js';
import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';
import { nodeBrushWireId } from '@/collaboration/scene/node_collaboration_identity.js';
import { IndexCollaborationNodes } from '@/collaboration/scene/node_collaboration_index.js';
import { BatchCollaborationApply } from '@/collaboration/scene/node_collaboration_batch.js';
import {
  placementAttach,
  placementCreatesCycle,
  placementDisposeSubtree,
  placementOrderEnforce,
} from '@/collaboration/scene/node_collaboration_placement.js';
import {
  solidBrushContentPatch,
  solidBrushCreate,
  solidBrushPatch,
  solidBrushStructureText,
  solidGroupCreate,
  solidGroupWrite,
} from '@/collaboration/scene/node_collaboration_solid_apply.js';
import {
  NODE_PARENT_WORLD,
  type NodeCollaborationBrushData,
  type NodeCollaborationEntryData,
  type NodeCollaborationRef,
  type NodeCollaborationSolidGroupData,
  type NodeCollaborationState,
} from '@/collaboration/scene/node_collaboration_types.js';

/** Live transform: position xyz, quaternion xyzw, scale xyz. */
export type NodeCollaborationPose = [number, number, number, number, number, number, number, number, number, number];

/**
 * Applies remote node states to the local scene idempotently: patches in place
 * when only transform-like fields changed, otherwise replaces the node.
 */
export class ApplierCollaborationNodes {
  private readonly world: THREE.Group;
  private readonly deserializer: SceneDeserializer;
  private index: IndexCollaborationNodes | null;
  private batch: BatchCollaborationApply;
  /**
   * Pre-preview UVs and poses of brushes another member drags with texture
   * locks, so each live pose rewrites UVs from the agreed surfaces exactly as
   * the dragger's own live pull does. Cleared whenever states settle.
   */
  private lockBaselines: WeakMap<SolidModel, Map<string, SolidBrushTextureLockBaseline>>;

  /**
   * Creates an applier for a world root.
   *
   * @param world World group holding the editable scene.
   */
  constructor(world: THREE.Group) {
    this.world = world;
    this.deserializer = new SceneDeserializer({ exactReplica: true });
    this.index = null;
    this.batch = new BatchCollaborationApply();
    this.lockBaselines = new WeakMap();
  }

  /**
   * Returns the current node index, rebuilding it after structural changes.
   *
   * @returns Node index.
   */
  nodes(): IndexCollaborationNodes {
    if (this.index === null) this.index = new IndexCollaborationNodes(this.world);
    return this.index;
  }

  /** Forgets the cached index after the scene changed outside the applier. */
  invalidate(): void {
    this.index = null;
  }

  /**
   * Applies one node state.
   *
   * @param state New state.
   * @param previous Last known state of the node, or null.
   * @returns True when the node exists afterwards.
   */
  upsert(state: NodeCollaborationState, previous: NodeCollaborationState | null): boolean {
    this.batch.changedIds.add(state.id);
    const exists = this.upsertKind(state, previous);
    if (exists && previous !== null && previous.key !== state.key) this.orderTouchNode(state.id);
    return exists;
  }

  /**
   * Requests sibling order enforcement under the current parent of a node, so a
   * key change without a parent change still reorders the siblings.
   *
   * @param id Wire id.
   */
  private orderTouchNode(id: string): void {
    const parent = this.nodes().get(id)?.object.parent;
    if (parent !== null && parent !== undefined) this.batch.parents.add(parent);
  }

  /**
   * Applies one node state by kind.
   *
   * @param state New state.
   * @param previous Last known state of the node, or null.
   * @returns True when the node exists afterwards.
   */
  private upsertKind(state: NodeCollaborationState, previous: NodeCollaborationState | null): boolean {
    if (state.kind === 'entry') return this.entryUpsert(state, state.data as NodeCollaborationEntryData, previous);
    const rootRef = state.model === undefined ? undefined : this.nodes().get(state.model);
    const model = rootRef?.model ?? null;
    if (rootRef === undefined || model === null) return false;
    const parent = this.parentSolid(state.parent, rootRef);
    if (state.kind === 'brush') return this.brushUpsert(state, model, parent, previous);
    return this.groupUpsert(state, model, parent);
  }

  /**
   * Removes a node and its synchronized descendants.
   *
   * @param id Wire id.
   */
  remove(id: string): void {
    const ref = this.nodes().get(id);
    if (ref === undefined) return;
    this.batch.changedIds.add(id);
    const nodes = this.nodes();
    const removed: NodeCollaborationRef[] = [];
    ref.object.traverse((object) => {
      const child = nodes.forObject(object);
      if (child !== undefined) removed.push(child);
    });
    removed.forEach((child) => {
      this.batch.changedIds.add(child.id);
      if (child.kind === 'brush') this.brushRemove(child);
      nodes.unregister(child);
    });
    if (ref.kind !== 'brush') this.objectDetach(ref.object);
  }

  /** Removes every scene node, keeping editor helpers. */
  clearScene(): void {
    this.deserializer.clearContent(this.world);
    this.index = null;
    this.batch = new BatchCollaborationApply();
  }

  /**
   * Applies a live transform without changing the node structure. A brush or
   * world mesh pose with texture locks also rewrites its UVs for those locks
   * (world-fixed density with Stretch Lock off, world-anchored with Pos Lock
   * off).
   *
   * @param id Wire id.
   * @param pose Local transform.
   * @param locks Texture locks of the sender's transform, or null to keep
   *   object-local UVs.
   */
  pose(id: string, pose: NodeCollaborationPose, locks: TextureLockFlags | null = null): void {
    const ref = this.nodes().get(id);
    if (ref === undefined) return;
    const before = nodeUvPoseOf(ref.object);
    ref.object.position.set(pose[0], pose[1], pose[2]);
    ref.object.quaternion.set(pose[3], pose[4], pose[5], pose[6]);
    ref.object.scale.set(pose[7], pose[8], pose[9]);
    this.batch.changedIds.add(id);
    if (ref.model === null) nodeUvPose(ref.object, before, locks);
    if (ref.model === null || ref.kind === 'entry') return;
    if (ref.kind === 'solidGroup') this.batch.modelsFull.add(ref.model);
    this.brushPoseTransformPull(ref.model, ref.object, locks);
    if (ref.kind === 'brush') this.batch.brushDirty(ref.model, ref.localId);
  }

  /**
   * Pulls a posed brush mesh transform into its brush, rewriting its UVs for
   * the given texture locks from the UVs it had before the first locked pose.
   *
   * @param model Solid model of the posed object.
   * @param object Posed object.
   * @param locks Texture locks, or null to keep brush-local UVs.
   */
  private brushPoseTransformPull(model: SolidModel, object: THREE.Object3D, locks: TextureLockFlags | null): void {
    const brush = model.findBrushByMesh(object);
    if (brush === undefined) return;
    if (locks === null) brush.pullTransformFromMesh();
    else pullLiveBrushTransform(brush, locks, this.lockBaselinesOf(model));
  }

  /**
   * Returns the live texture lock baselines of a model.
   *
   * @param model Solid model.
   * @returns Baselines by brush id.
   */
  private lockBaselinesOf(model: SolidModel): Map<string, SolidBrushTextureLockBaseline> {
    let baselines = this.lockBaselines.get(model);
    if (baselines === undefined) {
      baselines = new Map();
      this.lockBaselines.set(model, baselines);
    }
    return baselines;
  }

  /**
   * Requests sibling order enforcement under a node at the end of the batch.
   *
   * @param parentId Wire id of the parent ('' for the world).
   */
  orderTouch(parentId: string): void {
    const ref = parentId === NODE_PARENT_WORLD ? undefined : this.nodes().get(parentId);
    this.batch.parents.add(ref === undefined ? this.world : ref.object);
  }

  /**
   * Finishes a batch: enforces sibling order, rebuilds touched models and
   * refreshes bevel modifiers. A settled (not live) batch also forgets the
   * texture lock baselines of live brush poses.
   *
   * @param keyOf Returns the agreed order key of a node, or null.
   * @param live True during interactive drags for cheaper rebuilds.
   * @returns Wire ids changed by the batch.
   */
  finish(keyOf: (id: string) => string | null, live: boolean): Set<string> {
    const batch = this.batch;
    this.batch = new BatchCollaborationApply();
    if (!live) this.lockBaselines = new WeakMap();
    if (batch.isEmpty()) return batch.changedIds;
    this.ordersEnforce(batch, keyOf);
    batch
      .models()
      .filter((model) => model.root.parent !== null)
      .forEach((model) => this.modelRefresh(model, batch, live));
    if (!live) modifierBevelRefreshScene(this.world);
    snapSceneExternalEditNotify();
    return batch.changedIds;
  }

  /**
   * Enforces key order under every touched parent.
   *
   * @param batch Finished batch.
   * @param keyOf Key lookup by wire id.
   */
  private ordersEnforce(batch: BatchCollaborationApply, keyOf: (id: string) => string | null): void {
    const nodes = this.nodes();
    const idOf = (object: THREE.Object3D): string => nodes.forObject(object)?.id ?? '';
    const keyOfObject = (object: THREE.Object3D): string | null => {
      const ref = nodes.forObject(object);
      return ref === undefined ? null : keyOf(ref.id);
    };
    batch.parents.forEach((parent) => {
      const changed = placementOrderEnforce(parent, keyOfObject, idOf);
      const model = SolidModel.fromObject(parent);
      if (changed && model !== null) batch.modelsFull.add(model);
    });
  }

  /**
   * Rebuilds one touched solid model.
   *
   * @param model Model.
   * @param batch Finished batch.
   * @param live True for a cheap live rebuild.
   */
  private modelRefresh(model: SolidModel, batch: BatchCollaborationApply, live: boolean): void {
    model.syncBrushOrderFromScene();
    if (batch.modelsFull.has(model)) model.markDirty();
    const dirty = batch.brushesDirty.get(model);
    if (dirty !== undefined) model.markBrushesDirty(dirty);
    if (live) model.rebuildLive();
    else model.rebuild();
  }

  /**
   * Applies an entry state (world mesh, group or solid root).
   *
   * @param state New state.
   * @param data Entry payload.
   * @param previous Last known state, or null.
   * @returns True when the node exists afterwards.
   */
  private entryUpsert(
    state: NodeCollaborationState,
    data: NodeCollaborationEntryData,
    previous: NodeCollaborationState | null,
  ): boolean {
    const parent = this.parentEntry(state.parent);
    const existing = this.nodes().get(state.id);
    if (existing !== undefined && this.entryReusable(existing, data, previous)) {
      this.entryPatch(existing, data);
      this.attach(existing.object, parent);
      nodeUvApply(existing.object, data);
      return true;
    }
    if (existing !== undefined) this.remove(state.id);
    const object = this.entryCreate(state.id, data);
    this.attach(object, parent);
    nodeUvApply(object, data);
    const parentId = this.nodes().forObject(object.parent ?? this.world)?.id ?? NODE_PARENT_WORLD;
    const model = SolidModel.fromObject(object);
    this.nodes().register({ id: state.id, kind: 'entry', object, model, localId: state.id }, parentId);
    return true;
  }

  /**
   * Returns whether an existing entry can be patched instead of replaced.
   *
   * @param ref Existing node.
   * @param data New payload.
   * @param previous Last known state, or null.
   * @returns True when patching suffices.
   */
  private entryReusable(
    ref: NodeCollaborationRef,
    data: NodeCollaborationEntryData,
    previous: NodeCollaborationState | null,
  ): boolean {
    if (ref.kind !== 'entry') return false;
    if (ref.object instanceof THREE.Mesh) {
      if (data.entry.type !== 'mesh' || previous === null || previous.kind !== 'entry') return false;
      return entryStructureText(previous.data as NodeCollaborationEntryData) === entryStructureText(data);
    }
    return data.entry.type === 'group' && (data.solid !== null) === (ref.model !== null);
  }

  /**
   * Patches name, transform, visibility, lock flag and world mode of an entry.
   *
   * @param ref Existing node.
   * @param data New payload.
   */
  private entryPatch(ref: NodeCollaborationRef, data: NodeCollaborationEntryData): void {
    const object = ref.object;
    const entry = data.entry;
    object.name = entry.name;
    object.position.set(entry.position.x, entry.position.y, entry.position.z);
    object.rotation.set(entry.rotation.x, entry.rotation.y, entry.rotation.z, 'XYZ');
    object.scale.set(entry.scale.x, entry.scale.y, entry.scale.z);
    object.visible = entry.visible;
    setObjectLocked(object, data.locked);
    if (ref.model === null || data.solid === null) return;
    if (ref.model.isInvertedWorld() === data.solid.invertedWorld) return;
    ref.model.setInvertedWorld(data.solid.invertedWorld);
    this.batch.modelsFull.add(ref.model);
  }

  /**
   * Creates a new entry object, dropping material snapshots left by an earlier
   * object with the same uuid and reserving its name for new local objects.
   *
   * @param id Wire id used as uuid.
   * @param data Entry payload.
   * @returns Created object.
   */
  private entryCreate(id: string, data: NodeCollaborationEntryData): THREE.Object3D {
    const entry: ObjectEntry = { ...data.entry, uuid: id, parentId: null };
    if (data.solid !== null) entry.solidModel = { brushes: [], invertedWorld: data.solid.invertedWorld };
    releaseSharedContentMaterials(id);
    const object = this.deserializer.objectCreateFromEntry(entry);
    object.uuid = id;
    setObjectLocked(object, data.locked);
    hierarchyNameAllocator.noteExistingName(object.name);
    return object;
  }

  /**
   * Applies a brush state.
   *
   * @param state New state.
   * @param model Owning model.
   * @param parent Target parent.
   * @param previous Last known state, or null.
   * @returns True when the brush exists afterwards.
   */
  private brushUpsert(
    state: NodeCollaborationState,
    model: SolidModel,
    parent: THREE.Object3D,
    previous: NodeCollaborationState | null,
  ): boolean {
    const data = state.data as NodeCollaborationBrushData;
    if (nodeBrushWireId(model.root.uuid, data.brush.id) !== state.id) return false;
    const existing = this.nodes().get(state.id);
    if (existing !== undefined && this.brushReusable(existing, model, data, previous)) {
      solidBrushPatch(existing, data, parent, this.batch);
      return true;
    }
    if (existing?.kind === 'brush' && existing.model === model) {
      if (solidBrushContentPatch(existing, data, parent, this.batch)) return true;
    }
    if (existing !== undefined) this.remove(state.id);
    const ref = solidBrushCreate(state.id, model, data, parent);
    if (ref === null) return false;
    this.nodes().register(ref, state.parent);
    this.batch.parents.add(parent);
    this.batch.modelsFull.add(model);
    return true;
  }

  /**
   * Returns whether an existing brush can be patched in place.
   *
   * @param ref Existing node.
   * @param model Target model.
   * @param data New payload.
   * @param previous Last known state, or null.
   * @returns True when only transform-like fields differ.
   */
  private brushReusable(
    ref: NodeCollaborationRef,
    model: SolidModel,
    data: NodeCollaborationBrushData,
    previous: NodeCollaborationState | null,
  ): boolean {
    if (ref.kind !== 'brush' || ref.model !== model || previous === null || previous.kind !== 'brush') return false;
    return solidBrushStructureText(previous.data as NodeCollaborationBrushData) === solidBrushStructureText(data);
  }

  /**
   * Applies a CSG group state.
   *
   * @param state New state.
   * @param model Owning model.
   * @param parent Target parent.
   * @returns True.
   */
  private groupUpsert(state: NodeCollaborationState, model: SolidModel, parent: THREE.Object3D): boolean {
    const data = state.data as NodeCollaborationSolidGroupData;
    const existing = this.nodes().get(state.id);
    if (existing !== undefined && (existing.kind !== 'solidGroup' || existing.model !== model)) this.remove(state.id);
    const current = this.nodes().get(state.id);
    if (current !== undefined) solidGroupWrite(current.object, data);
    const ref = current ?? solidGroupCreate(state.id, model, data);
    this.attach(ref.object, parent);
    if (current === undefined) this.nodes().register(ref, state.parent);
    this.batch.modelsFull.add(model);
    return true;
  }

  /**
   * Removes one brush from its model.
   *
   * @param ref Brush node.
   */
  private brushRemove(ref: NodeCollaborationRef): void {
    if (ref.model === null) return;
    ref.model.removeBrush(ref.localId, true, false);
    ref.object.removeFromParent();
    this.batch.modelsFull.add(ref.model);
  }

  /**
   * Detaches and disposes a non-brush subtree.
   *
   * @param object Subtree root.
   */
  private objectDetach(object: THREE.Object3D): void {
    const model = object.parent === null ? null : SolidModel.fromObject(object.parent);
    if (model !== null) this.batch.modelsFull.add(model);
    object.removeFromParent();
    placementDisposeSubtree(object);
  }

  /**
   * Resolves the parent of an entry; invalid parents fall back to the world.
   *
   * @param parentId Wire id of the parent.
   * @returns Parent object.
   */
  private parentEntry(parentId: string): THREE.Object3D {
    if (parentId === NODE_PARENT_WORLD) return this.world;
    const ref = this.nodes().get(parentId);
    const valid =
      ref !== undefined && ref.kind === 'entry' && ref.model === null && !(ref.object instanceof THREE.Mesh);
    return valid ? ref.object : this.world;
  }

  /**
   * Resolves the parent of a brush or CSG group inside a model.
   *
   * @param parentId Wire id of the parent.
   * @param rootRef Model root node.
   * @returns Parent object.
   */
  private parentSolid(parentId: string, rootRef: NodeCollaborationRef): THREE.Object3D {
    const ref = this.nodes().get(parentId);
    const valid = ref !== undefined && ref.kind === 'solidGroup' && ref.model === rootRef.model;
    return valid ? ref.object : rootRef.object;
  }

  /**
   * Attaches an object under a parent, falling back to the world (or model
   * root) when the move would create a cycle, and records the parent.
   *
   * @param object Object to place.
   * @param parent Desired parent.
   */
  private attach(object: THREE.Object3D, parent: THREE.Object3D): void {
    const target = placementCreatesCycle(object, parent) ? this.world : parent;
    if (object.parent !== target) {
      if (object.parent !== null) this.batch.parents.add(object.parent);
      this.batch.parents.add(target);
    }
    placementAttach(object, target);
  }
}

/**
 * Returns the entry payload without fields that can be patched in place.
 *
 * @param data Entry payload.
 * @returns Structure text.
 */
export function entryStructureText(data: NodeCollaborationEntryData): string {
  const entry = {
    ...data.entry,
    uuid: '',
    name: '',
    position: 0,
    rotation: 0,
    scale: 0,
    visible: true,
    parentId: null,
  };
  return JSON.stringify({ entry, solid: data.solid });
}
