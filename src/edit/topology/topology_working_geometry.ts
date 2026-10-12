import type { Vector3 } from 'three';
import { cloneTopologyWorkingFace, type TopologyWorkingFace } from './topology_working_face.js';

/** Mutable vertex-and-face working copy used by topology operators. */
export interface TopologyWorkingGeometry {
  /** Local-space vertex positions. */
  positions: Vector3[];
  /** Polygonal faces referencing {@link positions}. */
  faces: TopologyWorkingFace[];
}

/**
 * Deep-clones working geometry.
 *
 * @param geometry Source geometry.
 * @returns Independent copy.
 */
export function cloneTopologyWorkingGeometry(geometry: TopologyWorkingGeometry): TopologyWorkingGeometry {
  return {
    positions: geometry.positions.map((position) => position.clone()),
    faces: geometry.faces.map((face) => cloneTopologyWorkingFace(face)),
  };
}

/**
 * Copies the arrays of one working geometry onto another.
 *
 * @param target Geometry that receives the arrays.
 * @param source Geometry whose arrays are assigned.
 */
export function assignTopologyWorkingGeometry(target: TopologyWorkingGeometry, source: TopologyWorkingGeometry): void {
  target.positions = source.positions;
  target.faces = source.faces;
}

/**
 * Returns the vertex count of working geometry.
 *
 * @param geometry Geometry to measure.
 * @returns Vertex count.
 */
export function topologyWorkingVertexCount(geometry: TopologyWorkingGeometry): number {
  return geometry.positions.length;
}

/**
 * Returns the face count of working geometry.
 *
 * @param geometry Geometry to measure.
 * @returns Face count.
 */
export function topologyWorkingFaceCount(geometry: TopologyWorkingGeometry): number {
  return geometry.faces.length;
}
