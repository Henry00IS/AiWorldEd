import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import type { SolidTreeBrush, SolidTreeNode } from './solid_tree_node.js';

/**
 * Creates one brush under a parent and returns the instance.
 *
 * @param node Brush node.
 * @param parent Parent to append to.
 * @returns Created instance.
 */
export type SolidTreeBrushInsert = (node: SolidTreeBrush, parent: THREE.Object3D) => SolidBrushInstance;

/**
 * Called when a CSG group is created, before its children are added.
 *
 * @param group New group, already named and marked.
 * @param parent Parent the group will be appended to.
 */
export type SolidTreeGroupInsert = (group: THREE.Group, parent: THREE.Object3D) => void;

/**
 * Creates a CSG group tree from nodes, depth-first in evaluation order. Callers
 * insert each brush and may record each group; this is the shared step used by
 * the undoable tree-add command and by Mesh From Solids when it bakes.
 *
 * @param nodes Nodes in evaluation order.
 * @param parent Parent to append to.
 * @param brushInsert Creates and parents one brush instance.
 * @param groupInsert Optional recorder for each created group.
 */
export function solidTreeNodesCreate(
  nodes: readonly SolidTreeNode[],
  parent: THREE.Object3D,
  brushInsert: SolidTreeBrushInsert,
  groupInsert?: SolidTreeGroupInsert,
): void {
  for (const node of nodes) {
    if (node.kind === 'group') {
      solidTreeGroupCreate(node, parent, brushInsert, groupInsert);
    } else {
      brushInsert(node, parent);
    }
  }
}

/**
 * Creates one CSG group and fills it with its children.
 *
 * @param node Group node.
 * @param parent Parent to append to.
 * @param brushInsert Creates and parents one brush instance.
 * @param groupInsert Optional recorder for each created group.
 */
function solidTreeGroupCreate(
  node: Extract<SolidTreeNode, { kind: 'group' }>,
  parent: THREE.Object3D,
  brushInsert: SolidTreeBrushInsert,
  groupInsert: SolidTreeGroupInsert | undefined,
): void {
  const group = new THREE.Group();
  group.name = node.name;
  markAsSolidCsgGroup(group, node.operation);
  groupInsert?.(group, parent);
  parent.add(group);
  solidTreeNodesCreate(node.children, group, brushInsert, groupInsert);
}

/**
 * Gives single faces their own texture over the brush texture.
 *
 * @param instance Brush instance.
 * @param node Source node.
 */
export function solidTreeBrushTexturesApply(instance: SolidBrushInstance, node: SolidTreeBrush): void {
  node.faceTextures?.forEach((texture, index) => {
    const face = node.brush.faces[index];
    if (texture && face) instance.setFaceTextureId(face.surfaceIndex, texture);
  });
}

/**
 * Stores the smooth shading a node gives single faces; faces of one group blend
 * with each other across brushes up to the node's largest angle.
 *
 * @param instance Brush instance.
 * @param node Source node.
 * @param group Smoothing group shared by the brushes of one insert.
 */
export function solidTreeBrushSmoothApply(instance: SolidBrushInstance, node: SolidTreeBrush, group: string): void {
  const angles = node.faceSmooth ?? [];
  const maxAngle = Math.max(0, ...angles.map((angle) => angle ?? 0));
  if (maxAngle <= 0) return;
  angles.forEach((angle, index) => {
    const face = node.brush.faces[index];
    if (angle === undefined || !face) return;
    const surface = instance.getFaceSurface(face.surfaceIndex);
    instance.setFaceSurface(face.surfaceIndex, { ...surface, smooth: { group, maxAngle, smoothClass: 0 } });
  });
}
