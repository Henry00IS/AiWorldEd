import * as THREE from 'three';
import { collectTopologyFaceRegions, topologyFaceAreaVector, type TopologyFaceRegion } from './topology_face_region.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';

/** Whether touching faces are inset as one region or one by one. */
export type TopologyFaceInsetGrouping = 'region' | 'individual';

/** Smallest bisector cosine allowed, so sharp corners cannot shoot away. */
const INSET_MITER_MIN_COSINE = 0.2;

/** One directed outline edge of a region with the face that owns it. */
interface InsetOutlineEdge {
  /** Face that owns the edge. */
  face: number;
  /** Corner index where the edge starts. */
  corner: number;
  /** Start vertex. */
  from: number;
  /** End vertex. */
  to: number;
}

/**
 * Insets faces by a thickness measured inside their planes. Each region of
 * faces joined by edges (or each face, for individual grouping) gets a new
 * outline moved inward by the thickness and a ring of quads between the old and
 * new outline. The region then moves by the depth along its normal, so a
 * negative depth sinks it. Faces keep their indices, so a face selection stays
 * on the inset faces.
 *
 * @param geometry Working geometry, edited in place.
 * @param faceIndices Faces to inset.
 * @param thickness Inward distance of the new outline, zero or more.
 * @param depth Signed distance along the region normal.
 * @param grouping Region or individual grouping.
 * @returns Operator result.
 */
export function insetTopologyWorkingFaceRegions(
  geometry: TopologyWorkingGeometry,
  faceIndices: readonly number[],
  thickness: number,
  depth: number,
  grouping: TopologyFaceInsetGrouping,
): TopologyOperatorResult {
  if (!(thickness >= 0) || !Number.isFinite(depth))
    return topologyOperatorRefused('Inset thickness must not be negative');
  if (thickness < 1e-6 && Math.abs(depth) < 1e-6) return topologyOperatorRefused('Set an inset thickness or depth');
  const regions = collectInsetRegions(geometry, faceIndices, grouping);
  if (regions.length === 0) return topologyOperatorRefused('Select faces to inset');
  const outlines = regions.map((region) => collectInsetOutline(geometry, region));
  if (outlines.some((outline) => outline === null)) {
    return topologyOperatorRefused('Cannot inset faces whose outline touches itself at a corner');
  }
  regions.forEach((region, index) => insetOneRegion(geometry, region, outlines[index]!, thickness, depth));
  const count = regions.reduce((sum, region) => sum + region.faceIndices.length, 0);
  return topologyOperatorApplied(`Inset ${count} ${count === 1 ? 'face' : 'faces'}`);
}

/**
 * Groups faces for inset.
 *
 * @param geometry Working geometry.
 * @param faceIndices Faces to inset.
 * @param grouping Region or individual grouping.
 * @returns Regions.
 */
function collectInsetRegions(
  geometry: TopologyWorkingGeometry,
  faceIndices: readonly number[],
  grouping: TopologyFaceInsetGrouping,
): TopologyFaceRegion[] {
  if (grouping === 'region') return collectTopologyFaceRegions(geometry, faceIndices, 'edge');
  const faces = [...new Set(faceIndices)].filter((index) => geometry.faces[index] !== undefined);
  return faces.flatMap((face) => collectTopologyFaceRegions(geometry, [face], 'edge'));
}

/**
 * Collects the outline of a region, or null when one vertex starts two outline
 * edges.
 *
 * @param geometry Working geometry.
 * @param region Region.
 * @returns Outline edges keyed by start vertex, or null.
 */
function collectInsetOutline(
  geometry: TopologyWorkingGeometry,
  region: TopologyFaceRegion,
): Map<number, InsetOutlineEdge> | null {
  const directed = new Set<string>();
  const edges: InsetOutlineEdge[] = [];
  for (const face of region.faceIndices) {
    const loop = geometry.faces[face]!.vertexIndices;
    loop.forEach((from, corner) => {
      const to = loop[(corner + 1) % loop.length]!;
      directed.add(`${from}>${to}`);
      edges.push({ face, corner, from, to });
    });
  }
  const outline = new Map<number, InsetOutlineEdge>();
  for (const edge of edges.filter((candidate) => !directed.has(`${candidate.to}>${candidate.from}`))) {
    if (outline.has(edge.from)) return null;
    outline.set(edge.from, edge);
  }
  return outline;
}

/**
 * Insets one region.
 *
 * @param geometry Working geometry.
 * @param region Region.
 * @param outline Outline edges keyed by start vertex.
 * @param thickness Inward distance.
 * @param depth Signed distance along the region normal.
 */
function insetOneRegion(
  geometry: TopologyWorkingGeometry,
  region: TopologyFaceRegion,
  outline: Map<number, InsetOutlineEdge>,
  thickness: number,
  depth: number,
): void {
  const incoming = new Map([...outline.values()].map((edge) => [edge.to, edge]));
  const lift = region.normal.clone().multiplyScalar(depth);
  const inner = new Map<number, number>();
  const travel = new Map<number, number>();
  for (const [vertex, outgoing] of outline) {
    const offset = insetCornerOffset(geometry, incoming.get(vertex) ?? outgoing, outgoing, thickness);
    geometry.positions.push(geometry.positions[vertex]!.clone().add(offset).add(lift));
    inner.set(vertex, geometry.positions.length - 1);
    travel.set(vertex, offset.length());
  }
  liftRegionInteriorVertices(geometry, region, inner, lift);
  const rings = [...outline.values()].map((edge) => buildInsetRing(geometry, edge, inner, travel));
  for (const face of region.faceIndices) remapInsetFace(geometry, geometry.faces[face]!, inner, travel);
  geometry.faces.push(...rings);
}

/**
 * Returns how far an outline corner moves inward: along the bisector of the
 * inward directions of its two outline edges, lengthened so both edges end up
 * the thickness away.
 *
 * @param geometry Working geometry.
 * @param incoming Outline edge ending at the corner.
 * @param outgoing Outline edge starting at the corner.
 * @param thickness Inward distance.
 * @returns Offset vector.
 */
function insetCornerOffset(
  geometry: TopologyWorkingGeometry,
  incoming: InsetOutlineEdge,
  outgoing: InsetOutlineEdge,
  thickness: number,
): THREE.Vector3 {
  const inwardIn = insetEdgeInward(geometry, incoming);
  const inwardOut = insetEdgeInward(geometry, outgoing);
  const bisector = inwardIn.clone().add(inwardOut);
  if (bisector.lengthSq() < 1e-12) return inwardOut.multiplyScalar(thickness);
  bisector.normalize();
  return bisector.multiplyScalar(thickness / Math.max(INSET_MITER_MIN_COSINE, bisector.dot(inwardOut)));
}

/**
 * Returns the unit direction from an outline edge into its face, inside the
 * face's plane.
 *
 * @param geometry Working geometry.
 * @param edge Outline edge.
 * @returns Unit inward direction.
 */
function insetEdgeInward(geometry: TopologyWorkingGeometry, edge: InsetOutlineEdge): THREE.Vector3 {
  const normal = topologyFaceAreaVector(geometry, edge.face).normalize();
  const along = geometry.positions[edge.to]!.clone().sub(geometry.positions[edge.from]!);
  return normal.cross(along).normalize();
}

/**
 * Moves region vertices that are not on the outline by the lift.
 *
 * @param geometry Working geometry.
 * @param region Region.
 * @param inner Map from outline vertex to its inner copy.
 * @param lift Offset along the region normal.
 */
function liftRegionInteriorVertices(
  geometry: TopologyWorkingGeometry,
  region: TopologyFaceRegion,
  inner: ReadonlyMap<number, number>,
  lift: THREE.Vector3,
): void {
  if (lift.lengthSq() === 0) return;
  const interior = new Set<number>();
  for (const face of region.faceIndices) {
    for (const vertex of geometry.faces[face]!.vertexIndices) if (!inner.has(vertex)) interior.add(vertex);
  }
  for (const vertex of interior) geometry.positions[vertex]!.add(lift);
}

/**
 * Builds the ring quad between an outline edge and its inner copy. The quad
 * keeps the edge direction of the face it replaces, so the winding stays
 * consistent with the neighbour across the edge.
 *
 * @param geometry Working geometry before the region faces are remapped.
 * @param edge Outline edge.
 * @param inner Map from outline vertex to its inner copy.
 * @param travel How far each outline vertex moved inward, for the inner UVs.
 * @returns Ring face.
 */
function buildInsetRing(
  geometry: TopologyWorkingGeometry,
  edge: InsetOutlineEdge,
  inner: ReadonlyMap<number, number>,
  travel: ReadonlyMap<number, number>,
): TopologyWorkingFace {
  const face = geometry.faces[edge.face]!;
  const next = (edge.corner + 1) % face.vertexIndices.length;
  const outerStart = face.cornerUvs[edge.corner] ?? { u: 0, v: 0 };
  const outerEnd = face.cornerUvs[next] ?? { u: 0, v: 0 };
  return {
    vertexIndices: [edge.from, edge.to, inner.get(edge.to)!, inner.get(edge.from)!],
    cornerUvs: [
      { ...outerStart },
      { ...outerEnd },
      insetCornerUv(geometry, face, next, travel),
      insetCornerUv(geometry, face, edge.corner, travel),
    ],
    textureId: face.textureId,
  };
}

/**
 * Points a region face at the inner outline copies and pulls their UVs in.
 *
 * @param geometry Working geometry.
 * @param face Region face, edited in place.
 * @param inner Map from outline vertex to its inner copy.
 * @param travel How far each outline vertex moved inward.
 */
function remapInsetFace(
  geometry: TopologyWorkingGeometry,
  face: TopologyWorkingFace,
  inner: ReadonlyMap<number, number>,
  travel: ReadonlyMap<number, number>,
): void {
  face.cornerUvs = face.cornerUvs.map((uv, corner) =>
    inner.has(face.vertexIndices[corner]!) ? insetCornerUv(geometry, face, corner, travel) : { ...uv },
  );
  face.vertexIndices = face.vertexIndices.map((vertex) => inner.get(vertex) ?? vertex);
}

/**
 * Returns a corner UV pulled toward the face's UV centre by the share of the
 * way its vertex moved toward the face centre.
 *
 * @param geometry Working geometry before remapping.
 * @param face Face that owns the corner.
 * @param corner Corner index.
 * @param travel How far each outline vertex moved inward.
 * @returns Inner UV.
 */
function insetCornerUv(
  geometry: TopologyWorkingGeometry,
  face: TopologyWorkingFace,
  corner: number,
  travel: ReadonlyMap<number, number>,
): { u: number; v: number } {
  const count = face.vertexIndices.length;
  const centre = face.vertexIndices
    .reduce((sum, vertex) => sum.add(geometry.positions[vertex]!), new THREE.Vector3())
    .divideScalar(count);
  const reach = geometry.positions[face.vertexIndices[corner]!]!.distanceTo(centre);
  const moved = travel.get(face.vertexIndices[corner]!) ?? 0;
  const share = reach > 1e-9 ? Math.min(0.95, moved / reach) : 0;
  const uv = face.cornerUvs[corner] ?? { u: 0, v: 0 };
  const centreU = face.cornerUvs.reduce((sum, value) => sum + value.u, 0) / count;
  const centreV = face.cornerUvs.reduce((sum, value) => sum + value.v, 0) / count;
  return { u: uv.u + (centreU - uv.u) * share, v: uv.v + (centreV - uv.v) * share };
}
