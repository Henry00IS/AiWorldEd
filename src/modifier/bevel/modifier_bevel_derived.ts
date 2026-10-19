import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierBevelUvLayout } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import type { ModifierBevelUvPlacement } from '@/modifier/volume/modifier_volume_bevel_uv_placement.js';
import { modifierBevelClipBrush } from './modifier_bevel_brush_clip.js';
import { modifierBevelVolumeStyle, type ModifierBevelVolumeStyle } from './modifier_bevel_volume_priority.js';
import {
  modifierBevelTrackedEdges,
  type ModifierBevelEdgeCut,
  type ModifierBevelTrackedEdge,
} from './modifier_bevel_brush_edges.js';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';
import { modifierBevelParentScores } from './modifier_bevel_inherit_score.js';
import { modifierBevelInheritFaces } from './modifier_bevel_surface_inherit.js';
import { modifierBevelApplyCurveOwner } from './modifier_bevel_uv_owner.js';
import {
  modifierBevelBuildGirders,
  modifierBevelGirderIndices,
  type ModifierBevelGirder,
} from './modifier_bevel_uv_girder.js';

/**
 * Chamfered local brush plus face inherit records. The authored brush is
 * untouched.
 */
export interface ModifierBevelDerivedBrush {
  /** Chamfered brush in brush-local space. */
  localBrush: SolidBrush;
  /** Inherit record per derived face. */
  faces: ModifierBevelFaceRecord[];
  /** How generated faces place the texture. */
  layout: ModifierBevelUvLayout;
  /** Texture on generated faces. Empty inherits the parent face. */
  textureId: string;
  /** Scale, offset, and rotation applied to generated UVs. */
  placement: ModifierBevelUvPlacement;
  /** Authored edges used as the length and profile chart. */
  girders: ModifierBevelGirder[];
  /** Girder index per derived face, or -1. */
  girderOfFace: number[];
}

/**
 * Chamfers brush edges that meet the volumes. Returns null when no edge is cut.
 *
 * @param instance Authored brush instance. Its brush is not modified.
 * @param volumes Live bevel volumes with current world matrices.
 * @returns Derived local brush, or null when the volume misses every edge.
 */
export function modifierBevelDeriveBrush(
  instance: SolidBrushInstance,
  volumes: readonly THREE.Object3D[],
): ModifierBevelDerivedBrush | null {
  const mesh = instance.mesh;
  if (!mesh || volumes.length === 0) return null;
  mesh.updateMatrixWorld(true);
  const worldBrush = instance.brush.clone();
  worldBrush.transformVertices(mesh.matrixWorld);
  const style = modifierBevelVolumeStyle(volumes);
  return modifierBevelDeriveWorld(instance.brush, worldBrush, mesh.matrixWorld, volumes, style);
}

/**
 * Builds the derived brush in world space, then returns it to local space.
 *
 * @param sourceBrush Authored local brush.
 * @param worldBrush Brush transformed into world space.
 * @param worldMatrix Brush mesh world matrix.
 * @param volumes Bevel volumes with current world matrices.
 * @param style UV flow, layout, and texture from the priority volume.
 * @returns Derived local brush, or null when the volume misses every edge.
 */
function modifierBevelDeriveWorld(
  sourceBrush: SolidBrush,
  worldBrush: SolidBrush,
  worldMatrix: THREE.Matrix4,
  volumes: readonly THREE.Object3D[],
  style: ModifierBevelVolumeStyle,
): ModifierBevelDerivedBrush | null {
  const tracked = modifierBevelTrackedEdges(worldBrush, new THREE.Matrix4(), volumes);
  if (tracked.length === 0) return null;
  return modifierBevelClipDerived(sourceBrush, worldBrush, worldMatrix, tracked, style);
}

/**
 * Clips a world brush and matches the result back to the authored faces.
 *
 * @param sourceBrush Authored local brush.
 * @param worldBrush Brush transformed into world space.
 * @param worldMatrix Brush mesh world matrix.
 * @param tracked Accepted edges.
 * @param style UV flow, layout, and texture from the priority volume.
 * @returns Derived local brush, or null when no plane cuts the solid.
 */
function modifierBevelClipDerived(
  sourceBrush: SolidBrush,
  worldBrush: SolidBrush,
  worldMatrix: THREE.Matrix4,
  tracked: readonly ModifierBevelTrackedEdge[],
  style: ModifierBevelVolumeStyle,
): ModifierBevelDerivedBrush | null {
  const cuts = modifierBevelEdgeCuts(tracked);
  if (cuts.length === 0) return null;
  const chamfered = modifierBevelClipBrush(worldBrush, cuts);
  if (chamfered === worldBrush) return null;
  return modifierBevelToLocalDerived(sourceBrush, chamfered, worldMatrix, tracked, style);
}

/**
 * Flattens the clip planes already stored on tracked edges.
 *
 * @param tracked Accepted edges.
 * @returns Edge planes in wing order.
 */
function modifierBevelEdgeCuts(tracked: readonly ModifierBevelTrackedEdge[]): ModifierBevelEdgeCut[] {
  const cuts: ModifierBevelEdgeCut[] = [];
  for (const edge of tracked) {
    for (const plane of edge.planes) cuts.push({ plane });
  }
  return cuts;
}

/**
 * Converts a world-space chamfer back into brush-local space and matches faces.
 *
 * @param sourceBrush Authored local brush.
 * @param worldBrush Chamfered world brush.
 * @param worldMatrix Brush mesh world matrix.
 * @param tracked Accepted edges.
 * @param style UV flow, layout, and texture from the priority volume.
 * @returns Local derived brush and face records.
 */
function modifierBevelToLocalDerived(
  sourceBrush: SolidBrush,
  worldBrush: SolidBrush,
  worldMatrix: THREE.Matrix4,
  tracked: readonly ModifierBevelTrackedEdge[],
  style: ModifierBevelVolumeStyle,
): ModifierBevelDerivedBrush {
  const localBrush = worldBrush.clone();
  localBrush.transformVertices(new THREE.Matrix4().copy(worldMatrix).invert());
  const girders = modifierBevelBuildGirders(tracked, worldMatrix);
  const faces = modifierBevelLocalFaces(sourceBrush, localBrush, worldMatrix, style, girders);
  return modifierBevelDerivedRecord(localBrush, faces, style, girders, modifierBevelGirderIndices(localBrush, girders));
}

/**
 * Inherits faces and applies the curve owner.
 *
 * @param sourceBrush Authored local brush.
 * @param localBrush Chamfered local brush.
 * @param worldMatrix Brush mesh world matrix.
 * @param style UV flow and owner from the priority volume.
 * @param girders Authored edges in brush-local space.
 * @returns Face records.
 */
function modifierBevelLocalFaces(
  sourceBrush: SolidBrush,
  localBrush: SolidBrush,
  worldMatrix: THREE.Matrix4,
  style: ModifierBevelVolumeStyle,
  girders: readonly ModifierBevelGirder[],
): ModifierBevelFaceRecord[] {
  const scores = modifierBevelParentScores(sourceBrush, worldMatrix);
  return modifierBevelOwnedFaces(
    sourceBrush,
    localBrush,
    modifierBevelInheritScored(sourceBrush, localBrush, worldMatrix, style, scores),
    worldMatrix,
    style,
    scores,
    girders,
  );
}

/**
 * Inherits faces with scores already measured for the curve owner.
 *
 * @param sourceBrush Authored local brush.
 * @param localBrush Chamfered local brush.
 * @param worldMatrix Brush mesh world matrix.
 * @param style UV flow and space from the priority volume.
 * @param scores Authored face scores.
 * @returns Split inherit records.
 */
function modifierBevelInheritScored(
  sourceBrush: SolidBrush,
  localBrush: SolidBrush,
  worldMatrix: THREE.Matrix4,
  style: ModifierBevelVolumeStyle,
  scores: ReturnType<typeof modifierBevelParentScores>,
): ModifierBevelFaceRecord[] {
  return modifierBevelInheritFaces(sourceBrush, localBrush, worldMatrix, style.flow, style.placement.uvSpace, scores);
}

/**
 * Stores the derived brush fields.
 *
 * @param localBrush Chamfered local brush.
 * @param faces Face records.
 * @param style UV layout and texture from the priority volume.
 * @param girders Authored edge charts.
 * @param girderOfFace Girder index per face.
 * @returns Derived brush.
 */
function modifierBevelDerivedRecord(
  localBrush: SolidBrush,
  faces: ModifierBevelFaceRecord[],
  style: ModifierBevelVolumeStyle,
  girders: ModifierBevelGirder[],
  girderOfFace: number[],
): ModifierBevelDerivedBrush {
  return {
    localBrush,
    faces,
    layout: style.layout,
    textureId: style.textureId,
    placement: style.placement,
    girders,
    girderOfFace,
  };
}

/**
 * Applies single ownership when the volume asks for one parent per curve.
 *
 * @param sourceBrush Authored local brush.
 * @param localBrush Chamfered local brush.
 * @param inherited Split inherit records.
 * @param worldMatrix Brush mesh world matrix.
 * @param style UV flow and owner from the priority volume.
 * @param scores Authored face scores.
 * @param girders Authored edges in brush-local space.
 * @returns Face records.
 */
function modifierBevelOwnedFaces(
  sourceBrush: SolidBrush,
  localBrush: SolidBrush,
  inherited: ModifierBevelFaceRecord[],
  worldMatrix: THREE.Matrix4,
  style: ModifierBevelVolumeStyle,
  scores: ReturnType<typeof modifierBevelParentScores>,
  girders: readonly ModifierBevelGirder[],
): ModifierBevelFaceRecord[] {
  return modifierBevelApplyCurveOwner(sourceBrush, localBrush, inherited, worldMatrix, style, scores, girders);
}
