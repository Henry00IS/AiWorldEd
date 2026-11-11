import * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import {
  hierarchyDuplicateClone,
  type HierarchyDuplicateCreated,
} from '@/outliner/hierarchy/hierarchy_duplicate_clone.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { sortObjectsBySceneOrder } from '@/utils/utils_hierarchy.js';

/** A copied brush mesh and where it sat inside its copy, for redo. */
interface CommandHierarchyDuplicateBrushSlot {
  instance: SolidBrushInstance;
  parent: THREE.Object3D;
  index: number;
}

/**
 * Undoable Duplicate of any hierarchy nodes: brushes, CSG groups, generators,
 * modifier volumes, meshes, plain groups and whole solid models, each with all
 * of its content. Every copy lands right after its source under the same
 * parent. Undo removes everything the copy made in one step; redo puts the very
 * same objects back.
 */
export class CommandHierarchyDuplicate implements UndoCommand {
  private readonly sources: THREE.Object3D[];
  private readonly offset: THREE.Vector3;
  private pairs: { source: THREE.Object3D; clone: THREE.Object3D }[] = [];
  private created: HierarchyDuplicateCreated = { brushes: new Map(), volumes: false };
  private slots = new Map<SolidModel, CommandHierarchyDuplicateBrushSlot[]>();
  private executed = false;

  /**
   * Creates the command.
   *
   * @param sources Hierarchy roots to copy (no node inside another).
   * @param offset Position offset applied to each copy.
   */
  constructor(sources: readonly THREE.Object3D[], offset: THREE.Vector3) {
    this.sources = sortObjectsBySceneOrder(sources.filter((source) => source.parent !== null));
    this.offset = offset.clone();
  }

  /** Copies every source on first run; later runs restore the same copies. */
  execute(): void {
    if (this.executed) return;
    if (this.pairs.length === 0) this.copySources();
    else this.restoreCopies();
    this.refresh();
    this.executed = true;
  }

  /** Removes every copy and unregisters its brushes. */
  undo(): void {
    if (!this.executed) return;
    this.slots = this.brushSlotsCapture();
    this.slots.forEach((slots, model) => {
      for (const slot of slots) model.removeBrush(slot.instance.id, false, false);
    });
    for (const pair of this.pairs) pair.clone.removeFromParent();
    this.refresh();
    this.executed = false;
  }

  /**
   * Returns the copies in the order of {@link getSources}.
   *
   * @returns Copied roots.
   */
  getClones(): THREE.Object3D[] {
    return this.pairs.map((pair) => pair.clone);
  }

  /**
   * Returns the copied sources in scene order.
   *
   * @returns Source roots.
   */
  getSources(): THREE.Object3D[] {
    return this.pairs.map((pair) => pair.source);
  }

  /** Copies each source right after itself. */
  private copySources(): void {
    for (const source of this.sources) {
      const parent = source.parent!;
      const clone = hierarchyDuplicateClone(source, parent, this.offset, this.created);
      if (clone === null) continue;
      commandHierarchyDuplicatePlaceAfter(clone, source);
      this.pairs.push({ source, clone });
    }
    this.created.brushes.forEach((instances, model) => model.adoptPlacedBrushes(instances));
  }

  /** Puts the copies and their brushes back where undo took them from. */
  private restoreCopies(): void {
    for (const pair of this.pairs) commandHierarchyDuplicatePlaceAfter(pair.clone, pair.source);
    this.slots.forEach((slots, model) => {
      for (const slot of slots) {
        const mesh = slot.instance.mesh!;
        slot.parent.add(mesh);
        slot.parent.children.splice(slot.parent.children.indexOf(mesh), 1);
        slot.parent.children.splice(slot.index, 0, mesh);
      }
      model.adoptPlacedBrushes(slots.map((slot) => slot.instance));
    });
  }

  /**
   * Records where each copied brush mesh sits, before undo detaches it.
   *
   * @returns Slots per model, in sibling order.
   */
  private brushSlotsCapture(): Map<SolidModel, CommandHierarchyDuplicateBrushSlot[]> {
    const slots = new Map<SolidModel, CommandHierarchyDuplicateBrushSlot[]>();
    this.created.brushes.forEach((instances, model) => {
      const list = instances.map((instance) => {
        const parent = instance.mesh!.parent!;
        return { instance, parent, index: parent.children.indexOf(instance.mesh!) };
      });
      slots.set(
        model,
        list.sort((left, right) => left.index - right.index),
      );
    });
    return slots;
  }

  /** Rebuilds the models that gained or lost brushes, then the modifiers. */
  private refresh(): void {
    this.created.brushes.forEach((_instances, model) => model.rebuild());
    if (!this.created.volumes) return;
    const root = this.sources[0];
    if (root) modifierBevelRefreshScene(commandHierarchyDuplicateSceneRoot(root));
  }
}

/**
 * Moves an object right after a sibling under that sibling's parent.
 *
 * @param object Object to place.
 * @param sibling Sibling to follow.
 */
function commandHierarchyDuplicatePlaceAfter(object: THREE.Object3D, sibling: THREE.Object3D): void {
  const parent = sibling.parent;
  if (!parent) return;
  if (object.parent !== parent) parent.add(object);
  parent.children.splice(parent.children.indexOf(object), 1);
  parent.children.splice(parent.children.indexOf(sibling) + 1, 0, object);
}

/**
 * Walks to the top of a parent chain.
 *
 * @param object Start object.
 * @returns Root object.
 */
function commandHierarchyDuplicateSceneRoot(object: THREE.Object3D): THREE.Object3D {
  let current = object;
  while (current.parent) current = current.parent;
  return current;
}
