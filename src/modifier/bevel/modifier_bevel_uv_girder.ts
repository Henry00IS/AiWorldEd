import { Matrix4, Vector3 } from 'three';
import type { ModifierBevelTrackedEdge } from './modifier_bevel_brush_edges.js';
import { modifierBevelGirderFromEdge } from './modifier_bevel_uv_girder_frame.js';
import { modifierBevelAssignGirderFaces } from './modifier_bevel_uv_girder_assign.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';

/** Length and profile of one authored edge, in brush-local space. */
export interface ModifierBevelGirder {
  /** Convex profile shape used by this strip. */
  profileShape?: number;
  /** Optional non-circular profile samples in brush-local space. */
  profileSamples?: Vector3[];
  /** Brush-local to world transform at derivation time. */
  localToWorld: Matrix4;
  /** Unit direction along the authored edge. */
  direction: Vector3;
  /** Point where length is zero. */
  origin: Vector3;
  /** First endpoint of the authored edge. */
  start: Vector3;
  /** Second endpoint of the authored edge. */
  end: Vector3;
  /** Unit direction from the edge toward the first wall contact. */
  contactA: Vector3;
  /** Unit direction from the edge toward the second wall contact. */
  contactB: Vector3;
  /** Point on the profile center line, in brush-local space. */
  profileOrigin: Vector3;
  /** Radial direction at the first profile contact, in brush-local space. */
  profileContactA: Vector3;
  /** Radial direction at the second profile contact, in brush-local space. */
  profileContactB: Vector3;
  /** Number of authored profile chords. */
  profileSegments: number;
  /** World radial length at the profile contacts. */
  profileRadius: number;
  /** World length of the full profile curve. */
  profileMeters: number;
  /** World length of the authored edge. */
  edgeMeters: number;
}

/**
 * Builds one local girder for each beveled edge.
 *
 * @param tracked Edges accepted by the volumes, in world space.
 * @param worldMatrix Brush local-to-world matrix.
 * @returns Local girders.
 */
export function modifierBevelBuildGirders(
  tracked: readonly ModifierBevelTrackedEdge[],
  worldMatrix: Matrix4,
): ModifierBevelGirder[] {
  const inverse = new Matrix4().copy(worldMatrix).invert();
  const girders: ModifierBevelGirder[] = [];
  for (const edge of tracked) modifierBevelPushGirder(girders, edge, inverse);
  return girders;
}

/**
 * Appends a girder when the edge has a usable profile.
 *
 * @param girders Girders already built.
 * @param edge Tracked world edge.
 * @param inverse World-to-local matrix.
 */
function modifierBevelPushGirder(
  girders: ModifierBevelGirder[],
  edge: ModifierBevelTrackedEdge,
  inverse: Matrix4,
): void {
  const girder = modifierBevelGirderFromEdge(edge, inverse);
  if (girder) girders.push(girder);
}

/**
 * Picks the girder that owns each face.
 *
 * @param brush Chamfered local brush.
 * @param girders Local girders.
 * @returns Girder index per face, or -1.
 */
export function modifierBevelGirderIndices(brush: SolidBrush, girders: readonly ModifierBevelGirder[]): number[] {
  return modifierBevelAssignGirderFaces(brush, girders);
}
