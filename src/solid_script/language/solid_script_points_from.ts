import * as THREE from 'three';
import { solidScriptKindNamed } from './solid_script_kinds.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import type { SolidScriptEdgeFacts, SolidScriptFaceFacts, SolidScriptVertexFacts } from './solid_script_geometry.js';
import { solidScriptOfEmpty } from './solid_script_select.js';
import { SolidScriptElement } from './solid_script_value.js';

/** One point taken from a face, edge or vertex, with the way it looks out. */
export interface SolidScriptPointsFromItem {
  /** Position in script space, in metres. */
  position: THREE.Vector3;
  /** Unit direction the point looks out. */
  normal: THREE.Vector3;
}

/**
 * Outward direction of an edge: the average of the faces that meet there.
 *
 * @param edge Edge.
 * @returns Unit direction.
 */
export function solidScriptPointsFromEdgeNormal(edge: SolidScriptEdgeFacts): THREE.Vector3 {
  const [first, second] = edge.faces;
  const normal = first.normal.clone();
  if (second) normal.add(second.normal);
  if (normal.lengthSq() < 1e-18) return first.normal.clone();
  return normal.normalize();
}

/**
 * Points at the center of each face, looking the way the face looks.
 *
 * @param faces Faces.
 * @returns Points.
 */
export function solidScriptPointsFromFaces(faces: readonly SolidScriptFaceFacts[]): SolidScriptPointsFromItem[] {
  return faces.map((face) => ({ position: face.center.clone(), normal: face.normal.clone() }));
}

/**
 * Points at the middle of each edge, looking out from the faces that meet
 * there.
 *
 * @param edges Edges.
 * @returns Points.
 */
export function solidScriptPointsFromEdges(edges: readonly SolidScriptEdgeFacts[]): SolidScriptPointsFromItem[] {
  return edges.map((edge) => ({ position: edge.center.clone(), normal: solidScriptPointsFromEdgeNormal(edge) }));
}

/**
 * Points at each vertex, looking the average way of the faces around it.
 *
 * @param vertices Vertices.
 * @returns Points.
 */
export function solidScriptPointsFromVertices(
  vertices: readonly SolidScriptVertexFacts[],
): SolidScriptPointsFromItem[] {
  return vertices.map((vertex) => ({ position: vertex.position.clone(), normal: vertex.normal.clone() }));
}

/**
 * Reads edges a Points From Edges line works on: Of (edges, faces or brushes),
 * else [$Selected.Edges], else the edges of [$Selected.Faces].
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Edges.
 */
export function solidScriptPointsFromEdgeTargets(run: SolidScriptBlockRun, label: string): SolidScriptEdgeFacts[] {
  const given = run.ofValues();
  const picked = run.selectedGet('edges');
  const values = given ?? (picked.length > 0 ? picked : run.selectedGet('faces'));
  if (values.length === 0) throw new Error(given ? `${label} has no edges in Of` : solidScriptOfEmpty(label, 'edges'));
  const edges: SolidScriptEdgeFacts[] = [];
  for (const value of values) {
    if (!(value instanceof SolidScriptElement) || value.kind === 'vertex' || value.kind === 'data')
      throw new Error(`${label} takes edges, faces or brushes, not ${solidScriptKindNamed(value)}`);
    for (const edge of run.elements.edges(value))
      if (!edges.some((known) => known.faces[0].leaf === edge.faces[0].leaf && known.index === edge.index))
        edges.push(edge);
  }
  return edges;
}

/**
 * Reads vertices a Points From Vertices line works on: Of (vertices, faces or
 * brushes), else [$Selected.Vertices], else the vertices of [$Selected.Faces].
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Vertices.
 */
export function solidScriptPointsFromVertexTargets(run: SolidScriptBlockRun, label: string): SolidScriptVertexFacts[] {
  const given = run.ofValues();
  const picked = run.selectedGet('vertices');
  const values = given ?? (picked.length > 0 ? picked : run.selectedGet('faces'));
  if (values.length === 0)
    throw new Error(given ? `${label} has no vertices in Of` : solidScriptOfEmpty(label, 'vertices'));
  const vertices: SolidScriptVertexFacts[] = [];
  for (const value of values) {
    if (!(value instanceof SolidScriptElement) || value.kind === 'edge' || value.kind === 'data')
      throw new Error(`${label} takes vertices, faces or brushes, not ${solidScriptKindNamed(value)}`);
    for (const vertex of run.elements.vertices(value))
      if (!vertices.some((known) => known.index === vertex.index && known.position.distanceTo(vertex.position) < 1e-6))
        vertices.push(vertex);
  }
  return vertices;
}
