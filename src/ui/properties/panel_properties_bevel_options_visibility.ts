import type { Object3D } from 'three';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { modifierStackBrushTouches } from '@/modifier/stack/evaluate/modifier_stack_capture.js';
import { modifierVolumeRecordOwner } from '@/modifier/volume/modifier_volume_record.js';
import { modifierBevelTrackedEdges } from '@/modifier/bevel/modifier_bevel_brush_edges.js';
import { modifierBevelCornerGroups } from '@/modifier/bevel/modifier_bevel_corner_patch.js';

/**
 * Checks whether this volume selects at least three incident authored edges.
 *
 * @param volume Selected live volume.
 */
export function panelBevelOptionsHasCorners(volume: Object3D): boolean {
  const owner = modifierVolumeRecordOwner(volume);
  let root = owner;
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true);
  for (const model of SolidModelRegistry.collectUnder(root)) {
    for (const brush of model.getBrushes()) {
      if (!brush.mesh || !modifierStackBrushTouches(brush, owner)) continue;
      const edges = modifierBevelTrackedEdges(brush.brush, brush.mesh.matrixWorld, [volume]);
      if (modifierBevelCornerGroups(edges).length) return true;
    }
  }
  return false;
}
