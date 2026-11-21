import type { SolidScriptGathering, SolidScriptGatherKind } from './solid_script_machine_types.js';

/**
 * Fails when a shape is built among the Point lines of a Polyhedron or Polygon;
 * a Hull may wrap both points and brushes.
 *
 * @param gathering Open gathering blocks, innermost last.
 * @param label Command of the shape being built.
 */
export function solidScriptMachineGatherCheck(gathering: readonly SolidScriptGathering[], label: string): void {
  const into = gathering.at(-1);
  if (!into || into.kind === 'hull') return;
  throw new Error(`${label} cannot be inside a Polyhedron or Polygon; only Point lines, logic and moves go there`);
}

/**
 * Fails when a shape is drawn where it cannot be: flat shapes only inside
 * Linear Extrude, solids only outside it.
 *
 * @param label Command of the shape being built.
 * @param planar True inside Linear Extrude.
 * @param flat True for a flat shape.
 */
export function solidScriptMachineFlatCheck(label: string, planar: boolean, flat: boolean): void {
  if (flat && !planar)
    throw new Error(
      `${label} draws a closed Path: give it an Into to keep the Path, or place it inside a Linear Extrude or Rotate Extrude to fill it`,
    );
  if (!flat && planar) throw new Error(`${label} is a solid and cannot be inside a Linear Extrude or Rotate Extrude`);
}

/**
 * Runs a body while a gathering block is open, then closes it.
 *
 * @param gathering Open gathering blocks, innermost last.
 * @param kind What the block gathers.
 * @param body Work that may add points, run with the open gathering.
 * @returns What the body returns.
 */
export function solidScriptMachineGatherWhile<Result>(
  gathering: SolidScriptGathering[],
  kind: SolidScriptGatherKind,
  body: (into: SolidScriptGathering) => Result,
): Result {
  const into: SolidScriptGathering = { kind, points: [], uvs: [], faces: [] };
  gathering.push(into);
  try {
    return body(into);
  } finally {
    gathering.pop();
  }
}
