import * as THREE from 'three';
import { solidScriptCornerAngles } from './solid_script_members_corners.js';
import type { SolidScriptElements } from './solid_script_elements.js';
import {
  solidScriptGeometryEdges,
  solidScriptGeometryVerticesAt,
  type SolidScriptEdgeFacts,
  type SolidScriptFaceFacts,
} from './solid_script_geometry.js';
import { solidScriptFaceCornerUvs } from './solid_script_uvs.js';
import type { SolidScriptElement, SolidScriptValue } from './solid_script_value.js';

/** Closest two corner positions may be and still count as the same. */
const SOLID_SCRIPT_FACE_CORNER_SAME = 1e-6;

/**
 * Tells whether two points are the same corner.
 *
 * @param a First point.
 * @param b Second point.
 * @returns True when they are within a micrometre.
 */
function solidScriptFaceCornerSame(a: THREE.Vector3 | undefined, b: THREE.Vector3): boolean {
  return a !== undefined && a.distanceTo(b) < SOLID_SCRIPT_FACE_CORNER_SAME;
}

/**
 * Gives the face corners of a face, in the order of its corners.
 *
 * @param elements Geometry values of the run.
 * @param face Face read now.
 * @returns Face corner elements.
 */
export function solidScriptFaceCornersOfFace(
  elements: SolidScriptElements,
  face: SolidScriptFaceFacts,
): SolidScriptElement[] {
  return face.corners.map((_, index) => elements.faceCorner(face, index));
}

/**
 * Gives the face corners at a point: one for each face that has a corner there.
 *
 * @param elements Geometry values of the run.
 * @param faces Faces of the object.
 * @param position Point.
 * @returns Face corner elements, in face order.
 */
export function solidScriptFaceCornersAtVertex(
  elements: SolidScriptElements,
  faces: readonly SolidScriptFaceFacts[],
  position: THREE.Vector3,
): SolidScriptElement[] {
  return faces.flatMap((face) => {
    const index = face.corners.findIndex((corner) => solidScriptFaceCornerSame(corner, position));
    return index < 0 ? [] : [elements.faceCorner(face, index)];
  });
}

/**
 * Finds the corner of a face from which an edge runs to the next corner, the
 * way the face winds.
 *
 * @param face Face.
 * @param edge Edge piece.
 * @returns Corner number, or -1 when the face does not hold the edge.
 */
function solidScriptFaceCornerStarting(face: SolidScriptFaceFacts, edge: SolidScriptEdgeFacts): number {
  const corners = face.corners;
  return corners.findIndex((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    if (!next) return false;
    const forward = solidScriptFaceCornerSame(corner, edge.start) && solidScriptFaceCornerSame(next, edge.end);
    return forward || (solidScriptFaceCornerSame(corner, edge.end) && solidScriptFaceCornerSame(next, edge.start));
  });
}

/**
 * Gives the face corners of an edge: for each face at it, the corner the edge
 * leaves from around that face.
 *
 * @param elements Geometry values of the run.
 * @param edges Pieces of the edge.
 * @returns Face corner elements.
 */
export function solidScriptFaceCornersAlongEdge(
  elements: SolidScriptElements,
  edges: readonly SolidScriptEdgeFacts[],
): SolidScriptElement[] {
  const found: SolidScriptElement[] = [];
  for (const edge of edges)
    for (const face of edge.faces) {
      const index = face ? solidScriptFaceCornerStarting(face, edge) : -1;
      const made = face && index >= 0 ? elements.faceCorner(face, index) : undefined;
      if (made && !found.includes(made)) found.push(made);
    }
  return found;
}

/**
 * Gives the edge between two corners of a face.
 *
 * @param elements Geometry values of the run.
 * @param face Face.
 * @param from Corner number it starts at.
 * @param to Corner number it ends at.
 * @returns Edge element, or undefined when none joins them.
 */
function solidScriptFaceCornerEdge(
  elements: SolidScriptElements,
  face: SolidScriptFaceFacts,
  from: number,
  to: number,
): SolidScriptValue {
  const count = face.corners.length;
  const a = face.corners[(from + count) % count];
  const b = face.corners[to % count];
  if (!a || !b) return undefined;
  const edge = solidScriptGeometryEdges([face.leaf]).find(
    (piece) =>
      (solidScriptFaceCornerSame(piece.start, a) && solidScriptFaceCornerSame(piece.end, b)) ||
      (solidScriptFaceCornerSame(piece.start, b) && solidScriptFaceCornerSame(piece.end, a)),
  );
  return edge ? elements.edge(edge) : undefined;
}

/** Reads one member of a face corner from its face and corner number. */
type SolidScriptFaceCornerReader = (
  face: SolidScriptFaceFacts,
  index: number,
  elements: SolidScriptElements,
) => SolidScriptValue | THREE.Vector3;

/**
 * Finds the vertex a face corner uses.
 *
 * @param face Face.
 * @param index Corner number.
 * @param elements Geometry values of the run.
 * @returns Vertex element, or undefined when none is there.
 */
function solidScriptFaceCornerVertex(
  face: SolidScriptFaceFacts,
  index: number,
  elements: SolidScriptElements,
): SolidScriptValue {
  const [vertex] = solidScriptGeometryVerticesAt(face.leaf, face.corners[index] ?? face.center);
  return vertex ? elements.vertex(face.leaf, vertex) : undefined;
}

/**
 * Reads the UV a face gives one of its corners.
 *
 * @param face Face.
 * @param index Corner number.
 * @returns UV as a vector with Z 0.
 */
function solidScriptFaceCornerUv(face: SolidScriptFaceFacts, index: number): THREE.Vector3 {
  const [u = 0, v = 0] = solidScriptFaceCornerUvs(face)[index] ?? [];
  return new THREE.Vector3(u, v, 0);
}

/** Members of a face corner, folded, and how each is read. */
const SOLID_SCRIPT_FACE_CORNER_READERS: Readonly<Record<string, SolidScriptFaceCornerReader>> = {
  face: (face, _index, elements) => elements.face(face),
  vertex: solidScriptFaceCornerVertex,
  index: (_face, index) => index,
  position: (face, index) => (face.corners[index] ?? face.center).clone(),
  normal: (face) => face.normal.clone(),
  angle: (face, index) => solidScriptCornerAngles(face)[index],
  uv: solidScriptFaceCornerUv,
  nextedge: (face, index, elements) => solidScriptFaceCornerEdge(elements, face, index, index + 1),
  previousedge: (face, index, elements) => solidScriptFaceCornerEdge(elements, face, index - 1, index),
};

/**
 * Reads a member of a face corner. Points and directions come back as vectors,
 * for the caller to round.
 *
 * @param element Face corner element.
 * @param member Member, folded.
 * @param elements Geometry values of the run.
 * @returns Value or vector, or undefined when face corners have no such member.
 */
export function solidScriptFaceCornerMember(
  element: SolidScriptElement,
  member: string,
  elements: SolidScriptElements,
): SolidScriptValue | THREE.Vector3 {
  const at = elements.faceCornerAt(element);
  if (!at) throw new Error(`${String(element)} was cut away`);
  const reader = SOLID_SCRIPT_FACE_CORNER_READERS[member];
  return reader ? reader(at.face, at.index, elements) : undefined;
}
