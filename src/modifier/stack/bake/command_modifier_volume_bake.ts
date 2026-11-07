import type * as THREE from 'three';
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
} from './modifier_stack_bake_plan.js';

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
    for (const { model, instance } of this.created.splice(0)) model.removeBrush(instance.id, false, false);
    for (const plan of this.plans)
      for (const entry of plan.replaced) modifierStackBakeShapeApply(plan.model, entry.id, entry.before);
    if (this.volumeParent) modifierStackBakeReattach(this.volumeParent, this.volume, this.volumeIndex);
    modifierBevelRefreshScene(this.sceneRoot);
  }

  /**
   * Applies one solid's part of the bake.
   *
   * @param plan Plan for one solid.
   */
  private applyPlan(plan: ModifierStackBakeModelPlan): void {
    for (const entry of plan.replaced) modifierStackBakeShapeApply(plan.model, entry.id, entry.after);
    for (const creation of plan.created) {
      const instance = plan.model.prepareTopologyBrush(creation.brush.clone(), creation.operation, creation.position);
      instance.name = hierarchyNameAllocator.allocateFromSourceName(creation.name);
      if (instance.mesh) instance.mesh.name = instance.name;
      creation.surfaces.forEach((surface, index) => instance.setFaceSurface(index, cloneFaceSurface(surface)));
      plan.model.insertBrushInstance(instance, plan.model.getBrushCount(), 2, undefined, false);
      this.created.push({ model: plan.model, instance });
    }
    plan.model.markDirty();
  }
}

/**
 * Writes a shape onto an authored brush and its preview mesh.
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
}

/**
 * Re-adds a child at its former sibling index.
 *
 * @param parent Former parent.
 * @param child Child to re-add.
 * @param index Former sibling index.
 */
function modifierStackBakeReattach(parent: THREE.Object3D, child: THREE.Object3D, index: number): void {
  parent.add(child);
  parent.children.splice(parent.children.indexOf(child), 1);
  parent.children.splice(Math.min(index, parent.children.length), 0, child);
}
