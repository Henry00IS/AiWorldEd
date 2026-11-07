import * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { cloneFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierVolumeSceneRoot } from '@/modifier/stack/modifier_volume.js';
import {
  modifierStackBakePlan,
  type ModifierStackBakeModelPlan,
  type ModifierStackBakeShape,
  type ModifierStackBakeCreation,
} from './modifier_stack_bake_plan.js';
import { modifierStackTreeAnchor, modifierStackTreeInsert } from '@/modifier/stack/evaluate/modifier_stack_tree.js';

/**
 * Turns a modifier volume's result into ordinary authored brushes and removes
 * the volume: derived brushes become new brushes and chamfered brushes keep
 * their chamfer. Fully undoable.
 */
export class CommandModifierVolumeBake implements UndoCommand {
  private readonly volume: THREE.Object3D;
  private readonly sceneRoot: THREE.Object3D;
  private readonly plans: ModifierStackBakeModelPlan[];
  private readonly created: { model: SolidModel; instance: SolidBrushInstance }[] = [];
  private readonly instances = new Map<ModifierStackBakeCreation, SolidBrushInstance>();
  private volumeParent: THREE.Object3D | null = null;
  private volumeIndex = 0;

  /**
   * Plans the bake against the current scene.
   *
   * @param volume Modifier volume to bake.
   */
  constructor(volume: THREE.Object3D) {
    this.volume = volume;
    this.sceneRoot = modifierVolumeSceneRoot(volume);
    this.plans = modifierStackBakePlan(volume);
  }

  /**
   * Returns how many brushes the bake creates.
   *
   * @returns Created brush count.
   */
  createdCount(): number {
    return this.plans.reduce((sum, plan) => sum + plan.created.length, 0);
  }

  /** Applies the bake. */
  execute(): void {
    for (const plan of this.plans) this.applyPlan(plan);
    this.volumeParent = this.volume.parent;
    this.volumeIndex = this.volumeParent ? this.volumeParent.children.indexOf(this.volume) : 0;
    this.volume.parent?.remove(this.volume);
    modifierBevelRefreshScene(this.sceneRoot);
  }

  /** Restores the volume and the reshaped brushes, and drops created ones. */
  undo(): void {
    for (const { model, instance } of this.created.splice(0).reverse()) model.removeBrush(instance.id, false, false);
    for (const plan of this.plans)
      for (const entry of plan.replaced) modifierStackBakeShapeApply(plan.model, entry.id, entry.before);
    if (this.volumeParent) modifierStackTreeInsert(this.volumeParent, this.volume, this.volumeIndex);
    modifierBevelRefreshScene(this.sceneRoot);
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
 * them, then makes the evaluation list follow the scene.
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
    const unit = { ...creation.anchor, tree: model.root, brushes: [], authored: false };
    const anchor = modifierStackTreeAnchor(unit, nodes);
    if (!anchor || !instance.mesh) continue;
    const offset = offsets.get(anchor.key) ?? 0;
    modifierStackTreeInsert(anchor.parent, instance.mesh, anchor.index + offset);
    offsets.set(anchor.key, offset + 1);
  }
  model.syncBrushOrderFromScene();
}
