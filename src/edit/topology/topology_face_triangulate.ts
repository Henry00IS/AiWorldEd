import * as THREE from 'three';
import { topologyFaceAreaVector } from './topology_face_region.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** Outcome of splitting faces into triangles, with every resulting face. */
export interface TopologyFaceSplitOutcome {
  /** Whether anything changed, and why not. */
  result: TopologyOperatorResult;
  /**
   * The source faces, now the first piece of each, followed by the added
   * pieces.
   */
  faces: number[];
}

/**
 * Splits each selected face with more than three corners into triangles,
 * following its outline so concave faces stay inside their outline. The first
 * triangle keeps the face's index.
 *
 * @param geometry Working geometry mutated in place.
 * @param faces Faces to split.
 * @returns Outcome with all resulting faces.
 */
export function triangulateTopologyWorkingFaces(
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
): TopologyFaceSplitOutcome {
  const result: number[] = [];
  for (const index of new Set(faces)) {
    const face = geometry.faces[index];
    if (!face || face.vertexIndices.length <= 3) continue;
    const triangles = triangulateFaceCorners(geometry, index);
    result.push(
      index,
      ...replaceWithPieces(
        geometry,
        index,
        triangles.map((corners) => pickCorners(face, corners)),
      ),
    );
  }
  if (result.length === 0)
    return { result: topologyOperatorRefused('Triangulate needs faces with four or more corners'), faces: [] };
  return { result: topologyOperatorApplied(`Split into ${result.length} triangles`), faces: result };
}

/**
 * Fans each selected face from a new vertex at its centre.
 *
 * @param geometry Working geometry mutated in place.
 * @param faces Faces to poke.
 * @returns Outcome with all resulting faces.
 */
export function pokeTopologyWorkingFaces(
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
): TopologyFaceSplitOutcome {
  const result: number[] = [];
  for (const index of new Set(faces)) {
    const face = geometry.faces[index];
    if (!face) continue;
    const count = face.vertexIndices.length;
    const centre = face.vertexIndices
      .reduce((sum, vertex) => sum.add(geometry.positions[vertex]!), new THREE.Vector3())
      .divideScalar(count);
    const middle = geometry.positions.push(centre) - 1;
    const uv = face.cornerUvs.reduce((sum, corner) => ({ u: sum.u + corner.u / count, v: sum.v + corner.v / count }), {
      u: 0,
      v: 0,
    });
    const pieces = face.vertexIndices.map((vertex, corner) => ({
      vertexIndices: [vertex, face.vertexIndices[(corner + 1) % count]!, middle],
      cornerUvs: [{ ...face.cornerUvs[corner]! }, { ...face.cornerUvs[(corner + 1) % count]! }, { ...uv }],
      textureId: face.textureId,
    }));
    result.push(index, ...replaceWithPieces(geometry, index, pieces));
  }
  if (result.length === 0) return { result: topologyOperatorRefused('Poke Faces needs selected faces'), faces: [] };
  return { result: topologyOperatorApplied(`Poked into ${result.length} triangles`), faces: result };
}

/**
 * Puts the first piece in the face's slot and appends the rest.
 *
 * @param geometry Working geometry.
 * @param index Face index.
 * @param pieces Replacement faces.
 * @returns Indices of the appended pieces.
 */
function replaceWithPieces(geometry: TopologyWorkingGeometry, index: number, pieces: TopologyWorkingFace[]): number[] {
  geometry.faces[index] = pieces[0]!;
  return pieces.slice(1).map((piece) => geometry.faces.push(piece) - 1);
}

/**
 * Builds a face from some corners of another.
 *
 * @param face Source face.
 * @param corners Corner indices.
 * @returns New face.
 */
function pickCorners(face: TopologyWorkingFace, corners: readonly number[]): TopologyWorkingFace {
  return {
    vertexIndices: corners.map((corner) => face.vertexIndices[corner]!),
    cornerUvs: corners.map((corner) => ({ ...face.cornerUvs[corner]! })),
    textureId: face.textureId,
  };
}

/**
 * Triangulates one face in its own plane.
 *
 * @param geometry Working geometry.
 * @param index Face index.
 * @returns Corner index triples, wound like the face.
 */
function triangulateFaceCorners(geometry: TopologyWorkingGeometry, index: number): number[][] {
  const face = geometry.faces[index]!;
  const normal = topologyFaceAreaVector(geometry, index).normalize();
  const axisU = new THREE.Vector3()
    .crossVectors(Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), normal)
    .normalize();
  const axisV = new THREE.Vector3().crossVectors(normal, axisU);
  const outline = face.vertexIndices.map((vertex) => {
    const point = geometry.positions[vertex]!;
    return new THREE.Vector2(point.dot(axisU), point.dot(axisV));
  });
  const triangles = THREE.ShapeUtils.triangulateShape(outline, []);
  const counterClockwise = !THREE.ShapeUtils.isClockWise(outline);
  return triangles.map((triangle) => {
    const corners = [...triangle];
    const area = THREE.ShapeUtils.area(corners.map((corner) => outline[corner]!));
    return area > 0 === counterClockwise ? corners : corners.reverse();
  });
}
