import * as THREE from 'three';
import type { SolidScriptShapeMesh } from './solid_script_mesh.js';

/** Corners welded by position, with each face's corners as welded numbers. */
interface SolidScriptDualWelded {
  positions: THREE.Vector3[];
  faces: number[][];
  /** Face on the left of each directed edge, keyed "from,to". */
  sides: Map<string, number>;
  /** How many faces use each undirected edge, keyed "low,high". */
  uses: Map<string, number>;
}

/** The faces around one corner in order, with the open edges at each end. */
interface SolidScriptDualFan {
  faces: number[];
  /**
   * Far corner of the open edge before the first face and after the last; none
   * when closed.
   */
  ends?: [number, number];
}

/**
 * Welds the corners of a mesh that share a position and records which face lies
 * along each edge.
 *
 * @param mesh Mesh.
 * @returns Welded corners and edge facts.
 */
function solidScriptDualWeld(mesh: SolidScriptShapeMesh): SolidScriptDualWelded {
  const numbers = new Map<string, number>();
  const positions: THREE.Vector3[] = [];
  const welded = mesh.points.map((point) => {
    const key = point
      .toArray()
      .map((value) => value.toFixed(6))
      .join(',');
    const known = numbers.get(key);
    if (known !== undefined) return known;
    numbers.set(key, positions.length);
    return positions.push(point.clone()) - 1;
  });
  const faces = mesh.faces.map((face) => face.map((corner) => welded[corner] ?? 0));
  return { positions, faces, ...solidScriptDualEdges(faces) };
}

/**
 * Records the face on the left of each directed edge and how many faces use
 * each edge.
 *
 * @param faces Faces as welded corner numbers.
 * @returns Faces by directed edge and uses by edge.
 */
function solidScriptDualEdges(faces: readonly number[][]): Pick<SolidScriptDualWelded, 'sides' | 'uses'> {
  const sides = new Map<string, number>();
  const uses = new Map<string, number>();
  faces.forEach((face, index) =>
    face.forEach((from, at) => {
      const to = face[(at + 1) % face.length] ?? from;
      sides.set(`${from},${to}`, index);
      const key = from < to ? `${from},${to}` : `${to},${from}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }),
  );
  return { sides, uses };
}

/**
 * Gives the corners before and after a corner in a face.
 *
 * @param face Face corners.
 * @param corner Corner in the face.
 * @returns Corner before and corner after.
 */
function solidScriptDualAround(face: readonly number[], corner: number): [number, number] {
  const at = face.indexOf(corner);
  return [face[(at + face.length - 1) % face.length] ?? corner, face[(at + 1) % face.length] ?? corner];
}

/**
 * Walks the faces around a corner, from face to face across the edge before the
 * corner in each, starting at a face whose edge after the corner is open when
 * there is one.
 *
 * @param welded Welded mesh.
 * @param corner Corner.
 * @param touching Faces that use the corner.
 * @returns The fan, or none when the faces do not form one clean fan.
 */
function solidScriptDualFan(
  welded: SolidScriptDualWelded,
  corner: number,
  touching: readonly number[],
): SolidScriptDualFan | undefined {
  const opener = (face: number): boolean =>
    !welded.sides.has(`${solidScriptDualAround(welded.faces[face] ?? [], corner)[1]},${corner}`);
  const start = touching.find(opener) ?? touching[0];
  if (start === undefined) return undefined;
  const faces = solidScriptDualWalk(welded, corner, start, touching.length);
  if (faces.length !== touching.length) return undefined;
  if (!opener(start)) return { faces };
  const last = faces.at(-1) ?? start;
  const after = solidScriptDualAround(welded.faces[start] ?? [], corner)[1];
  return { faces, ends: [after, solidScriptDualAround(welded.faces[last] ?? [], corner)[0]] };
}

/**
 * Lists the faces met walking round a corner from a face, stopping back at the
 * start, at an open edge, or once more faces than touch the corner are met.
 *
 * @param welded Welded mesh.
 * @param corner Corner.
 * @param start First face.
 * @param most How many faces touch the corner.
 * @returns Faces in walking order.
 */
function solidScriptDualWalk(welded: SolidScriptDualWelded, corner: number, start: number, most: number): number[] {
  const faces = [start];
  for (let face = solidScriptDualNext(welded, corner, start); face !== undefined && face !== start;) {
    if (faces.length > most) break;
    faces.push(face);
    face = solidScriptDualNext(welded, corner, face);
  }
  return faces;
}

/**
 * Gives the face across the edge before a corner in a face.
 *
 * @param welded Welded mesh.
 * @param corner Corner.
 * @param face Face.
 * @returns The next face round the corner, or none at an open edge.
 */
function solidScriptDualNext(welded: SolidScriptDualWelded, corner: number, face: number): number | undefined {
  const before = solidScriptDualAround(welded.faces[face] ?? [], corner)[0];
  return welded.sides.get(`${corner},${before}`);
}

/**
 * Says whether every edge at a corner is used by one or two faces.
 *
 * @param welded Welded mesh.
 * @param corner Corner.
 * @param touching Faces that use the corner.
 * @returns True when the corner is manifold.
 */
function solidScriptDualManifold(welded: SolidScriptDualWelded, corner: number, touching: readonly number[]): boolean {
  return touching.every((face) =>
    solidScriptDualAround(welded.faces[face] ?? [], corner).every((other) => {
      const key = corner < other ? `${corner},${other}` : `${other},${corner}`;
      return (welded.uses.get(key) ?? 0) <= 2;
    }),
  );
}

/**
 * Builds the dual of a mesh: a corner at the middle of every face, and a face
 * for every corner joining the middles of the faces around it. Corners on an
 * open edge make a face through the middles of their two open edges and the
 * corner itself when Keep Boundaries is on, and none otherwise. Corners with
 * fewer than three faces round them, or where more than two faces meet at an
 * edge, make no face.
 *
 * @param mesh Mesh.
 * @param keepBoundaries Whether corners on an open edge make faces.
 * @returns Dual mesh.
 */
export function solidScriptMeshDual(mesh: SolidScriptShapeMesh, keepBoundaries: boolean): SolidScriptShapeMesh {
  const welded = solidScriptDualWeld(mesh);
  const points = welded.faces.map((face) =>
    face
      .reduce((sum, corner) => sum.add(welded.positions[corner] ?? new THREE.Vector3()), new THREE.Vector3())
      .divideScalar(face.length),
  );
  const touching = welded.positions.map((): number[] => []);
  welded.faces.forEach((face, index) => face.forEach((corner) => touching[corner]?.push(index)));
  const extra = new Map<string, number>();
  const faces = touching.flatMap((around, corner) => {
    if (!solidScriptDualManifold(welded, corner, around)) return [];
    const fan = solidScriptDualFan(welded, corner, around);
    if (!fan || (fan.ends ? !keepBoundaries : fan.faces.length < 3)) return [];
    const loop = [...fan.faces];
    if (fan.ends) loop.push(...solidScriptDualBoundary(welded, corner, fan.ends, points, extra));
    return [loop];
  });
  if (faces.length === 0) throw new Error('Dual Mesh found no corner with a full ring of faces; try Keep Boundaries');
  const { faceTags: _tags, faceTextures: _textures, ...rest } = mesh;
  return { ...rest, points, faces, uvs: faces.map(() => null) };
}

/**
 * Adds the middles of a corner's two open edges, and the corner itself, to the
 * dual's points, sharing edge middles between the two corners of an edge.
 *
 * @param welded Welded mesh.
 * @param corner Corner on an open edge.
 * @param ends Far corners of the open edges, before the first face and after
 *   the last.
 * @param points Dual points, added to.
 * @param extra Point numbers of edge middles made so far, by edge.
 * @returns Point numbers to close the dual face with, in order.
 */
function solidScriptDualBoundary(
  welded: SolidScriptDualWelded,
  corner: number,
  ends: [number, number],
  points: THREE.Vector3[],
  extra: Map<string, number>,
): number[] {
  const middle = (other: number): number => {
    const key = corner < other ? `${corner},${other}` : `${other},${corner}`;
    const known = extra.get(key);
    if (known !== undefined) return known;
    const at = welded.positions[corner] ?? new THREE.Vector3();
    extra.set(key, points.push(at.clone().lerp(welded.positions[other] ?? at, 0.5)) - 1);
    return points.length - 1;
  };
  const first = middle(ends[1]);
  const own = points.push((welded.positions[corner] ?? new THREE.Vector3()).clone()) - 1;
  return [first, own, middle(ends[0])];
}
