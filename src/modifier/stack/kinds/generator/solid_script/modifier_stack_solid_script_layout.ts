import * as THREE from 'three';
import type { SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import type { SolidOperation } from '@/solid/types/solid_operation.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import { solidScriptSolidTreeBuild } from '@/solid_script/language/solid_script_solid_tree.js';
import { solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import { solidScriptShapeLeavesPositive, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';
import {
  solidScriptMeshDocumentBuild,
  type SolidScriptMeshDocument,
} from '@/solid_script/output/solid_script_mesh_document.js';

/**
 * How script metres map into the generator box: 'origin' puts the script origin
 * at the centre of the box unscaled, 'fit' scales the result evenly to fit the
 * box, 'stretch' fills the box on every axis; both centre the result in the
 * box.
 */
export type ModifierStackSolidScriptPlacement = 'origin' | 'fit' | 'stretch';

/** What a script builds inside a box. */
export interface ModifierStackSolidScriptLayout {
  /** Brushes and groups in frame coordinates, in CSG order. */
  nodes: SolidTreeNode[];
  /** Meshes the script built, in frame coordinates. */
  meshes: SolidScriptMeshDocument[];
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
 * @param inputs Values of the script's Input lines, as text by name.
 * @returns Nodes in frame coordinates, or an error.
 */
export function modifierStackSolidScriptLayout(
  document: SolidScriptDocument,
  placement: ModifierStackSolidScriptPlacement,
  box: THREE.Box3,
  operation: SolidOperation,
  stepLimit: number | undefined,
  inputs: Readonly<Record<string, string>> = {},
): ModifierStackSolidScriptLayout {
  try {
    const { shapes } = solidScriptProgramEvaluate(
      document,
      stepLimit === undefined ? { inputs } : { stepLimit, inputs },
    );
    const placed = modifierStackSolidScriptPlacementMatrix(shapes, placement, box);
    const nodes = solidScriptSolidTreeBuild(shapes, {
      upAxis: 'z',
      offset: new THREE.Vector3(),
      worldToParent: placed,
      operation,
      namePrefix: '',
    });
    const meshes = solidScriptShapeMeshes(shapes).map((mesh) => solidScriptMeshDocumentBuild(mesh, 'z', placed));
    return { nodes, meshes, error: '' };
  } catch (error) {
    return { nodes: [], meshes: [], error: solidScriptErrorText(error) };
  }
}

/**
 * Returns the matrix that moves script results, already turned Y-up, into the
 * box, centred.
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
  const centre = box.getCenter(new THREE.Vector3());
  const toCentre = new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z);
  if (placement === 'origin') return toCentre;
  const bounds = modifierStackSolidScriptBounds(shapes);
  if (bounds.isEmpty()) return toCentre;
  const scale = modifierStackSolidScriptScale(bounds, box, placement === 'fit');
  const middle = bounds.getCenter(new THREE.Vector3());
  return toCentre
    .multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z))
    .multiply(new THREE.Matrix4().makeTranslation(-middle.x, -middle.y, -middle.z));
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
    if (leaf.kind !== 'polygon')
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
