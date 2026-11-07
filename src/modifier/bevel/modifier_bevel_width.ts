import { MathUtils, Vector3, type Matrix4, type Object3D } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelOptionsRead } from '@/modifier/volume/modifier_volume_bevel_options.js';

/**
 * Finds a conservative adjacent face span in world space.
 *
 * @param brush Source topology.
 * @param edgeIndex Half edge.
 * @param matrix Local-to-world matrix.
 */
export function modifierBevelFaceSpan(brush: SolidBrush, edgeIndex: number, matrix: Matrix4): number {
  const edge = brush.wingEdges[edgeIndex];
  const twin = edge ? brush.wingEdges[edge.twinIndex] : undefined;
  if (!edge || !twin) return 0;
  const start = brush.vertices[twin.vertexIndex]?.clone().applyMatrix4(matrix);
  const end = brush.vertices[edge.vertexIndex]?.clone().applyMatrix4(matrix);
  if (!start || !end) return 0;
  const axis = end.clone().sub(start).normalize();
  const faces = [brush.edgeFaceIndices[edgeIndex], brush.edgeFaceIndices[edge.twinIndex]];
  const spans = faces.flatMap((index) => modifierBevelFaceVertexSpans(brush, index, matrix, start, axis));
  return spans.length ? Math.min(...spans) : 0;
}

/**
 * Measures non-edge vertex distances from the edge support line.
 *
 * @param brush Source brush.
 * @param faceIndex Adjacent face.
 * @param matrix World transform.
 * @param start Edge start.
 * @param axis Edge axis.
 */
function modifierBevelFaceVertexSpans(
  brush: SolidBrush,
  faceIndex: number | undefined,
  matrix: Matrix4,
  start: Vector3,
  axis: Vector3,
): number[] {
  const face = faceIndex === undefined ? undefined : brush.faces[faceIndex];
  if (!face) return [];
  return brush
    .getFaceVertices(face)
    .map((point) => new Vector3().crossVectors(point.clone().applyMatrix4(matrix).sub(start), axis).length())
    .filter((span) => span > 1e-7);
}

/**
 * Converts the amount to world face offset and optionally limits neighbouring
 * cuts.
 *
 * @param volume Selecting volume.
 * @param normalA First world wall normal.
 * @param normalB Second world wall normal.
 * @param span Shortest adjacent face span.
 * @param sideSine Mean sine between the edge and its side edges; Absolute mode
 *   measures the amount along those side edges.
 */
export function modifierBevelWidthOffset(
  volume: Object3D,
  normalA: Vector3,
  normalB: Vector3,
  span: number,
  sideSine = 1,
): number {
  const options = modifierBevelOptionsRead(volume);
  const amount = ModifierVolumeBevel.readDistance(volume);
  const halfAngle = Math.acos(MathUtils.clamp(normalA.dot(normalB), -1, 1)) / 2;
  let distance = amount;
  if (options.widthMode === 'width') distance /= Math.max(2 * Math.cos(halfAngle), 1e-6);
  if (options.widthMode === 'depth') distance /= Math.max(Math.sin(halfAngle), 1e-6);
  if (options.widthMode === 'percent') distance = (span * MathUtils.clamp(amount, 0, 100)) / 100;
  if (options.widthMode === 'absolute') distance *= MathUtils.clamp(sideSine, 1e-3, 1);
  return options.clampOverlap ? Math.min(distance, span * 0.49) : distance;
}

/**
 * Returns the mean sine of the angle between an edge and the side edges that
 * leave its ends inside its two faces. Absolute width slides the cut that far
 * along those side edges, so the face offset is the amount times this sine.
 *
 * @param brush Source topology.
 * @param edgeIndex Half edge.
 * @param matrix Local-to-world matrix.
 * @returns Sine in (0, 1]; 1 when the side edges are square to the edge.
 */
export function modifierBevelSideSine(brush: SolidBrush, edgeIndex: number, matrix: Matrix4): number {
  const edge = brush.wingEdges[edgeIndex];
  const twin = edge ? brush.wingEdges[edge.twinIndex] : undefined;
  if (!edge || !twin) return 1;
  const ends = [twin.vertexIndex, edge.vertexIndex];
  const faces = [brush.edgeFaceIndices[edgeIndex], brush.edgeFaceIndices[edge.twinIndex]];
  const sines = faces.flatMap((face) => modifierBevelFaceSideSines(brush, face, ends, matrix));
  return sines.length ? sines.reduce((sum, value) => sum + value, 0) / sines.length : 1;
}

/**
 * Measures the side-edge sines of one face at both ends of the edge.
 *
 * @param brush Source topology.
 * @param faceIndex Adjacent face.
 * @param ends Edge start and end vertex indices.
 * @param matrix Local-to-world matrix.
 * @returns Up to two sines.
 */
function modifierBevelFaceSideSines(
  brush: SolidBrush,
  faceIndex: number | undefined,
  ends: readonly number[],
  matrix: Matrix4,
): number[] {
  const face = faceIndex === undefined ? undefined : brush.faces[faceIndex];
  if (!face) return [];
  const loop = brush.getFaceVertexIndices(face);
  const point = (index: number) => (brush.vertices[index] ?? new Vector3()).clone().applyMatrix4(matrix);
  const [startIndex = 0, endIndex = 0] = ends;
  const axis = point(endIndex).sub(point(startIndex)).normalize();
  return ends.flatMap((vertex) => {
    const at = loop.indexOf(vertex);
    const neighbours = [loop[(at + 1) % loop.length], loop[(at + loop.length - 1) % loop.length]];
    const side = neighbours.find((index) => index !== undefined && !ends.includes(index));
    if (at < 0 || side === undefined) return [];
    const direction = point(side).sub(point(vertex)).normalize();
    return [new Vector3().crossVectors(axis, direction).length()];
  });
}
