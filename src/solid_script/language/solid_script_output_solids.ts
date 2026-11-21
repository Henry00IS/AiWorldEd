import {
  solidScriptShapeIsLeaf,
  solidScriptShapeNested,
  type SolidScriptShape,
  type SolidScriptShapeLeaf,
} from './solid_script_shape.js';
import type { SolidScriptEvaluation } from './solid_script_machine_types.js';

/** How many solids and meshes a run placed, and how many it processed. */
export interface SolidScriptOutputStats {
  /** Solids in the result. */
  solids: number;
  /** Meshes in the result. */
  meshes: number;
  /** Solids the script created or handled, including in-memory ones. */
  processedSolids: number;
  /** Meshes the script created or handled, including in-memory ones. */
  processedMeshes: number;
}

/**
 * Lists every leaf in a shape tree, including those inside cuts, so a result
 * line can count what the script placed.
 *
 * @param shapes Shapes.
 * @returns Leaves, in tree order.
 */
export function solidScriptOutputLeaves(shapes: readonly SolidScriptShape[]): SolidScriptShapeLeaf[] {
  return shapes.flatMap(solidScriptOutputLeaf);
}

/**
 * Lists the leaves of one shape, including those inside cuts.
 *
 * @param shape Shape.
 * @returns Leaves.
 */
function solidScriptOutputLeaf(shape: SolidScriptShape): SolidScriptShapeLeaf[] {
  if (solidScriptShapeIsLeaf(shape)) return [shape];
  return (solidScriptShapeNested(shape) ?? []).flatMap(solidScriptOutputLeaf);
}

/**
 * Counts the solids and meshes a run placed, together with how many it
 * processed.
 *
 * @param shapes Result shapes.
 * @param processedSolids Solids created or handled.
 * @param processedMeshes Meshes created or handled.
 * @returns Counts for the result line.
 */
export function solidScriptOutputStats(
  shapes: readonly SolidScriptShape[],
  processedSolids: number,
  processedMeshes: number,
): SolidScriptOutputStats {
  let solids = 0;
  let meshes = 0;
  for (const leaf of solidScriptOutputLeaves(shapes)) {
    if (leaf.kind === 'solid') solids += 1;
    else if (leaf.kind === 'mesh') meshes += 1;
  }
  return { solids, meshes, processedSolids, processedMeshes };
}

/**
 * Writes a run time with no trailing zeros, as in "7.5 ms".
 *
 * @param ms Time in milliseconds.
 * @returns Time text.
 */
export function solidScriptOutputTime(ms: number): string {
  return `${ms.toFixed(5).replace(/\.?(0+)$/, '')} ms`;
}

/**
 * Writes the result line of a run: what it placed, what it processed when that
 * differs, and how long it took.
 *
 * @param run Run result.
 * @returns Text such as "1 mesh (4 solids, 1 mesh processed, 7.5 ms)".
 */
export function solidScriptOutputLine(
  run: Pick<SolidScriptEvaluation, 'shapes' | 'ms' | 'paused' | 'processedSolids' | 'processedMeshes'>,
): string {
  return solidScriptOutputSolids(
    solidScriptOutputStats(run.shapes, run.processedSolids, run.processedMeshes),
    run.ms,
    run.paused !== null,
  );
}

/**
 * Writes how many solids and meshes a run placed and processed, and how long it
 * took.
 *
 * @param stats Placement and processed counts.
 * @param ms Time the script run took, in milliseconds.
 * @param paused True when the run stopped early, such as at a breakpoint.
 * @returns Text such as "1 mesh (4 solids, 1 mesh processed, 7.5 ms)".
 */
export function solidScriptOutputSolids(stats: SolidScriptOutputStats, ms: number, paused = false): string {
  const soFar = paused ? ' so far' : '';
  return `${solidScriptOutputPlaced(stats)}${soFar} (${solidScriptOutputHandled(stats)}${solidScriptOutputTime(ms)})`;
}

/**
 * Writes what a run placed: solids when any were placed, meshes as well when
 * any were placed, and meshes alone when only meshes were placed.
 *
 * @param stats Placement counts.
 * @returns Text such as "5 solids", "1 mesh" or "3 solids, 1 mesh".
 */
function solidScriptOutputPlaced(stats: SolidScriptOutputStats): string {
  if (stats.solids > 0 && stats.meshes > 0)
    return `${solidScriptOutputCount(stats.solids, 'solid')}, ${solidScriptOutputCount(stats.meshes, 'mesh')}`;
  if (stats.solids === 0 && stats.meshes > 0) return solidScriptOutputCount(stats.meshes, 'mesh');
  return solidScriptOutputCount(stats.solids, 'solid');
}

/**
 * Writes what the script processed, when that differs from what it placed.
 *
 * @param stats Placement and processed counts.
 * @returns Text such as "4 solids, 1 mesh processed, ", or empty.
 */
function solidScriptOutputHandled(stats: SolidScriptOutputStats): string {
  if (stats.processedSolids === stats.solids && stats.processedMeshes === stats.meshes) return '';
  const parts: string[] = [];
  if (stats.processedSolids > 0) parts.push(solidScriptOutputCount(stats.processedSolids, 'solid'));
  if (stats.processedMeshes > 0) parts.push(solidScriptOutputCount(stats.processedMeshes, 'mesh'));
  return parts.length === 0 ? '' : `${parts.join(', ')} processed, `;
}

/**
 * Writes a counted noun with the correct singular or plural form.
 *
 * @param count How many.
 * @param singular Singular noun, such as "solid" or "mesh".
 * @returns Text such as "1 mesh" or "4 solids".
 */
function solidScriptOutputCount(count: number, singular: string): string {
  const plural = singular === 'mesh' ? 'meshes' : `${singular}s`;
  return `${count} ${count === 1 ? singular : plural}`;
}
