import * as THREE from 'three';
import type { SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import type { SolidOperation } from '@/solid/types/solid_operation.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import { solidScriptSolidTreeBuild } from '@/solid_script/language/solid_script_solid_tree.js';
import { SOLID_SCRIPT_USE_GENERATOR, type SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import type { ModifierStackSolidScriptBoxValues } from './modifier_stack_solid_script_box.js';
import { solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import {
  solidScriptShapeLeavesPositive,
  type SolidScriptShape,
  type SolidScriptShapeSolid,
} from '@/solid_script/language/solid_script_shape.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptMode } from '@/solid_script/language/solid_script_mode.js';
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
  /**
   * Received brushes Input Objects passed on, in the order they ran, with their
   * frame-space moves.
   */
  passed: ModifierStackSolidScriptPassed[];
  /** Problem description, or empty. */
  error: string;
}

/** A received brush that Input Objects passed on. */
export interface ModifierStackSolidScriptPassed {
  /** Index of the brush among those received. */
  index: number;
  /** Move in frame coordinates. */
  matrix: THREE.Matrix4;
  /** 'copied' moves its textures with it; 'world' keeps them where they are. */
  textures: 'copied' | 'world';
  /** False leaves lettering reversed on a mirrored copy; missing means true. */
  readable?: boolean;
  /** UV tiles added along U for this pass. */
  shiftU?: number;
  /** UV tiles added along V for this pass. */
  shiftV?: number;
  /**
   * Script-space clip plane applied before this pass, when Clip rewrote the
   * brush.
   */
  clip?: { normal: readonly [number, number, number]; constant: number };
  /**
   * CSG Mode of the brush after Set, or the Mode it arrived with; none when
   * unset.
   */
  mode?: SolidScriptMode;
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
 * @param use Where the script is used and what a modifier receives.
 * @param boxValues $Box size, pose and corners; the layout box size, plus and
 *   minus Extents and no pose when omitted.
 * @returns Nodes in frame coordinates, or an error.
 */
export function modifierStackSolidScriptLayout(
  document: SolidScriptDocument,
  placement: ModifierStackSolidScriptPlacement,
  box: THREE.Box3,
  operation: SolidOperation,
  stepLimit: number | undefined,
  inputs: Readonly<Record<string, string>> = {},
  use: SolidScriptUseFacts = SOLID_SCRIPT_USE_GENERATOR,
  boxValues?: ModifierStackSolidScriptBoxValues,
): ModifierStackSolidScriptLayout {
  try {
    const size = box.getSize(new THREE.Vector3());
    const run = {
      inputs,
      box: boxValues?.size ?? ([size.x, size.y, size.z] as const),
      ...(boxValues?.pose ? { pose: boxValues.pose } : {}),
      ...(boxValues?.corners ? { corners: boxValues.corners } : {}),
      use,
    };
    const evaluated = solidScriptProgramEvaluate(document, stepLimit === undefined ? run : { ...run, stepLimit });
    const placed = modifierStackSolidScriptPlacementMatrix(evaluated.shapes, placement, box);
    const received: SolidScriptShapeSolid[] = [];
    const shapes = modifierStackSolidScriptReceivedTake(evaluated.shapes, received);
    const passed = modifierStackSolidScriptPassedOf(received, placed, box);
    const nodes = solidScriptSolidTreeBuild(shapes, {
      offset: new THREE.Vector3(),
      worldToParent: placed,
      operation,
      namePrefix: '',
    });
    const meshes = solidScriptShapeMeshes(shapes).map((mesh) => solidScriptMeshDocumentBuild(mesh, placed));
    return { nodes, meshes, passed, error: '' };
  } catch (error) {
    return { nodes: [], meshes: [], passed: [], error: solidScriptErrorText(error) };
  }
}

/**
 * Takes the received brushes Input Objects passed on out of the shapes, also
 * from inside unions; inside a cut or an intersection they stay plain shapes.
 *
 * @param shapes Evaluated shapes.
 * @param received Collects the received brushes, in run order.
 * @returns The other shapes.
 */
function modifierStackSolidScriptReceivedTake(
  shapes: readonly SolidScriptShape[],
  received: SolidScriptShapeSolid[],
): SolidScriptShape[] {
  const rest: SolidScriptShape[] = [];
  for (const shape of shapes) {
    if (shape.kind === 'solid' && shape.received) received.push(shape);
    else if (shape.kind === 'boolean' && shape.operation === 'union') {
      const children = modifierStackSolidScriptReceivedTake(shape.children, received);
      if (children.length > 0) rest.push({ ...shape, children });
    } else rest.push(shape);
  }
  return rest;
}

/**
 * Returns the received brushes the script passed on, with their script-space
 * moves turned into frame space: script points are the received points less the
 * box centre, and come back through the placement.
 *
 * @param shapes Received brushes.
 * @param placed Placement of script results in the box.
 * @param box Box the received brushes are centred in.
 * @returns Passed brushes.
 */
function modifierStackSolidScriptPassedOf(
  shapes: readonly SolidScriptShapeSolid[],
  placed: THREE.Matrix4,
  box: THREE.Box3,
): ModifierStackSolidScriptPassed[] {
  const centre = box.getCenter(new THREE.Vector3());
  const into = new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z);
  const passed: ModifierStackSolidScriptPassed[] = [];
  for (const shape of shapes) {
    if (!shape.received) continue;
    const matrix = placed.clone().multiply(shape.received.matrix).multiply(into);
    passed.push({
      index: shape.received.index,
      matrix,
      textures: shape.received.textures,
      ...(shape.received.readable === undefined ? {} : { readable: shape.received.readable }),
      ...(shape.received.shiftU === undefined ? {} : { shiftU: shape.received.shiftU }),
      ...(shape.received.shiftV === undefined ? {} : { shiftV: shape.received.shiftV }),
      ...(shape.received.clip === undefined ? {} : { clip: shape.received.clip }),
      ...(shape.mode ? { mode: shape.mode } : {}),
    });
  }
  return passed;
}

/**
 * Returns the matrix that moves script results into the box, centred.
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
 * Measures the solid parts of a result; cut-away parts do not count.
 *
 * @param shapes Evaluated shapes.
 * @returns Bounds.
 */
function modifierStackSolidScriptBounds(shapes: readonly SolidScriptShape[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const leaf of shapes.flatMap(solidScriptShapeLeavesPositive))
    if (leaf.kind !== 'polygon') for (const point of leaf.points) bounds.expandByPoint(point);
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
