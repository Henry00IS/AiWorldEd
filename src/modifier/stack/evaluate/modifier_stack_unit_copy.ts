import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from './modifier_stack_context.js';
import { modifierStackCopyBrush, type ModifierStackUvPolicy } from './modifier_stack_copy.js';

/**
 * Copies a whole unit, keeping its group hierarchy so compounds stay compounds.
 *
 * @param unit Unit to copy.
 * @param modelTransform Operator acting on model coordinates.
 * @param index Copy index, used in derived ids.
 * @param policy Texture placement policy.
 * @param context Evaluation context.
 * @returns Derived unit parented to the staging group.
 */
export function modifierStackUnitCopy(
  unit: ModifierStackUnit,
  modelTransform: THREE.Matrix4,
  index: number,
  policy: ModifierStackUvPolicy,
  context: ModifierStackContext,
): ModifierStackUnit {
  const brushes: SolidBrushInstance[] = [];
  const job = { unit, modelTransform, index, policy, context, brushes };
  const tree = modifierStackNodeCopy(unit.tree, job);
  context.staging.add(tree);
  tree.updateMatrixWorld(true);
  return { tree, brushes, authored: false, origin: unit.origin };
}

/** Shared state of one unit copy. */
interface ModifierStackCopyJob {
  unit: ModifierStackUnit;
  modelTransform: THREE.Matrix4;
  index: number;
  policy: ModifierStackUvPolicy;
  context: ModifierStackContext;
  brushes: SolidBrushInstance[];
}

/**
 * Copies one node: a brush mesh becomes a derived brush, a group becomes a
 * group of copies.
 *
 * @param node Node of the unit tree.
 * @param job Copy state.
 * @returns Copied node.
 */
function modifierStackNodeCopy(node: THREE.Object3D, job: ModifierStackCopyJob): THREE.Object3D {
  const source = job.unit.brushes.find((brush) => brush.mesh === node);
  if (source) return modifierStackBrushNodeCopy(source, job);
  const group = new THREE.Group();
  group.userData = { ...node.userData };
  group.name = node.name;
  for (const child of node.children) {
    if (modifierStackNodeHoldsBrush(child, job.unit)) group.add(modifierStackNodeCopy(child, job));
  }
  return group;
}

/**
 * Copies one brush of the unit and records it.
 *
 * @param source Brush to copy.
 * @param job Copy state.
 * @returns Mesh of the copy.
 */
function modifierStackBrushNodeCopy(source: SolidBrushInstance, job: ModifierStackCopyJob): THREE.Object3D {
  const { context } = job;
  const id = `${source.id}#${context.volume.uuid}:${context.step.id}:${job.index}`;
  const matrix = job.modelTransform.clone().multiply(source.getModelSpaceMatrix());
  const copy = modifierStackCopyBrush(source, matrix, id, job.policy);
  context.records.normalsInherit(id, source.id);
  job.brushes.push(copy);
  return copy.mesh ?? new THREE.Group();
}

/**
 * Returns whether a node is, or contains, a brush of the unit.
 *
 * @param node Candidate node.
 * @param unit Unit being copied.
 * @returns True when the node leads to at least one brush.
 */
function modifierStackNodeHoldsBrush(node: THREE.Object3D, unit: ModifierStackUnit): boolean {
  return unit.brushes.some((brush) => {
    let current: THREE.Object3D | null = brush.mesh ?? null;
    while (current) {
      if (current === node) return true;
      current = current.parent;
    }
    return false;
  });
}
