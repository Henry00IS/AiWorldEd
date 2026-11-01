import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { hierarchyOrderSeedsMarkDirty } from '@/solid/model/hierarchy/solid_hierarchy_mutation_refresh.js';

/** Placement target for solid hierarchy sibling order. */
export type SolidBrushOrderEnd = 'first' | 'last';

/** Snapshot of one parent's full child order for undo. */
interface ParentOrderSnapshot {
  parent: THREE.Object3D;
  previousChildren: THREE.Object3D[];
}

/** Snapshot of one solid model rebuild after hierarchy reorder. */
interface ModelOrderSnapshot {
  model: SolidModel;
  parentSnapshots: ParentOrderSnapshot[];
  dirtyBrushIds: string[];
}

/**
 * Undoable command that moves solid brushes and solid CSG groups to first or
 * last among siblings under their own parent. Multi-select reorders each parent
 * tree independently so nested groups do not jump in the solid root.
 *
 * CSG uses peer-local partial recompile (moved brushes + touch peers), not a
 * full map rebuild — matching touch-only iterative updates.
 */
export class CommandSolidBrushesReorder implements UndoCommand {
  private readonly sourceNodes: THREE.Object3D[];
  private readonly end: SolidBrushOrderEnd;
  private snapshots: ModelOrderSnapshot[];
  private executed: boolean;

  /**
   * Creates a hierarchy reorder command.
   *
   * @param sourceNodes Brush meshes and/or solid CSG groups to move.
   * @param end Target end among siblings under each node's parent.
   */
  constructor(sourceNodes: THREE.Object3D[], end: SolidBrushOrderEnd) {
    this.sourceNodes = sourceNodes.slice();
    this.end = end;
    this.snapshots = [];
    this.executed = false;
  }

  /** Moves each node within its parent and rebuilds affected solids. */
  execute(): void {
    if (this.executed) return;
    this.snapshots = [];
    const nodes = this.collectReorderableNodes();
    if (nodes.length === 0) return;
    const byModel = this.groupNodesByModel(nodes);
    byModel.forEach((modelNodes, model) => {
      const snapshot = this.reorderNodesForModel(model, modelNodes);
      if (snapshot) this.snapshots.push(snapshot);
    });
    this.executed = this.snapshots.length > 0;
  }

  /** Restores prior sibling order and brush evaluation order. */
  undo(): void {
    if (!this.executed) return;
    for (const snapshot of this.snapshots) {
      this.restoreModelSnapshot(snapshot);
    }
    this.snapshots = [];
    this.executed = false;
  }

  /**
   * Filters constructors inputs to brushes and solid CSG groups.
   *
   * @returns Reorderable hierarchy nodes.
   */
  private collectReorderableNodes(): THREE.Object3D[] {
    const nodes: THREE.Object3D[] = [];
    for (const node of this.sourceNodes) {
      if (SolidBrushVisual.isBrushObject(node)) {
        nodes.push(node);
        continue;
      }
      if (isSolidCsgGroup(node)) nodes.push(node);
    }
    return nodes;
  }

  /**
   * Groups reorderable nodes by owning solid model.
   *
   * @param nodes Nodes to group.
   * @returns Map of model to nodes under that solid.
   */
  private groupNodesByModel(nodes: readonly THREE.Object3D[]): Map<SolidModel, THREE.Object3D[]> {
    const byModel = new Map<SolidModel, THREE.Object3D[]>();
    for (const node of nodes) {
      const model = SolidModel.fromObject(node);
      if (!model) continue;
      const list = byModel.get(model);
      if (list) list.push(node);
      else byModel.set(model, [node]);
    }
    return byModel;
  }

  /**
   * Reorders selected nodes under each parent for one solid model.
   *
   * @param model Owning solid model.
   * @param nodes Nodes under this model.
   * @returns Snapshot when any parent changed, otherwise null.
   */
  private reorderNodesForModel(model: SolidModel, nodes: readonly THREE.Object3D[]): ModelOrderSnapshot | null {
    const byParent = this.groupNodesByParent(nodes);
    const parentSnapshots: ParentOrderSnapshot[] = [];
    let anyChanged = false;
    byParent.forEach((moving, parent) => {
      const previousChildren = parent.children.slice();
      const changed = reorderSolidContentSiblings(parent, new Set(moving), this.end);
      if (!changed) return;
      parentSnapshots.push({ parent, previousChildren });
      anyChanged = true;
    });
    if (!anyChanged) return null;
    const dirtyBrushIds = this.collectDirtySeedsForNodes(model, nodes);
    this.rebuildAfterOrderChange(model, dirtyBrushIds);
    return { model, parentSnapshots, dirtyBrushIds };
  }

  /**
   * Collects brush ids under moved brushes and groups (seeds for partial CSG).
   *
   * @param model Solid model.
   * @param nodes Moved hierarchy nodes.
   * @returns Brush instance ids.
   */
  private collectDirtySeedsForNodes(model: SolidModel, nodes: readonly THREE.Object3D[]): string[] {
    const ids = new Set<string>();
    for (const node of nodes) {
      this.collectBrushIdsUnderNode(model, node, ids);
    }
    return Array.from(ids);
  }

  /**
   * Adds brush ids for a brush mesh or every brush under a solid CSG group.
   *
   * @param model Solid model.
   * @param node Brush mesh or solid CSG group.
   * @param ids Accumulator set.
   */
  private collectBrushIdsUnderNode(model: SolidModel, node: THREE.Object3D, ids: Set<string>): void {
    if (SolidBrushVisual.isBrushObject(node) && node instanceof THREE.Mesh) {
      const brush = model.findBrushByMesh(node);
      if (brush) {
        ids.add(brush.id);
      }
      return;
    }
    if (!isSolidCsgGroup(node)) {
      return;
    }
    node.traverse((child) => {
      if (!SolidBrushVisual.isBrushObject(child) || !(child instanceof THREE.Mesh)) {
        return;
      }
      const brush = model.findBrushByMesh(child);
      if (brush) {
        ids.add(brush.id);
      }
    });
  }

  /**
   * Expands seeds with cached touch peers, clears routing tables, and runs a
   * partial CSG rebuild.
   *
   * @param model Solid model.
   * @param seedBrushIds Moved brush ids.
   */
  private rebuildAfterOrderChange(model: SolidModel, seedBrushIds: readonly string[]): void {
    hierarchyOrderSeedsMarkDirty(model, seedBrushIds);
    model.rebuild(true, { skipEdgeBatchRefresh: true });
  }

  /**
   * Groups nodes by their current parent.
   *
   * @param nodes Nodes to group.
   * @returns Map of parent to child nodes (scene order preserved).
   */
  private groupNodesByParent(nodes: readonly THREE.Object3D[]): Map<THREE.Object3D, THREE.Object3D[]> {
    const byParent = new Map<THREE.Object3D, THREE.Object3D[]>();
    for (const node of nodes) {
      const parent = node.parent;
      if (!parent) continue;
      const list = byParent.get(parent);
      if (list) list.push(node);
      else byParent.set(parent, [node]);
    }
    return byParent;
  }

  /**
   * Restores parent child order then resyncs CSG evaluation from the scene.
   * Hierarchy restore is authoritative so root-level brush reordering cannot
   * shove groups around again.
   *
   * @param snapshot Model undo snapshot.
   */
  private restoreModelSnapshot(snapshot: ModelOrderSnapshot): void {
    for (const parentSnapshot of snapshot.parentSnapshots) {
      restoreParentChildren(parentSnapshot.parent, parentSnapshot.previousChildren);
    }
    this.rebuildAfterOrderChange(snapshot.model, snapshot.dirtyBrushIds);
  }
}

/**
 * Returns whether a child participates in solid hierarchy sibling order.
 *
 * @param object Scene child under a solid root or CSG group.
 * @returns True for solid brushes and solid CSG groups.
 */
function isSolidHierarchyContent(object: THREE.Object3D): boolean {
  return SolidBrushVisual.isBrushObject(object) || isSolidCsgGroup(object);
}

/**
 * Moves selected content siblings to the first or last content slots under a
 * parent without moving non-content children (result mesh, edge batches).
 *
 * @param parent Parent whose children are reordered.
 * @param moving Set of content nodes to move.
 * @param end First or last among content siblings.
 * @returns True when the child order changed.
 */
export function reorderSolidContentSiblings(
  parent: THREE.Object3D,
  moving: ReadonlySet<THREE.Object3D>,
  end: SolidBrushOrderEnd,
): boolean {
  const children = parent.children.slice();
  const content = children.filter(isSolidHierarchyContent);
  const movingOrdered = content.filter((child) => moving.has(child));
  if (movingOrdered.length === 0) return false;
  const remaining = content.filter((child) => !moving.has(child));
  const nextContent = end === 'first' ? movingOrdered.concat(remaining) : remaining.concat(movingOrdered);
  if (!contentOrderDiffers(content, nextContent)) return false;
  const nextChildren = buildChildrenWithReorderedContent(children, nextContent);
  applyParentChildren(parent, nextChildren);
  return true;
}

/**
 * Returns whether two content lists differ in order.
 *
 * @param before Content order before reorder.
 * @param after Content order after reorder.
 * @returns True when any position differs.
 */
function contentOrderDiffers(before: readonly THREE.Object3D[], after: readonly THREE.Object3D[]): boolean {
  if (before.length !== after.length) return true;
  return before.some((child, index) => child !== after[index]);
}

/**
 * Rebuilds the full children list by replacing the content subsequence with a
 * new content order while keeping non-content children in place.
 *
 * @param children Original parent children.
 * @param nextContent Reordered content siblings.
 * @returns Full next children array.
 */
function buildChildrenWithReorderedContent(
  children: readonly THREE.Object3D[],
  nextContent: readonly THREE.Object3D[],
): THREE.Object3D[] {
  const nextChildren: THREE.Object3D[] = [];
  let contentInserted = false;
  for (const child of children) {
    if (isSolidHierarchyContent(child)) {
      if (!contentInserted) {
        nextChildren.push(...nextContent);
        contentInserted = true;
      }
      continue;
    }
    nextChildren.push(child);
  }
  if (!contentInserted) nextChildren.push(...nextContent);
  return nextChildren;
}

/**
 * Replaces a parent's children array with an ordered list.
 *
 * @param parent Parent object.
 * @param nextChildren Desired children in order.
 */
function applyParentChildren(parent: THREE.Object3D, nextChildren: readonly THREE.Object3D[]): void {
  parent.children.length = 0;
  for (const child of nextChildren) {
    parent.children.push(child);
    child.parent = parent;
  }
}

/**
 * Restores a parent's children to a previous order snapshot.
 *
 * @param parent Parent object.
 * @param previousChildren Previous children order.
 */
function restoreParentChildren(parent: THREE.Object3D, previousChildren: readonly THREE.Object3D[]): void {
  applyParentChildren(parent, previousChildren);
}
