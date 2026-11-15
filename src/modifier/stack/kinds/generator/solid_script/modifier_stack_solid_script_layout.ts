import * as THREE from 'three';
import type { SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import type { SolidOperation } from '@/solid/types/solid_operation.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import { solidScriptSolidTreeBuild } from '@/solid_script/language/solid_script_solid_tree.js';
import { solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import { solidScriptShapeLeavesPositive, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptDocumentSource } from '@/solid_script/document/solid_script_document_source.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';

/**
 * How script metres map into the generator box: 'origin' puts the script origin
 * at the bottom centre of the box unscaled, 'fit' scales the result evenly to
 * fit the box, 'stretch' fills the box on every axis.
 */
export type ModifierStackSolidScriptPlacement = 'origin' | 'fit' | 'stretch';

/** What a script builds inside a box. */
export interface ModifierStackSolidScriptLayout {
  /** Brushes and groups in frame coordinates, in CSG order. */
  nodes: SolidTreeNode[];
  /** Problem description, or empty. */
  error: string;
}

/**
 * Evaluates a script and lays its result out in the box.
 *
 * @param document Script.
 * @param placement Box mapping.
 * @param box Generator box in frame coordinates.
 * @param operation Operation of the top-level results.
 * @param stepLimit Primitive steps to build, or undefined for all.
 * @returns Nodes in frame coordinates, or an error.
 */
export function modifierStackSolidScriptLayout(
  document: SolidScriptDocument,
  placement: ModifierStackSolidScriptPlacement,
  box: THREE.Box3,
  operation: SolidOperation,
  stepLimit: number | undefined,
): ModifierStackSolidScriptLayout {
  try {
    const source = solidScriptDocumentSource(document);
    const { shapes } = solidScriptProgramEvaluate(source, stepLimit === undefined ? {} : { stepLimit });
    const nodes = solidScriptSolidTreeBuild(shapes, {
      upAxis: 'z',
      offset: new THREE.Vector3(),
      worldToParent: modifierStackSolidScriptPlacementMatrix(shapes, placement, box),
      operation,
      namePrefix: '',
    });
    return { nodes, error: '' };
  } catch (error) {
    return { nodes: [], error: solidScriptErrorText(error) };
  }
}

/**
 * Returns the matrix that moves script results, already turned Y-up, into the
 * box.
 *
 * @param shapes Evaluated shapes.
 * @param placement Box mapping.
 * @param box Generator box.
 * @returns Matrix.
 */
function modifierStackSolidScriptPlacementMatrix(
  shapes: readonly SolidScriptShape[],
  placement: ModifierStackSolidScriptPlacement,
  box: THREE.Box3,
): THREE.Matrix4 {
  const floor = modifierStackSolidScriptBottomCentre(box);
  const toFloor = new THREE.Matrix4().makeTranslation(floor.x, floor.y, floor.z);
  if (placement === 'origin') return toFloor;
  const bounds = modifierStackSolidScriptBounds(shapes);
  if (bounds.isEmpty()) return toFloor;
  const scale = modifierStackSolidScriptScale(bounds, box, placement === 'fit');
  const base = modifierStackSolidScriptBottomCentre(bounds);
  return toFloor
    .multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z))
    .multiply(new THREE.Matrix4().makeTranslation(-base.x, -base.y, -base.z));
}

/**
 * Returns the centre of the bottom face of a box.
 *
 * @param box Box.
 * @returns Point.
 */
function modifierStackSolidScriptBottomCentre(box: THREE.Box3): THREE.Vector3 {
  const centre = box.getCenter(new THREE.Vector3());
  return centre.setY(box.min.y);
}

/**
 * Measures the solid parts of a result in Y-up coordinates; cut-away parts do
 * not count.
 *
 * @param shapes Evaluated shapes.
 * @returns Bounds.
 */
function modifierStackSolidScriptBounds(shapes: readonly SolidScriptShape[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const leaf of shapes.flatMap(solidScriptShapeLeavesPositive))
    if (leaf.kind === 'solid')
      for (const point of leaf.points) bounds.expandByPoint(new THREE.Vector3(point.x, point.z, -point.y));
  return bounds;
}

/**
 * Returns the per-axis factors that size bounds to the box.
 *
 * @param bounds Result bounds.
 * @param box Generator box.
 * @param even True keeps proportions, using the smallest factor on every axis.
 * @returns Factors; flat axes keep 1.
 */
function modifierStackSolidScriptScale(bounds: THREE.Box3, box: THREE.Box3, even: boolean): THREE.Vector3 {
  const from = bounds.getSize(new THREE.Vector3());
  const to = box.getSize(new THREE.Vector3());
  const factors = [from.x, from.y, from.z].map((size, axis) => (size > 1e-9 ? to.getComponent(axis) / size : 1));
  if (!even) return new THREE.Vector3(...(factors as [number, number, number]));
  return new THREE.Vector3().setScalar(Math.min(...factors));
}
