import type * as THREE from 'three';
import { collectTopologyFaceRegions, type TopologyFaceRegion } from './topology_face_region.js';
import { topologyExtrudeSideWallUvs } from './topology_face_extrude_uv.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';

/** How selected faces are grouped before they are pushed out. */
export type TopologyFaceExtrudeGrouping = 'region' | 'individual';

/** Smallest extrusion distance that still builds side walls. */
export const TOPOLOGY_FACE_EXTRUDE_MIN_DISTANCE = 1e-5;

/**
 * Extrudes faces along their normal. Each group of touching faces (or each face
 * on its own, for individual grouping) gets fresh vertices moved by the
 * distance along the group's averaged normal, and the group's open outline is
 * joined to the old outline by a wall of quads. A negative distance pushes the
 * faces into the mesh, cutting a pocket with walls that face into it. The
 * extruded faces keep their indices, so a face selection stays on them.
 *
 * @param geometry Working geometry, edited in place.
 * @param faceIndices Faces to extrude.
 * @param distance Signed distance along the normal in local units.
 * @param grouping Whether touching faces move together or one by one.
 * @param normalScale Length one local unit along a normal has in the space the
 *   distance is measured in, so a world distance stays exact under scale.
 * @returns Operator result.
 */
export function extrudeTopologyWorkingFaces(
  geometry: TopologyWorkingGeometry,
  faceIndices: readonly number[],
  distance: number,
  grouping: TopologyFaceExtrudeGrouping = 'region',
  normalScale: (localNormal: THREE.Vector3) => number = () => 1,
): TopologyOperatorResult {
  if (!Number.isFinite(distance) || Math.abs(distance) < TOPOLOGY_FACE_EXTRUDE_MIN_DISTANCE) {
    return topologyOperatorRefused('Extrude distance must not be zero');
  }
  const regions = collectExtrudeRegions(geometry, faceIndices, grouping);
  if (regions.length === 0) return topologyOperatorRefused('Select faces to extrude');
  if (regions.some((region) => region.normal.lengthSq() === 0)) {
    return topologyOperatorRefused('Cannot extrude faces whose normals cancel out');
  }
  for (const region of regions) extrudeOneRegion(geometry, region, distance / normalScale(region.normal));
  const count = regions.reduce((sum, region) => sum + region.faceIndices.length, 0);
  return topologyOperatorApplied(`Extruded ${count} ${count === 1 ? 'face' : 'faces'}`);
}

/**
 * Groups faces for extrusion.
 *
 * @param geometry Working geometry.
 * @param faceIndices Faces to extrude.
 * @param grouping Region or individual grouping.
 * @returns Regions to extrude.
 */
function collectExtrudeRegions(
  geometry: TopologyWorkingGeometry,
  faceIndices: readonly number[],
  grouping: TopologyFaceExtrudeGrouping,
): TopologyFaceRegion[] {
  if (grouping === 'region') return collectTopologyFaceRegions(geometry, faceIndices);
  const faces = [...new Set(faceIndices)].filter((index) => geometry.faces[index] !== undefined);
  return faces.flatMap((face) => collectTopologyFaceRegions(geometry, [face]));
}

/**
 * Extrudes one region: walls first, from the old outline, then the faces move
 * onto their new vertices.
 *
 * @param geometry Working geometry.
 * @param region Region to extrude.
 * @param distance Signed distance along the region normal.
 */
function extrudeOneRegion(geometry: TopologyWorkingGeometry, region: TopologyFaceRegion, distance: number): void {
  const offset = region.normal.clone().multiplyScalar(distance);
  const raised = raiseRegionVertices(geometry, region, offset);
  const outline = collectRegionOutline(geometry, region);
  const walls = outline.map((edge) => buildSideWall(geometry, edge, raised, distance));
  for (const face of region.faceIndices) {
    const target = geometry.faces[face]!;
    target.vertexIndices = target.vertexIndices.map((vertex) => raised.get(vertex)!);
  }
  geometry.faces.push(...walls);
}

/**
 * Adds one moved copy of every vertex the region uses.
 *
 * @param geometry Working geometry.
 * @param region Region to extrude.
 * @param offset Local offset applied to the copies.
 * @returns Map from old vertex to its moved copy.
 */
function raiseRegionVertices(
  geometry: TopologyWorkingGeometry,
  region: TopologyFaceRegion,
  offset: THREE.Vector3,
): Map<number, number> {
  const raised = new Map<number, number>();
  for (const face of region.faceIndices) {
    for (const vertex of geometry.faces[face]!.vertexIndices) {
      if (raised.has(vertex)) continue;
      geometry.positions.push(geometry.positions[vertex]!.clone().add(offset));
      raised.set(vertex, geometry.positions.length - 1);
    }
  }
  return raised;
}

/** One directed outline edge of a region, remembered with its face corner. */
interface TopologyRegionOutlineEdge {
  /** Face that owns the edge. */
  face: number;
  /** Corner index where the edge starts. */
  corner: number;
}

/**
 * Collects the edges of a region that no other region face shares.
 *
 * @param geometry Working geometry.
 * @param region Region to scan.
 * @returns Outline edges in face order.
 */
function collectRegionOutline(
  geometry: TopologyWorkingGeometry,
  region: TopologyFaceRegion,
): TopologyRegionOutlineEdge[] {
  const directed = new Set<string>();
  for (const face of region.faceIndices) {
    forEachFaceEdge(geometry, face, (from, to) => directed.add(`${from}>${to}`));
  }
  const outline: TopologyRegionOutlineEdge[] = [];
  for (const face of region.faceIndices) {
    forEachFaceEdge(geometry, face, (from, to, corner) => {
      if (!directed.has(`${to}>${from}`)) outline.push({ face, corner });
    });
  }
  return outline;
}

/**
 * Visits every directed edge of a face.
 *
 * @param geometry Working geometry.
 * @param face Face index.
 * @param visit Receives start vertex, end vertex and start corner.
 */
function forEachFaceEdge(
  geometry: TopologyWorkingGeometry,
  face: number,
  visit: (from: number, to: number, corner: number) => void,
): void {
  const loop = geometry.faces[face]!.vertexIndices;
  loop.forEach((vertex, corner) => visit(vertex, loop[(corner + 1) % loop.length]!, corner));
}

/**
 * Builds the wall quad for one outline edge. The quad runs along the edge in
 * the face's own direction, which keeps the winding consistent with the
 * neighbour across the edge; its normal then faces away from the region for an
 * outward extrusion and into the pocket for an inward one.
 *
 * @param geometry Working geometry before the faces move.
 * @param edge Outline edge.
 * @param raised Map from old vertex to its moved copy.
 * @param distance Signed extrusion distance.
 * @returns Wall face.
 */
function buildSideWall(
  geometry: TopologyWorkingGeometry,
  edge: TopologyRegionOutlineEdge,
  raised: ReadonlyMap<number, number>,
  distance: number,
): TopologyWorkingGeometry['faces'][number] {
  const face = geometry.faces[edge.face]!;
  const start = face.vertexIndices[edge.corner]!;
  const end = face.vertexIndices[(edge.corner + 1) % face.vertexIndices.length]!;
  return {
    vertexIndices: [start, end, raised.get(end)!, raised.get(start)!],
    cornerUvs: topologyExtrudeSideWallUvs(geometry, face, edge.corner, distance),
    textureId: face.textureId,
  };
}
