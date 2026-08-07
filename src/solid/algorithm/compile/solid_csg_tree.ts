import * as THREE from 'three';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isResultMesh, isSolidModelObject } from '@/solid/model/solid_model_keys.js';
import { getSolidGroupOperation, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import type { PreparedBrush } from './solid_compile_types.js';

/**
 * Leaf node: one prepared brush evaluated with its own CSG operation relative
 * to its parent composite.
 */
export interface SolidCsgBrushNode {
  kind: 'brush';
  /** Index into the prepared brush list. */
  preparedIndex: number;
  /** Operation of this brush relative to its parent. */
  operation: SolidOperation;
}

/**
 * Branch node: compound solid formed by combining children among themselves
 * (starting from empty), then applied to the parent with this operation.
 */
export interface SolidCsgBranchNode {
  kind: 'branch';
  /** Operation of the compound relative to its parent. */
  operation: SolidOperation;
  /** Child brush and branch nodes in tree order. */
  children: SolidCsgTreeNode[];
}

/** Hierarchical solid CSG tree node (brush leaf or compound branch). */
export type SolidCsgTreeNode = SolidCsgBrushNode | SolidCsgBranchNode;

/** Lookup tables used while building a tree from the scene graph. */
interface SolidCsgTreeBuildContext {
  /** Prepared brushes in evaluation order. */
  prepared: readonly PreparedBrush[];
  /** Brush instance id → prepared index. */
  preparedIndexByBrushId: Map<string, number>;
}

/** Hierarchical solid CSG tree of brush leaves and compound branch nodes. */
export class SolidCsgTree {
  readonly roots: readonly SolidCsgTreeNode[];
  /** True when every root is a brush (no nested compounds). */
  readonly isFlat: boolean;

  /**
   * Creates a solid CSG tree.
   *
   * @param roots Top-level nodes under the solid model root.
   */
  constructor(roots: SolidCsgTreeNode[]) {
    this.roots = roots;
    this.isFlat = roots.every((node) => node.kind === 'brush');
  }

  /**
   * Builds a flat tree from prepared brushes in list order.
   *
   * @param prepared Prepared brushes in evaluation order.
   * @returns Flat CSG tree with one root brush node per prepared entry.
   */
  static fromPreparedFlat(prepared: readonly PreparedBrush[]): SolidCsgTree {
    const roots: SolidCsgTreeNode[] = prepared.map((entry, index) => ({
      kind: 'brush' as const,
      preparedIndex: index,
      operation: entry.operation,
    }));
    return new SolidCsgTree(roots);
  }

  /**
   * Builds a hierarchical tree from the solid model scene graph. Brush meshes
   * are matched to prepared entries by instance id. Solid CSG groups become
   * branch nodes with their stored operations.
   *
   * @param solidRoot Solid model root group.
   * @param prepared Prepared brushes in DFS evaluation order.
   * @returns Hierarchical CSG tree.
   */
  static fromSceneGraph(solidRoot: THREE.Object3D, prepared: readonly PreparedBrush[]): SolidCsgTree {
    const context = SolidCsgTree.buildSceneBuildContext(prepared);
    const roots = SolidCsgTree.collectChildNodes(solidRoot, context);
    if (roots.length === 0 && prepared.length > 0) {
      return SolidCsgTree.fromPreparedFlat(prepared);
    }
    return new SolidCsgTree(roots);
  }

  /**
   * Builds lookup tables used while walking the scene graph.
   *
   * @param prepared Prepared brush list.
   * @returns Id map and prepared array for operation reads.
   */
  private static buildSceneBuildContext(prepared: readonly PreparedBrush[]): SolidCsgTreeBuildContext {
    const preparedIndexByBrushId = new Map<string, number>();
    for (let index = 0; index < prepared.length; index++) {
      const entry = prepared[index];
      if (entry) preparedIndexByBrushId.set(entry.instance.id, index);
    }
    return { prepared, preparedIndexByBrushId };
  }

  /**
   * Collects CSG tree nodes from direct children of a scene parent.
   *
   * @param parent Solid root or solid CSG group.
   * @param context Prepared lookup context.
   * @returns Ordered child tree nodes.
   */
  private static collectChildNodes(parent: THREE.Object3D, context: SolidCsgTreeBuildContext): SolidCsgTreeNode[] {
    const nodes: SolidCsgTreeNode[] = [];
    for (const child of parent.children) {
      const node = SolidCsgTree.tryBuildNode(child, context);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  /**
   * Builds a tree node from one scene child, or null when it is not a CSG
   * operand (result mesh, helpers, empty groups).
   *
   * @param child Scene child under the solid hierarchy.
   * @param context Prepared lookup context.
   * @returns Tree node or null.
   */
  private static tryBuildNode(child: THREE.Object3D, context: SolidCsgTreeBuildContext): SolidCsgTreeNode | null {
    if (isResultMesh(child) || isSolidModelObject(child)) return null;
    if (SolidBrushVisual.isBrushObject(child)) {
      return SolidCsgTree.buildBrushNode(child, context);
    }
    if (child instanceof THREE.Group && (isSolidCsgGroup(child) || SolidCsgTree.groupHasBrushDescendant(child))) {
      return SolidCsgTree.buildBranchNode(child, context);
    }
    return null;
  }

  /**
   * Builds a brush leaf from a brush preview mesh.
   *
   * @param mesh Brush mesh.
   * @param context Prepared lookup context.
   * @returns Brush node or null when the mesh is not in the prepared set.
   */
  private static buildBrushNode(mesh: THREE.Object3D, context: SolidCsgTreeBuildContext): SolidCsgBrushNode | null {
    const brushId = SolidBrushVisual.getBrushId(mesh);
    if (!brushId) return null;
    const preparedIndex = context.preparedIndexByBrushId.get(brushId);
    if (preparedIndex === undefined) return null;
    const entry = context.prepared[preparedIndex];
    if (!entry) return null;
    return { kind: 'brush', preparedIndex, operation: entry.operation };
  }

  /**
   * Builds a branch node from a solid CSG group, collecting nested children.
   *
   * @param group Solid CSG group.
   * @param context Prepared lookup context.
   * @returns Branch node, or null when it has no prepared descendants.
   */
  private static buildBranchNode(group: THREE.Group, context: SolidCsgTreeBuildContext): SolidCsgBranchNode | null {
    const children = SolidCsgTree.collectChildNodes(group, context);
    if (children.length === 0) return null;
    return {
      kind: 'branch',
      operation: getSolidGroupOperation(group),
      children,
    };
  }

  /**
   * Returns whether a group contains any solid brush mesh descendant.
   *
   * @param group Scene group.
   * @returns True when a brush mesh exists under the group.
   */
  private static groupHasBrushDescendant(group: THREE.Group): boolean {
    let found = false;
    group.traverse((object) => {
      if (found) return;
      if (SolidBrushVisual.isBrushObject(object)) found = true;
    });
    return found;
  }
}
