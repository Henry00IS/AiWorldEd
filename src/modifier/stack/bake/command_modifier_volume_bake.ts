import * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { cloneFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { ModifierVolume, modifierVolumeSceneRoot } from '@/modifier/stack/modifier_volume.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import type { ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackOwnerDecode, modifierStackOwnerEncode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import {
  modifierStackBakePlan,
  type ModifierStackBakeModelPlan,
  type ModifierStackBakeShape,
  type ModifierStackBakeCreation,
} from './modifier_stack_bake_plan.js';
import { modifierStackTreeAnchor, modifierStackTreeInsert } from '@/modifier/stack/evaluate/modifier_stack_tree.js';
import { modifierStackBakeGroupsPlace, type ModifierStackBakeGroup } from './modifier_stack_bake_groups.js';
import { modifierStackBakeMeshesCreate, type ModifierStackBakeMesh } from './modifier_stack_bake_meshes.js';

/** A volume or generator node the bake took out of the scene. */
interface ModifierStackBakeDetached {
  /** Node. */
  node: THREE.Object3D;
  /** Parent it had. */
  parent: THREE.Object3D;
  /** Child index it had. */
  index: number;
  /** Ordered node it followed, or null when it came first. */
  after: THREE.Object3D | null;
}

/**
 * Turns a modifier volume's result into ordinary authored brushes and removes
 * the volume: derived brushes become new brushes and chamfered brushes keep
 * their chamfer. A brush or CSG group that owns its stack stays and only loses
 * its stack. Fully undoable.
 */
export class CommandModifierVolumeBake implements UndoCommand {
  private readonly volume: THREE.Object3D;
  private readonly sceneRoot: THREE.Object3D;
  private readonly plans: ModifierStackBakeModelPlan[];
  private readonly created: { model: SolidModel; instance: SolidBrushInstance }[] = [];
  private readonly instances = new Map<ModifierStackBakeCreation, SolidBrushInstance>();
  private readonly groups = new Map<ModifierStackBakeGroup, THREE.Group>();
  private readonly detached: ModifierStackBakeDetached[] = [];
  private readonly ownerStack: ModifierStackSettings | undefined;
  /**
   * Regular meshes the volume's generators built, made once and re-added on
   * redo.
   */
  private readonly meshes: ModifierStackBakeMesh[];

  /**
   * Plans the bake against the current scene.
   *
   * @param volume Modifier volume to bake.
   */
  constructor(volume: THREE.Object3D) {
    this.volume = volume;
    this.ownerStack = modifierStackOwnerEncode(volume);
    this.sceneRoot = modifierVolumeSceneRoot(volume);
    const restore = modifierStackBakeParametersApply(this.sceneRoot);
    try {
      this.plans = modifierStackBakePlan(volume);
      this.meshes = modifierStackBakeMeshesCreate(volume, this.plans[0]?.model.root.parent ?? this.sceneRoot);
    } finally {
      restore();
    }
  }

  /**
   * Returns how many brushes the bake creates.
   *
   * @returns Created brush count.
   */
  createdCount(): number {
    return this.plans.reduce((sum, plan) => sum + plan.created.length, 0) + this.meshes.length;
  }

  /** Applies the bake. */
  execute(): void {
    const removed = this.plans.flatMap((plan) => plan.removed);
    for (const node of this.ownerStack ? removed : [this.volume, ...removed]) this.detach(node);
    for (const plan of this.plans) this.applyPlan(plan);
    for (const { mesh, parent } of this.meshes) parent.add(mesh);
    if (this.ownerStack) modifierStackOwnerDecode(this.volume, undefined);
    modifierBevelRefreshScene(this.sceneRoot);
  }

  /** Restores the volume and the reshaped brushes, and drops created ones. */
  undo(): void {
    for (const { mesh } of this.meshes) mesh.removeFromParent();
    for (const { model, instance } of this.created.splice(0).reverse()) model.removeBrush(instance.id, false, false);
    for (const group of this.groups.values()) group.removeFromParent();
    for (const plan of this.plans)
      for (const entry of plan.replaced) modifierStackBakeShapeApply(plan.model, entry.id, entry.before);
    for (const entry of this.detached.splice(0).reverse())
      modifierStackTreeInsert(entry.parent, entry.node, modifierStackBakeRestoreIndex(entry));
    if (this.ownerStack) modifierStackOwnerDecode(this.volume, this.ownerStack);
    modifierBevelRefreshScene(this.sceneRoot);
  }

  /**
   * Removes the baked volume or a generator baked with it, remembering where it
   * was.
   *
   * @param node Volume or generator node.
   */
  private detach(node: THREE.Object3D): void {
    const parent = node.parent;
    if (!parent || this.detached.some((entry) => entry.node === node)) return;
    const index = parent.children.indexOf(node);
    const after = parent.children.slice(0, index).reverse().find(modifierStackBakeOrdered) ?? null;
    this.detached.push({ node, parent, index, after });
    parent.remove(node);
  }

  /**
   * Applies one solid's part of the bake.
   *
   * @param plan Plan for one solid.
   */
  private applyPlan(plan: ModifierStackBakeModelPlan): void {
    for (const entry of plan.replaced) modifierStackBakeShapeApply(plan.model, entry.id, entry.after);
    const placed = plan.created.map((creation) => {
      const instance = this.instanceOf(plan.model, creation);
      instance.pushTransformToMesh();
      plan.model.insertBrushInstance(instance, plan.model.getBrushCount(), 2, undefined, false);
      this.created.push({ model: plan.model, instance });
      return { creation, instance };
    });
    modifierStackBakePlace(plan.model, placed);
    modifierStackBakeGroupsPlace(
      placed.map(({ creation, instance }) => ({ instance, groups: creation.groups })),
      this.groups,
    );
    plan.model.syncBrushOrderFromScene();
    plan.model.markDirty();
  }

  /**
   * Returns the brush made for a creation, building it on the first run so a
   * redo restores the very same brush and id.
   *
   * @param model Solid model.
   * @param creation Planned brush.
   * @returns Brush instance.
   */
  private instanceOf(model: SolidModel, creation: ModifierStackBakeCreation): SolidBrushInstance {
    const existing = this.instances.get(creation);
    if (existing) return existing;
    const instance = model.prepareTopologyBrush(creation.brush.clone(), creation.operation, creation.position);
    instance.name = hierarchyNameAllocator.allocateFromSourceName(creation.name);
    if (instance.mesh) instance.mesh.name = instance.name;
    creation.surfaces.forEach((surface, index) => instance.setFaceSurface(index, cloneFaceSurface(surface)));
    this.instances.set(creation, instance);
    return instance;
  }
}

/**
 * Returns whether a node takes part in a solid's CSG order: a brush, a group or
 * a modifier volume, unlike helper meshes such as edge batches.
 *
 * @param node Scene node.
 * @returns True for ordered nodes.
 */
function modifierStackBakeOrdered(node: THREE.Object3D): boolean {
  return SolidBrushVisual.isBrushObject(node) || node instanceof THREE.Group || ModifierVolume.isVolume(node);
}

/**
 * Returns where a detached node goes back: right after the ordered node it
 * followed, since baking may rearrange helper meshes around it.
 *
 * @param entry Detached node.
 * @returns Child index.
 */
function modifierStackBakeRestoreIndex(entry: ModifierStackBakeDetached): number {
  const children = entry.parent.children;
  if (entry.after?.parent === entry.parent) return children.indexOf(entry.after) + 1;
  if (entry.after) return entry.index;
  const first = children.findIndex(modifierStackBakeOrdered);
  return first < 0 ? children.length : first;
}

/**
 * Writes a shape and visibility onto an authored brush and its preview mesh.
 *
 * @param model Solid model.
 * @param id Brush id.
 * @param shape Shape to apply.
 */
function modifierStackBakeShapeApply(model: SolidModel, id: string, shape: ModifierStackBakeShape): void {
  const instance = model.findBrush(id);
  if (!instance) return;
  instance.brush = shape.brush.clone();
  instance.restoreFaceSurfaces(shape.defaultSurface, shape.faceSurfaces);
  if (instance.mesh) SolidBrushVisual.replaceHullGeometry(instance.mesh, instance.brush);
  model.markBrushesDirty([id]);
  if (!instance.mesh || instance.mesh.visible === shape.visible) return;
  instance.mesh.visible = shape.visible;
  model.applyBrushVisibilityChange(instance.mesh);
}

/**
 * Moves baked brushes to their scene-order anchors, the place compile gave
 * them, or the end of the solid when that is gone. Their CSG groups are made
 * afterwards around them.
 *
 * @param model Solid model.
 * @param placed Created brushes with their plan entries, in output order.
 */
function modifierStackBakePlace(
  model: SolidModel,
  placed: readonly { creation: ModifierStackBakeCreation; instance: SolidBrushInstance }[],
): void {
  const nodes = new Map<string, THREE.Object3D>();
  model.root.traverse((node) => nodes.set(node.uuid, node));
  const offsets = new Map<string, number>();
  for (const { creation, instance } of placed) {
    if (!instance.mesh) continue;
    const unit = { ...creation.anchor, tree: model.root, brushes: [], authored: false };
    const anchor = modifierStackTreeAnchor(unit, nodes) ?? {
      parent: model.root,
      index: model.root.children.length,
      key: '',
    };
    const offset = offsets.get(anchor.key) ?? 0;
    modifierStackTreeInsert(anchor.parent, instance.mesh, anchor.index + offset);
    offsets.set(anchor.key, offset + 1);
  }
}

/**
 * Gives every modifier under a root the parameters its kind bakes with, such as
 * a script's inputs after its When Baked blocks, while the bake is planned.
 *
 * @param root Scene root.
 * @returns Puts the stored parameters back.
 */
function modifierStackBakeParametersApply(root: THREE.Object3D): () => void {
  const changed: { node: THREE.Object3D; settings: ModifierStackSettings }[] = [];
  root.traverse((node) => {
    if (!ModifierVolume.isVolume(node)) return;
    const settings = ModifierVolume.read(node);
    let touched = false;
    const modifiers = settings.modifiers.map((entry) => {
      const kind = modifierStackKindFind(entry.kind);
      const baked = kind?.bakeParameters(kind.normalizeParameters(entry.parameters)) ?? null;
      if (!baked) return entry;
      touched = true;
      return { ...entry, parameters: baked };
    });
    if (!touched) return;
    changed.push({ node, settings });
    ModifierVolume.write(node, { ...settings, modifiers });
  });
  return () => {
    for (const { node, settings } of changed) ModifierVolume.write(node, settings);
  };
}
