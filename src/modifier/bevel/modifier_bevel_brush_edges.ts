import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelPlaneForEdge } from './modifier_bevel_plane.js';
import { modifierBevelSegmentIntersectsAabb } from './modifier_bevel_segment_aabb.js';

/** One undirected brush edge that a volume wants chamfered. */
export interface ModifierBevelEdgeCut {
  /** Clip plane in the same space as the brush vertices. */
  plane: SolidPlane;
}

/**
 * Collects chamfer planes for edges that meet any volume box.
 *
 * @param brush Brush in the same space as `brushMatrix`.
 * @param brushMatrix Transforms brush vertices into world space.
 * @param volumes Bevel volumes with current world matrices.
 * @returns Planes to clip, in edge order.
 */
export function modifierBevelEdgePlanes(
  brush: SolidBrush,
  brushMatrix: THREE.Matrix4,
  volumes: readonly THREE.Object3D[],
): ModifierBevelEdgeCut[] {
  const cuts: ModifierBevelEdgeCut[] = [];
  for (let edgeIndex = 0; edgeIndex < brush.wingEdges.length; edgeIndex++) {
    const cut = modifierBevelCutForEdge(brush, edgeIndex, brushMatrix, volumes);
    if (cut) cuts.push(cut);
  }
  return cuts;
}

/**
 * Builds a chamfer plane when this half-edge is the canonical direction and
 * hits a volume.
 *
 * @param brush Source brush.
 * @param edgeIndex Wing-edge index.
 * @param brushMatrix Brush-to-world matrix.
 * @param volumes Bevel volumes.
 * @returns Cut, or null when the edge is skipped.
 */
function modifierBevelCutForEdge(
  brush: SolidBrush,
  edgeIndex: number,
  brushMatrix: THREE.Matrix4,
  volumes: readonly THREE.Object3D[],
): ModifierBevelEdgeCut | null {
  const edge = brush.wingEdges[edgeIndex];
  if (!edge || edgeIndex > edge.twinIndex) return null;
  const segment = modifierBevelWorldSegment(brush, edgeIndex, brushMatrix);
  const hit = segment ? modifierBevelFirstHittingVolume(segment.start, segment.end, volumes) : null;
  if (!segment || !hit) return null;
  const distance = ModifierVolumeBevel.readDistance(hit);
  const plane = modifierBevelPlaneFromEdge(brush, edgeIndex, brushMatrix, segment.midpoint, distance);
  if (!plane) return null;
  return { plane };
}

/**
 * Returns world endpoints of one wing edge.
 *
 * @param brush Source brush.
 * @param edgeIndex Wing-edge index.
 * @param brushMatrix Brush-to-world matrix.
 * @returns Segment, or null when vertices are missing.
 */
function modifierBevelWorldSegment(
  brush: SolidBrush,
  edgeIndex: number,
  brushMatrix: THREE.Matrix4,
): { start: THREE.Vector3; end: THREE.Vector3; midpoint: THREE.Vector3 } | null {
  const edge = brush.wingEdges[edgeIndex];
  const twin = edge ? brush.wingEdges[edge.twinIndex] : undefined;
  if (!edge || !twin) return null;
  const start = brush.vertices[twin.vertexIndex]?.clone().applyMatrix4(brushMatrix);
  const end = brush.vertices[edge.vertexIndex]?.clone().applyMatrix4(brushMatrix);
  if (!start || !end) return null;
  const midpoint = start.clone().lerp(end, 0.5);
  return { start, end, midpoint };
}

/**
 * Returns whether a world segment meets a visible volume.
 *
 * @param start World start.
 * @param end World end.
 * @param volumes Bevel volumes.
 * @returns True when any volume contains part of the segment.
 */
function modifierBevelFirstHittingVolume(
  start: THREE.Vector3,
  end: THREE.Vector3,
  volumes: readonly THREE.Object3D[],
): THREE.Object3D | null {
  for (const volume of volumes) {
    if (!volume.visible) continue;
    if (modifierBevelSegmentHitsOneVolume(start, end, volume)) return volume;
  }
  return null;
}

/**
 * Tests one volume's local box against a world segment.
 *
 * @param start World start.
 * @param end World end.
 * @param volume Bevel volume.
 * @returns True when the segment intersects the box.
 */
function modifierBevelSegmentHitsOneVolume(start: THREE.Vector3, end: THREE.Vector3, volume: THREE.Object3D): boolean {
  const inverse = new THREE.Matrix4().copy(volume.matrixWorld).invert();
  const localStart = start.clone().applyMatrix4(inverse);
  const localEnd = end.clone().applyMatrix4(inverse);
  const bounds = modifierBevelVolumeLocalBounds(volume);
  return modifierBevelSegmentIntersectsAabb(localStart, localEnd, bounds);
}

/**
 * Returns the volume geometry's local bounding box.
 *
 * @param volume Bevel volume.
 * @returns Local bounds, or a unit box when geometry is missing.
 */
function modifierBevelVolumeLocalBounds(volume: THREE.Object3D): THREE.Box3 {
  const mesh = volume as THREE.Mesh;
  const geometry = mesh.geometry;
  if (!geometry) return new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox?.clone() ?? new THREE.Box3();
}

/**
 * Builds the chamfer plane for one edge in world space.
 *
 * @param brush Source brush.
 * @param edgeIndex Wing-edge index.
 * @param midpoint World midpoint of the edge.
 * @param distance Chamfer distance.
 * @returns Plane, or null when the faces are degenerate.
 */
function modifierBevelPlaneFromEdge(
  brush: SolidBrush,
  edgeIndex: number,
  brushMatrix: THREE.Matrix4,
  midpoint: THREE.Vector3,
  distance: number,
): SolidPlane | null {
  const normals = modifierBevelWorldNormals(brush, edgeIndex, brushMatrix);
  if (!normals) return null;
  return modifierBevelPlaneForEdge(midpoint, normals.normalA, normals.normalB, distance);
}

/**
 * Transforms the two face normals of an edge into world space.
 *
 * @param brush Source brush.
 * @param edgeIndex Wing-edge index.
 * @param brushMatrix Brush-to-world matrix.
 * @returns Unit world normals, or null when a face is missing.
 */
function modifierBevelWorldNormals(
  brush: SolidBrush,
  edgeIndex: number,
  brushMatrix: THREE.Matrix4,
): { normalA: THREE.Vector3; normalB: THREE.Vector3 } | null {
  const edge = brush.wingEdges[edgeIndex];
  if (!edge) return null;
  const localA = brush.planes[brush.edgeFaceIndices[edgeIndex] ?? -1]?.normal;
  const localB = brush.planes[brush.edgeFaceIndices[edge.twinIndex] ?? -1]?.normal;
  if (!localA || !localB) return null;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(brushMatrix);
  const normalA = localA.clone().applyMatrix3(normalMatrix).normalize();
  const normalB = localB.clone().applyMatrix3(normalMatrix).normalize();
  return { normalA, normalB };
}
