import * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidTreeBrush, SolidTreeNode } from './solid_tree_node.js';
import { solidTreeBrushTexturesApply, solidTreeNodesCreate } from './solid_tree_nodes_create.js';

/** One inserted object and the parent it was appended to, in insert order. */
type SolidTreeInsert =
  | { parent: THREE.Object3D; group: THREE.Group; instance?: undefined }
  | { parent: THREE.Object3D; instance: SolidBrushInstance; group?: undefined };

/**
 * Undoable command that appends a subtree of CSG groups and convex brushes to a
 * solid model and compiles once. Undo removes everything it added; redo
 * re-inserts the same objects in the same order.
 */
export class CommandSolidTreeAdd implements UndoCommand {
  private readonly inserts: SolidTreeInsert[] = [];
  private executed = false;

  /**
   * Creates the command.
   *
   * @param model Solid model that receives the subtree.
   * @param nodes Top-level nodes in evaluation order.
   * @param parent Solid root or CSG group of the model to append under.
   */
  constructor(
    private readonly model: SolidModel,
    private readonly nodes: readonly SolidTreeNode[],
    private readonly parent: THREE.Object3D = model.root,
  ) {}

  /** Inserts the subtree, or re-inserts it on redo. */
  execute(): void {
    if (this.executed) return;
    if (this.inserts.length === 0) this.nodesCreate(this.nodes, this.parent);
    else this.insertsReplay();
    this.model.rebuild(true);
    this.executed = true;
  }

  /** Removes every inserted brush and group. */
  undo(): void {
    if (!this.executed) return;
    for (const insert of [...this.inserts].reverse()) {
      if (insert.instance) this.model.removeBrush(insert.instance.id, false, false);
      else insert.group.removeFromParent();
    }
    this.model.rebuild(true);
    this.executed = false;
  }

  /**
   * Returns the top-level objects this command inserted.
   *
   * @returns Groups and brush meshes directly under the target parent.
   */
  getRootObjects(): THREE.Object3D[] {
    return this.inserts
      .filter((insert) => insert.parent === this.parent)
      .flatMap((insert): THREE.Object3D[] =>
        insert.group ? [insert.group] : insert.instance.mesh ? [insert.instance.mesh] : [],
      );
  }

  /**
   * Returns every brush this command inserted.
   *
   * @returns Brush instances in evaluation order.
   */
  getBrushes(): SolidBrushInstance[] {
    return this.inserts.flatMap((insert) => (insert.instance ? [insert.instance] : []));
  }

  /**
   * Creates nodes under a parent depth-first.
   *
   * @param nodes Nodes in evaluation order.
   * @param parent Parent to append to.
   */
  private nodesCreate(nodes: readonly SolidTreeNode[], parent: THREE.Object3D): void {
    solidTreeNodesCreate(
      nodes,
      parent,
      (node, host) => this.brushInsert(node, host),
      (group, host) => this.inserts.push({ parent: host, group }),
    );
  }

  /**
   * Prepares one brush, records it, and inserts it under a parent.
   *
   * @param node Brush node.
   * @param parent Parent to append to.
   * @returns Inserted instance.
   */
  private brushInsert(node: SolidTreeBrush, parent: THREE.Object3D): SolidBrushInstance {
    const instance = this.model.prepareTopologyBrush(node.brush, node.operation, node.center, node.texture, node.name);
    solidTreeBrushTexturesApply(instance, node);
    this.inserts.push({ parent, instance });
    this.model.addBrushInstanceAfter(instance, parent, null, false);
    return instance;
  }

  /** Re-inserts recorded objects in their original order. */
  private insertsReplay(): void {
    for (const insert of this.inserts) {
      if (insert.group) {
        insert.parent.add(insert.group);
      } else {
        insert.instance.pushTransformToMesh();
        this.model.addBrushInstanceAfter(insert.instance, insert.parent, null, false);
      }
    }
  }
}
