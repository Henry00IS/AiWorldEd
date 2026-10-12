import { captureInstanceFaceSurfaces } from '@/solid/brush/solid_brush_surface_transfer.js';
import type { TopologyBrushSnapshot, TopologyMeshSnapshot, TopologySnapshot } from './topology_snapshot.js';
import type { TopologyBrushTarget, TopologyEditTarget, TopologyMeshTarget } from './topology_target.js';

/**
 * Captures a deep snapshot of one topology target.
 *
 * @param target Live target.
 * @returns Snapshot.
 */
export function captureTopologySnapshot(target: TopologyEditTarget): TopologySnapshot {
  if (target.kind === 'mesh') {
    return captureMeshTopologySnapshot(target);
  }
  return captureBrushTopologySnapshot(target);
}

/**
 * Captures a mesh document clone.
 *
 * @param target Mesh target.
 * @returns Mesh snapshot.
 */
function captureMeshTopologySnapshot(target: TopologyMeshTarget): TopologyMeshSnapshot {
  return {
    kind: 'mesh',
    targetId: target.targetId,
    mesh: target.mesh,
    document: target.document.clone(),
  };
}

/**
 * Captures a brush clone and its UV surfaces.
 *
 * @param target Brush target.
 * @returns Brush snapshot.
 */
function captureBrushTopologySnapshot(target: TopologyBrushTarget): TopologyBrushSnapshot {
  const instance = target.solidModel.findBrush(target.brushId);
  const surfaces = instance ? captureInstanceFaceSurfaces(instance) : null;
  return {
    kind: 'brush',
    targetId: target.targetId,
    solidModel: target.solidModel,
    brushId: target.brushId,
    brush: target.brush.clone(),
    mesh: target.mesh,
    defaultSurface: surfaces ? surfaces.defaultSurface : null,
    faceSurfaces: surfaces ? surfaces.faceSurfaces : null,
  };
}
