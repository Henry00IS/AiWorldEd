import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelNormalsExceedAngle } from './modifier_bevel_angle.js';
import { modifierBevelPlanesForEdge } from './modifier_bevel_round_planes.js';
import { modifierBevelSegmentIntersectsAabb } from './modifier_bevel_segment_aabb.js';

const scratchInverse = new THREE.Matrix4();
const scratchSegmentStart = new THREE.Vector3();
const scratchSegmentEnd = new THREE.Vector3();
const scratchNormalMatrix = new THREE.Matrix3();
const fallbackVolumeBounds = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));

/** One undirected brush edge that a volume wants chamfered. */
export interface ModifierBevelEdgeCut {
  /** Clip plane in the same space as the brush vertices. */
  plane: SolidPlane;
}

/** One beveled edge plus the volume settings that selected it. */
export interface ModifierBevelTrackedEdge {
  /** World start of the edge. */
  start: THREE.Vector3;
  /** World end of the edge. */
  end: THREE.Vector3;
  /** Outward unit normal of the first face. */
  normalA: THREE.Vector3;
  /** Outward unit normal of the second face. */
  normalB: THREE.Vector3;
  /** Distance along each face. */
  distance: number;
  /** Profile face count. */
  segments: number;
  /** Volume that selected the edge. */
  volume: THREE.Object3D;
  /** Clip planes for the edge strip. */
  planes: SolidPlane[];
}

/**
 * Collects beveled edges that meet any volume box.
 *
 * @param brush Brush in the same space as `brushMatrix`.
 * @param brushMatrix Transforms brush vertices into world space.
 * @param volumes Bevel volumes with current world matrices.
 * @returns Tracked edges in wing order.
 */
export function modifierBevelTrackedEdges(
  brush: SolidBrush,
  brushMatrix: THREE.Matrix4,
  volumes: readonly THREE.Object3D[],
): ModifierBevelTrackedEdge[] {
  const tracked: ModifierBevelTrackedEdge[] = [];
  for (let edgeIndex = 0; edgeIndex < brush.wingEdges.length; edgeIndex++) {
    const edge = modifierBevelTrackEdge(brush, edgeIndex, brushMatrix, volumes);
    if (edge) tracked.push(edge);
  }
  return tracked;
}

/**
 * Builds a tracked edge when this half-edge is canonical and hits a volume.
 *
 * @param brush Source brush.
 * @param edgeIndex Wing-edge index.
 * @param brushMatrix Brush-to-world matrix.
 * @param volumes Bevel volumes.
 * @returns Edge, or null when the edge is skipped.
 */
function modifierBevelTrackEdge(
  brush: SolidBrush,
  edgeIndex: number,
  brushMatrix: THREE.Matrix4,
  volumes: readonly THREE.Object3D[],
): ModifierBevelTrackedEdge | null {
  const segment = modifierBevelCanonicalSegment(brush, edgeIndex, brushMatrix);
  const hit = segment ? modifierBevelFirstHittingVolume(segment.start, segment.end, volumes) : null;
  const normals = segment && hit ? modifierBevelWorldNormals(brush, edgeIndex, brushMatrix) : null;
  if (!segment || !hit || !normals) return null;
  if (!modifierBevelNormalsExceedAngle(normals.normalA, normals.normalB, ModifierVolumeBevel.readAngleDegrees(hit))) {
    return null;
  }
  return modifierBevelTrackedFromHit(segment, normals, hit);
}

/**
 * Returns the world segment for the canonical half of an edge.
 *
 * @param brush Source brush.
 * @param edgeIndex Wing-edge index.
 * @param brushMatrix Brush-to-world matrix.
 * @returns Segment, or null when this half is the twin or vertices are missing.
 */
function modifierBevelCanonicalSegment(
  brush: SolidBrush,
  edgeIndex: number,
  brushMatrix: THREE.Matrix4,
): { start: THREE.Vector3; end: THREE.Vector3; midpoint: THREE.Vector3 } | null {
  const edge = brush.wingEdges[edgeIndex];
  if (!edge || edgeIndex > edge.twinIndex) return null;
  return modifierBevelWorldSegment(brush, edgeIndex, brushMatrix);
}

/**
 * Assembles planes and volume settings for one accepted edge.
 *
 * @param segment World segment.
 * @param normals Face normals.
 * @param hit Volume that contains the segment.
 * @returns Tracked edge.
 */
function modifierBevelTrackedFromHit(
  segment: { start: THREE.Vector3; end: THREE.Vector3; midpoint: THREE.Vector3 },
  normals: { normalA: THREE.Vector3; normalB: THREE.Vector3 },
  hit: THREE.Object3D,
): ModifierBevelTrackedEdge | null {
  const edgeDirection = new THREE.Vector3().subVectors(segment.end, segment.start);
  if (edgeDirection.lengthSq() < 1e-12) return null;
  edgeDirection.normalize();
  const distance = ModifierVolumeBevel.readDistance(hit);
  const segments = ModifierVolumeBevel.readSegments(hit);
  const planes = modifierBevelPlanesForEdge(
    segment.midpoint,
    edgeDirection,
    normals.normalA,
    normals.normalB,
    distance,
    segments,
  );
  return modifierBevelTrackedRecord(segment, normals, hit, distance, segments, planes);
}

/**
 * Stores one accepted edge with the volume settings that selected it.
 *
 * @param segment World segment.
 * @param normals Face normals.
 * @param hit Selecting volume.
 * @param distance Face distance.
 * @param segments Profile count.
 * @param planes Edge clip planes.
 * @returns Tracked edge.
 */
function modifierBevelTrackedRecord(
  segment: { start: THREE.Vector3; end: THREE.Vector3 },
  normals: { normalA: THREE.Vector3; normalB: THREE.Vector3 },
  hit: THREE.Object3D,
  distance: number,
  segments: number,
  planes: SolidPlane[],
): ModifierBevelTrackedEdge {
  return {
    start: segment.start,
    end: segment.end,
    normalA: normals.normalA,
    normalB: normals.normalB,
    distance,
    segments,
    volume: hit,
    planes,
  };
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
  scratchInverse.copy(volume.matrixWorld).invert();
  scratchSegmentStart.copy(start).applyMatrix4(scratchInverse);
  scratchSegmentEnd.copy(end).applyMatrix4(scratchInverse);
  return modifierBevelSegmentIntersectsAabb(
    scratchSegmentStart,
    scratchSegmentEnd,
    modifierBevelVolumeLocalBounds(volume),
  );
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
  if (!geometry) return fallbackVolumeBounds;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox ?? fallbackVolumeBounds;
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
  scratchNormalMatrix.getNormalMatrix(brushMatrix);
  const normalA = localA.clone().applyMatrix3(scratchNormalMatrix).normalize();
  const normalB = localB.clone().applyMatrix3(scratchNormalMatrix).normalize();
  return { normalA, normalB };
}
