import type { Plane } from 'three';
import { collectTopologyWorkingEdges } from './topology_working_edges_collect.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import type { TopologyWorkingEdge } from './topology_working_edge_key.js';
import { splitWorkingFaceBetweenVertices } from './topology_face_split.js';
import {
  collectLoopCutPlaneCrossings,
  createLoopCutSlicePlane,
  type TopologyLoopCutCrossing,
} from './topology_loop_cut_plane.js';
import { loopCutCrossingsIncludeSeed } from './topology_loop_cut_belt.js';
import { remapLoopCutBeltCrossings } from './topology_loop_cut_belt_slide.js';
import { orderLoopCutCrossingsAroundPlane } from './topology_loop_cut_order.js';
import { splitTopologyWorkingEdge } from './topology_edge_split.js';
import type { TopologyOperatorResult } from './topology_operator_result.js';

/** Minimum crossings for a closed convex loop. */
const LOOP_CUT_MIN_CROSSINGS = 3;

/** Preview of a loop cut before it is committed. */
export interface TopologyLoopCutPreview {
  /** Edge crossings that form the loop. */
  crossings: TopologyLoopCutCrossing[];
}

/** Applied or refused loop cut, including vertices inserted on success. */
export interface TopologyLoopCutResult extends TopologyOperatorResult {
  /** New vertex indices in loop order, empty when refused. */
  insertedVertexIndices: readonly number[];
}

/**
 * Previews a convex-safe loop cut from a hovered edge.
 *
 * @param geometry Working geometry.
 * @param vertexA Hovered edge start.
 * @param vertexB Hovered edge end.
 * @param parameter Slide parameter on the hovered edge.
 * @param lockedEdges Optional first-click belt; when set only those edges are
 *   sliced.
 * @returns Preview, or null when no loop exists.
 */
export function previewTopologyLoopCut(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
  parameter: number,
  lockedEdges?: readonly TopologyWorkingEdge[],
): TopologyLoopCutPreview | null {
  const crossings = collectLoopCutCrossings(geometry, vertexA, vertexB, parameter, lockedEdges);
  if (!crossings || crossings.length < LOOP_CUT_MIN_CROSSINGS) {
    return null;
  }
  return { crossings };
}

/**
 * Applies a loop cut from a hovered edge and slide parameter.
 *
 * @param geometry Working geometry mutated in place.
 * @param vertexA Hovered edge start.
 * @param vertexB Hovered edge end.
 * @param parameter Slide parameter.
 * @param lockedEdges Optional first-click belt; when set only those edges are
 *   split.
 * @returns Operator result with inserted vertex indices on success.
 */
export function applyTopologyLoopCut(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
  parameter: number,
  lockedEdges?: readonly TopologyWorkingEdge[],
): TopologyLoopCutResult {
  const preview = previewTopologyLoopCut(geometry, vertexA, vertexB, parameter, lockedEdges);
  if (!preview) {
    return loopCutResultRefused('No loop from this edge');
  }
  return commitLoopCutPreview(geometry, preview);
}

/**
 * Collects plane crossings for a hovered-edge loop cut.
 *
 * @param geometry Working geometry.
 * @param vertexA Hovered edge start.
 * @param vertexB Hovered edge end.
 * @param parameter Slide parameter.
 * @param lockedEdges Optional first-click belt.
 * @returns Crossings, or null.
 */
function collectLoopCutCrossings(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
  parameter: number,
  lockedEdges?: readonly TopologyWorkingEdge[],
): TopologyLoopCutCrossing[] | null {
  if (lockedEdges) {
    return remapLoopCutBeltCrossings(geometry, vertexA, vertexB, parameter, lockedEdges);
  }
  const plane = createLoopCutSlicePlane(geometry, vertexA, vertexB, parameter);
  if (!plane) {
    return null;
  }
  return finalizeLoopCutCrossings(geometry, plane, vertexA, vertexB);
}

/**
 * Orders plane crossings and refuses a belt that dropped the seed edge.
 *
 * @param geometry Working geometry.
 * @param plane Slice plane.
 * @param vertexA Seed edge start.
 * @param vertexB Seed edge end.
 * @returns Ordered crossings, or null.
 */
function finalizeLoopCutCrossings(
  geometry: TopologyWorkingGeometry,
  plane: Plane,
  vertexA: number,
  vertexB: number,
): TopologyLoopCutCrossing[] | null {
  const ordered = orderLoopCutCrossingsAroundPlane(
    geometry,
    collectLoopCutPlaneCrossings(geometry, collectTopologyWorkingEdges(geometry), plane),
    plane,
  );
  if (!loopCutCrossingsIncludeSeed(ordered, { vertexA, vertexB })) {
    return null;
  }
  return ordered;
}

/**
 * Inserts the preview crossings and splits the crossed faces.
 *
 * @param geometry Working geometry mutated in place.
 * @param preview Valid loop preview.
 * @returns Applied result, or a refusal when a vertex cannot be inserted.
 */
function commitLoopCutPreview(
  geometry: TopologyWorkingGeometry,
  preview: TopologyLoopCutPreview,
): TopologyLoopCutResult {
  const inserted = insertLoopCutVertices(geometry, preview.crossings);
  if (!inserted) {
    return loopCutResultRefused('Loop cut could not insert vertices');
  }
  splitFacesAcrossLoop(geometry, inserted);
  return loopCutResultApplied(inserted);
}

/**
 * Builds a refused loop-cut result.
 *
 * @param message Refusal reason.
 * @returns Refused result with no inserted vertices.
 */
function loopCutResultRefused(message: string): TopologyLoopCutResult {
  return { applied: false, message, insertedVertexIndices: [] };
}

/**
 * Builds an applied loop-cut result.
 *
 * @param insertedVertexIndices New vertices in loop order.
 * @returns Applied result.
 */
function loopCutResultApplied(insertedVertexIndices: readonly number[]): TopologyLoopCutResult {
  return { applied: true, message: '', insertedVertexIndices };
}

/**
 * Inserts a vertex on every loop-cut crossing.
 *
 * @param geometry Working geometry.
 * @param crossings Loop crossings.
 * @returns New vertex indices aligned with crossings, or null.
 */
function insertLoopCutVertices(
  geometry: TopologyWorkingGeometry,
  crossings: readonly TopologyLoopCutCrossing[],
): number[] | null {
  const inserted: number[] = [];
  for (const crossing of crossings) {
    const result = splitTopologyWorkingEdge(geometry, crossing.vertexA, crossing.vertexB, crossing.parameter);
    if (!result) {
      return null;
    }
    inserted.push(result.newVertexIndex);
  }
  return inserted;
}

/**
 * Splits every face that received exactly two new loop vertices.
 *
 * @param geometry Working geometry.
 * @param inserted New vertex indices.
 */
function splitFacesAcrossLoop(geometry: TopologyWorkingGeometry, inserted: readonly number[]): void {
  const insertedSet = new Set(inserted);
  const extras: TopologyWorkingFace[] = [];
  for (const face of geometry.faces) {
    const pair = findTwoInsertedCorners(face, insertedSet);
    if (!pair) {
      continue;
    }
    const second = splitWorkingFaceBetweenVertices(face, pair.first, pair.second);
    if (second) {
      extras.push(second);
    }
  }
  for (const extra of extras) {
    geometry.faces.push(extra);
  }
}

/**
 * Finds two newly inserted vertices on a face.
 *
 * @param face Face to inspect.
 * @param inserted Inserted vertex set.
 * @returns The two vertices, or null.
 */
function findTwoInsertedCorners(
  face: TopologyWorkingFace,
  inserted: ReadonlySet<number>,
): { first: number; second: number } | null {
  const hits: number[] = [];
  for (const vertexIndex of face.vertexIndices) {
    if (inserted.has(vertexIndex)) {
      hits.push(vertexIndex);
    }
  }
  if (hits.length !== 2 || hits[0] === undefined || hits[1] === undefined) {
    return null;
  }
  return { first: hits[0], second: hits[1] };
}
