import type { SolidScriptShapeMesh } from './solid_script_mesh.js';

/**
 * Key of the edge between two mesh points, the same either way round.
 *
 * @param a Point number.
 * @param b Point number.
 * @returns Key.
 */
export function solidScriptMeshEdgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Lists the faces around each edge of a mesh.
 *
 * @param mesh Mesh.
 * @returns Face numbers per edge key.
 */
function solidScriptMeshEdgeSplitFacesByEdge(mesh: SolidScriptShapeMesh): Map<string, number[]> {
  const byEdge = new Map<string, number[]>();
  mesh.faces.forEach((loop, face) =>
    loop.forEach((point, slot) => {
      const key = solidScriptMeshEdgeKey(point, loop[(slot + 1) % loop.length] ?? point);
      byEdge.set(key, [...(byEdge.get(key) ?? []), face]);
    }),
  );
  return byEdge;
}

/**
 * Finds which group of faces around a point a face belongs to.
 *
 * @param parents Group parent per face.
 * @param face Face number.
 * @returns Root face number of its group.
 */
function solidScriptMeshEdgeSplitRoot(parents: Map<number, number>, face: number): number {
  let root = face;
  while ((parents.get(root) ?? root) !== root) root = parents.get(root) ?? root;
  parents.set(face, root);
  return root;
}

/**
 * The two edges of a face that meet at one of its points.
 *
 * @param loop Face loop.
 * @param point Point number.
 * @returns Edge keys.
 */
function solidScriptMeshEdgeSplitEdgesAt(loop: readonly number[], point: number): string[] {
  const slot = loop.indexOf(point);
  const before = loop[(slot + loop.length - 1) % loop.length] ?? point;
  const after = loop[(slot + 1) % loop.length] ?? point;
  return [solidScriptMeshEdgeKey(before, point), solidScriptMeshEdgeKey(point, after)];
}

/**
 * Groups the faces around one point into fans that still hang together across
 * edges that are not split.
 *
 * @param mesh Mesh.
 * @param point Point number.
 * @param around Faces that use the point.
 * @param byEdge Faces per edge key.
 * @param split Keys of edges to split.
 * @returns Root face of each face's fan.
 */
function solidScriptMeshEdgeSplitFans(
  mesh: SolidScriptShapeMesh,
  point: number,
  around: readonly number[],
  byEdge: ReadonlyMap<string, readonly number[]>,
  split: ReadonlySet<string>,
): Map<number, number> {
  const parents = new Map(around.map((face) => [face, face]));
  for (const face of around)
    for (const key of solidScriptMeshEdgeSplitEdgesAt(mesh.faces[face] ?? [], point)) {
      if (split.has(key)) continue;
      const roots = (byEdge.get(key) ?? []).map((other) => solidScriptMeshEdgeSplitRoot(parents, other));
      for (const root of roots.slice(1)) parents.set(root, roots[0] ?? root);
    }
  for (const face of around) solidScriptMeshEdgeSplitRoot(parents, face);
  return parents;
}

/**
 * Gives each fan of faces around a point after the first its own copy of the
 * point.
 *
 * @param point Point number.
 * @param fans Root face per face.
 * @param points Points, to which copies are added.
 * @returns New point number per face, for faces that get a copy.
 */
function solidScriptMeshEdgeSplitCopies(
  point: number,
  fans: ReadonlyMap<number, number>,
  points: SolidScriptShapeMesh['points'],
): Map<number, number> {
  const copyOfRoot = new Map<number, number>();
  const copies = new Map<number, number>();
  const source = points[point];
  if (!source) return copies;
  for (const [face, root] of fans) {
    if (!copyOfRoot.has(root)) copyOfRoot.set(root, copyOfRoot.size === 0 ? point : points.push(source.clone()) - 1);
    copies.set(face, copyOfRoot.get(root) ?? point);
  }
  return copies;
}

/**
 * Splits a mesh along edges: the faces on either side of a split edge no longer
 * share its corners, so they can move apart or shade with a hard edge. Points
 * are copied only where faces around them are cut off from each other.
 *
 * @param mesh Mesh.
 * @param split Keys of the edges to split, from solidScriptMeshEdgeKey.
 * @returns Mesh with the edges split.
 */
export function solidScriptMeshEdgesSplit(
  mesh: SolidScriptShapeMesh,
  split: ReadonlySet<string>,
): SolidScriptShapeMesh {
  const byEdge = solidScriptMeshEdgeSplitFacesByEdge(mesh);
  const points = mesh.points.map((point) => point.clone());
  const faces = mesh.faces.map((loop) => [...loop]);
  const touched = new Set([...split].flatMap((key) => key.split(':').map(Number)));
  for (const point of touched) {
    const around = mesh.faces.flatMap((loop, face) => (loop.includes(point) ? [face] : []));
    const copies = solidScriptMeshEdgeSplitCopies(
      point,
      solidScriptMeshEdgeSplitFans(mesh, point, around, byEdge, split),
      points,
    );
    for (const [face, copy] of copies)
      faces[face] = (faces[face] ?? []).map((index) => (index === point ? copy : index));
  }
  return { ...mesh, points, faces };
}
