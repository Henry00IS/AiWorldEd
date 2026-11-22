import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import type { SolidScriptFaceFacts, SolidScriptGeometryLeaf } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptUnfoldLink } from '@/solid_script/language/solid_script_uv_unfold.js';

/**
 * Finds the edges Unwrap keeps joined: edges between two of the faces that do
 * not pass Seams, with [$Edge] the edge.
 *
 * @param run Running line.
 * @param faces Faces Unwrap works on.
 * @returns Joined edges, by face number in faces.
 */
export function solidScriptUvsSeamLinks(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
): SolidScriptUnfoldLink[] {
  const numbers = new Map<SolidScriptGeometryLeaf, Map<number, number>>();
  faces.forEach((face, at) => numbers.set(face.leaf, (numbers.get(face.leaf) ?? new Map()).set(face.index, at)));
  const numberOf = (face: SolidScriptFaceFacts | null): number | undefined =>
    face ? numbers.get(face.leaf)?.get(face.index) : undefined;
  const edges = faces.flatMap((face) => run.elements.edges(run.elements.face(face)));
  return edges.flatMap((edge, index) => {
    const a = numberOf(edge.faces[0]);
    const b = numberOf(edge.faces[1]);
    if (a === undefined || b === undefined || a === b) return [];
    const fills = { $Edge: run.elements.edge(edge), $Index: index, $Count: edges.length };
    return solidScriptConditionHolds(run, 'seams', fills) ? [] : [{ a, b, p: edge.start, q: edge.end }];
  });
}
