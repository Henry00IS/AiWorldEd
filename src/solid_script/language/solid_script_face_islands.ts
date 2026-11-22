import type { SolidScriptEdgeFacts, SolidScriptFaceFacts } from './solid_script_geometry.js';

/**
 * Splits the faces of a brush or mesh into groups joined through shared edges
 * that Joins lets through, in the order their first face was built.
 *
 * @param faces Faces of the brush or mesh, by number.
 * @param edges Its edges.
 * @param joins Whether faces may join across an edge.
 * @returns Faces of each group.
 */
export function solidScriptFaceIslands(
  faces: readonly SolidScriptFaceFacts[],
  edges: readonly SolidScriptEdgeFacts[],
  joins: (edge: SolidScriptEdgeFacts, index: number) => boolean,
): SolidScriptFaceFacts[][] {
  const group = new Map(faces.map((face) => [face.index, face.index]));
  const root = (index: number): number => {
    const above = group.get(index) ?? index;
    if (above === index) return index;
    const top = root(above);
    group.set(index, top);
    return top;
  };
  edges.forEach((edge, index) => {
    const [first, second] = edge.faces;
    if (second && group.has(first.index) && group.has(second.index) && joins(edge, index))
      group.set(root(first.index), root(second.index));
  });
  const islands = new Map<number, SolidScriptFaceFacts[]>();
  faces.forEach((face) => islands.set(root(face.index), [...(islands.get(root(face.index)) ?? []), face]));
  return [...islands.values()];
}
