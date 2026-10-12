import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';
import { MESH_EDIT_DOCUMENT_USERDATA_KEY } from '@/edit/mesh/mesh_edit_binding.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { markSolidBrushConvexityState } from '@/edit/transform/brush_edit_convexity.js';
import type { TopologyBrushSnapshot, TopologyMeshSnapshot, TopologySnapshot } from './topology_snapshot.js';

/**
 * Restores a captured snapshot onto the live target.
 *
 * @param snapshot Snapshot to restore.
 */
export function restoreTopologySnapshot(snapshot: TopologySnapshot): void {
  if (snapshot.kind === 'mesh') {
    restoreMeshTopologySnapshot(snapshot);
    return;
  }
  restoreBrushTopologySnapshot(snapshot);
}

/**
 * Writes a cloned mesh document back onto the display mesh.
 *
 * @param snapshot Mesh snapshot.
 */
function restoreMeshTopologySnapshot(snapshot: TopologyMeshSnapshot): void {
  const document = snapshot.document.clone();
  snapshot.mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = document;
  writeMeshDocumentDisplayGeometry(snapshot.mesh, document);
}

/**
 * Writes a cloned brush and surfaces back onto the solid instance.
 *
 * @param snapshot Brush snapshot.
 */
function restoreBrushTopologySnapshot(snapshot: TopologyBrushSnapshot): void {
  const instance = snapshot.solidModel.findBrush(snapshot.brushId);
  if (!instance) {
    return;
  }
  instance.brush = snapshot.brush.clone();
  restoreBrushSnapshotSurfaces(snapshot);
  refreshBrushPreviewAndCompile(snapshot);
}

/**
 * Restores serialized UV surfaces onto the live brush instance.
 *
 * @param snapshot Brush snapshot.
 */
function restoreBrushSnapshotSurfaces(snapshot: TopologyBrushSnapshot): void {
  const instance = snapshot.solidModel.findBrush(snapshot.brushId);
  if (!instance) {
    return;
  }
  instance.restoreFaceSurfaces(snapshot.defaultSurface ?? undefined, snapshot.faceSurfaces ?? undefined);
}

/**
 * Rebuilds hull preview, convexity tint, and CSG after a brush restore.
 *
 * @param snapshot Brush snapshot.
 */
function refreshBrushPreviewAndCompile(snapshot: TopologyBrushSnapshot): void {
  const instance = snapshot.solidModel.findBrush(snapshot.brushId);
  if (!instance) {
    return;
  }
  if (instance.mesh) {
    SolidBrushVisual.replaceHullGeometry(instance.mesh, instance.brush);
    markSolidBrushConvexityState(instance.mesh, SolidBrushValidator.validate(instance.brush).valid);
  }
  snapshot.solidModel.markBrushesDirty([snapshot.brushId]);
  snapshot.solidModel.rebuild();
}
