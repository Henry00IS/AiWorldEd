import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { getSolidGroupOperation, isSolidCsgGroup, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import type { SolidOperation } from '@/solid/types/solid_operation.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackTreeInsert } from '@/modifier/stack/evaluate/modifier_stack_tree.js';

/** CSG group a baked brush is placed in, shared by every brush of the group. */
export interface ModifierStackBakeGroup {
  /** Group name. */
  name: string;
  /** Group operation. */
  operation: SolidOperation;
}

/** A created brush with the groups it is placed in, outermost first. */
export interface ModifierStackBakeGroupPlacement {
  /** Created brush. */
  instance: SolidBrushInstance;
  /** Groups around it, outermost first. */
  groups: readonly ModifierStackBakeGroup[];
}

/**
 * Lists, per brush id, the CSG groups of a unit around each of its brushes,
 * outermost first, so baking keeps the unit's group structure.
 *
 * @param unit Derived unit.
 * @returns Groups per brush id; brushes outside any group map to none.
 */
export function modifierStackBakeGroupChains(unit: ModifierStackUnit): Map<string, ModifierStackBakeGroup[]> {
  const shared = new Map<THREE.Object3D, ModifierStackBakeGroup>();
  const chains = new Map<string, ModifierStackBakeGroup[]>();
  for (const brush of unit.brushes) {
    const nodes = modifierStackBakeGroupNodes(brush.mesh, unit.tree);
    chains.set(
      brush.id,
      nodes.map((node) => modifierStackBakeGroupShared(node, shared)),
    );
  }
  return chains;
}

/**
 * Returns the CSG groups between a brush mesh and the top of its unit tree.
 *
 * @param mesh Brush mesh, or null.
 * @param tree Unit tree.
 * @returns Groups, outermost first; none when the mesh is outside the tree.
 */
function modifierStackBakeGroupNodes(mesh: THREE.Object3D | null, tree: THREE.Object3D): THREE.Object3D[] {
  const nodes: THREE.Object3D[] = [];
  for (let node = mesh?.parent ?? null; node; node = node.parent) {
    if (isSolidCsgGroup(node)) nodes.unshift(node);
    if (node === tree) return nodes;
  }
  return [];
}

/**
 * Returns the bake group of a derived group, creating it once.
 *
 * @param node Derived CSG group.
 * @param shared Bake groups made so far.
 * @returns Bake group.
 */
function modifierStackBakeGroupShared(
  node: THREE.Object3D,
  shared: Map<THREE.Object3D, ModifierStackBakeGroup>,
): ModifierStackBakeGroup {
  let group = shared.get(node);
  if (!group) shared.set(node, (group = { name: node.name, operation: getSolidGroupOperation(node) }));
  return group;
}

/**
 * Moves created brushes into their CSG groups, creating each group on first use
 * where its first brush stands, so order and nesting match the live result.
 * Groups made on an earlier run are reused, keeping their identity across
 * redo.
 *
 * @param placements Created brushes in output order.
 * @param made Scene group per bake group, filled as groups are created.
 */
export function modifierStackBakeGroupsPlace(
  placements: readonly ModifierStackBakeGroupPlacement[],
  made: Map<ModifierStackBakeGroup, THREE.Group>,
): void {
  for (const { instance, groups } of placements) {
    const mesh = instance.mesh;
    let parent = mesh?.parent;
    if (!mesh || !parent || groups.length === 0) continue;
    let index = parent.children.indexOf(mesh);
    for (const group of groups) {
      const node = modifierStackBakeGroupNode(group, made);
      if (!node.parent) modifierStackTreeInsert(parent, node, index);
      parent = node;
      index = node.children.length;
    }
    parent.add(mesh);
  }
}

/**
 * Returns the scene group of a bake group, creating it once.
 *
 * @param group Bake group.
 * @param made Scene group per bake group.
 * @returns Scene group.
 */
function modifierStackBakeGroupNode(
  group: ModifierStackBakeGroup,
  made: Map<ModifierStackBakeGroup, THREE.Group>,
): THREE.Group {
  let node = made.get(group);
  if (node) return node;
  node = new THREE.Group();
  node.name = group.name;
  markAsSolidCsgGroup(node, group.operation);
  made.set(group, node);
  return node;
}
