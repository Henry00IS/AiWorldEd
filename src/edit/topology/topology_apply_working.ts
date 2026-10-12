import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';
import { MESH_EDIT_DOCUMENT_USERDATA_KEY } from '@/edit/mesh/mesh_edit_binding.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { applyTransferredSurfacesToInstance } from '@/solid/brush/solid_brush_surface_transfer.js';
import { deserializeFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import { markSolidBrushConvexityState } from '@/edit/transform/brush_edit_convexity.js';
import { workingGeometryToBrush } from './topology_working_from_brush.js';
import { workingGeometryToMeshDocument } from './topology_working_from_mesh.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import type { TopologyBrushTarget, TopologyEditTarget, TopologyMeshTarget } from './topology_target.js';
import type { TopologyBrushSnapshot } from './topology_snapshot.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';

/**
 * Writes working geometry onto a live target and rebuilds displays.
 *
 * @param target Live target.
 * @param geometry Working geometry.
 * @param sourceSnapshot Snapshot taken before the edit (for brush UV transfer).
 * @returns Operator result.
 */
export function applyWorkingGeometryToTarget(
  target: TopologyEditTarget,
  geometry: TopologyWorkingGeometry,
  sourceSnapshot: TopologyBrushSnapshot | null,
): TopologyOperatorResult {
  if (target.kind === 'mesh') {
    return applyWorkingGeometryToMesh(target, geometry);
  }
  return applyWorkingGeometryToBrush(target, geometry, sourceSnapshot);
}

/**
 * Rebuilds a mesh document from working geometry and writes display buffers.
 *
 * @param target Mesh target.
 * @param geometry Working geometry.
 * @returns Operator result.
 */
function applyWorkingGeometryToMesh(
  target: TopologyMeshTarget,
  geometry: TopologyWorkingGeometry,
): TopologyOperatorResult {
  const document = workingGeometryToMeshDocument(geometry);
  target.document = document;
  target.mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = document;
  writeMeshDocumentDisplayGeometry(target.mesh, document);
  return topologyOperatorApplied();
}

/**
 * Rebuilds a brush from working geometry and recompiles CSG.
 *
 * @param target Brush target.
 * @param geometry Working geometry.
 * @param sourceSnapshot Pre-edit snapshot for UV transfer.
 * @returns Operator result.
 */
function applyWorkingGeometryToBrush(
  target: TopologyBrushTarget,
  geometry: TopologyWorkingGeometry,
  sourceSnapshot: TopologyBrushSnapshot | null,
): TopologyOperatorResult {
  const brush = workingGeometryToBrush(geometry);
  if (!brush) {
    return topologyOperatorRefused('Brush topology is no longer a valid solid');
  }
  return commitBrushGeometry(target, brush, sourceSnapshot);
}

/**
 * Commits brush geometry onto the instance and rebuilds CSG.
 *
 * @param target Brush target.
 * @param brush New brush.
 * @param sourceSnapshot Pre-edit snapshot.
 * @returns Applied result.
 */
function commitBrushGeometry(
  target: TopologyBrushTarget,
  brush: import('@/solid/brush/solid_brush.js').SolidBrush,
  sourceSnapshot: TopologyBrushSnapshot | null,
): TopologyOperatorResult {
  const instance = target.solidModel.findBrush(target.brushId);
  if (!instance) {
    return topologyOperatorRefused('Brush instance is missing');
  }
  instance.brush = brush;
  target.brush = brush;
  transferBrushSurfacesFromSnapshot(target, sourceSnapshot);
  refreshCommittedBrushPreview(target);
  return topologyOperatorApplied();
}

/**
 * Transfers UV surfaces from the pre-edit snapshot by plane match.
 *
 * @param target Brush target already holding new geometry.
 * @param sourceSnapshot Pre-edit snapshot.
 */
function transferBrushSurfacesFromSnapshot(
  target: TopologyBrushTarget,
  sourceSnapshot: TopologyBrushSnapshot | null,
): void {
  const instance = target.solidModel.findBrush(target.brushId);
  if (!instance || !sourceSnapshot) {
    return;
  }
  const defaultSurface = sourceSnapshot.defaultSurface
    ? deserializeFaceSurface(sourceSnapshot.defaultSurface)
    : instance.getFaceSurface(0);
  const faceSurfaces = materializeSnapshotFaceSurfaces(sourceSnapshot);
  applyTransferredSurfacesToInstance(instance, sourceSnapshot.brush, defaultSurface, faceSurfaces);
}

/**
 * Materializes cloned face surfaces from a snapshot.
 *
 * @param sourceSnapshot Pre-edit snapshot.
 * @returns Face surfaces.
 */
function materializeSnapshotFaceSurfaces(
  sourceSnapshot: TopologyBrushSnapshot,
): import('@/texture/uv_matrix/face_surface_description.js').FaceSurfaceDescription[] {
  const faceSurfaces: import('@/texture/uv_matrix/face_surface_description.js').FaceSurfaceDescription[] = [];
  const stored = sourceSnapshot.faceSurfaces ?? [];
  for (let index = 0; index < sourceSnapshot.brush.faces.length; index++) {
    const serialized = stored[index];
    if (serialized) {
      faceSurfaces[index] = deserializeFaceSurface(serialized);
    }
  }
  return faceSurfaces;
}

/**
 * Rebuilds hull preview and compiled CSG for a committed brush.
 *
 * @param target Brush target.
 */
function refreshCommittedBrushPreview(target: TopologyBrushTarget): void {
  const instance = target.solidModel.findBrush(target.brushId);
  if (!instance) {
    return;
  }
  replaceCommittedHull(instance.mesh, instance.brush);
  target.solidModel.markBrushesDirty([target.brushId]);
  target.solidModel.rebuild();
}

/**
 * Replaces the hull preview and records whether solid compilation should skip
 * it.
 *
 * @param mesh Brush preview mesh, or null when the instance has no preview.
 * @param brush Committed brush.
 */
function replaceCommittedHull(mesh: TopologyBrushTarget['mesh'], brush: TopologyBrushTarget['brush']): void {
  if (!mesh) {
    return;
  }
  SolidBrushVisual.replaceHullGeometry(mesh, brush);
  markSolidBrushConvexityState(mesh, SolidBrushValidator.validate(brush).valid);
}
