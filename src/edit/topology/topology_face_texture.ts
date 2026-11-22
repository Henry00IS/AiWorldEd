import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Points faces at a texture, keeping their corner UVs. Faces sharing a texture
 * draw as one material group, so a new texture adds a group and the last face
 * leaving one drops it.
 *
 * @param geometry Working geometry to edit.
 * @param faces Face indices to paint.
 * @param textureId Library texture.
 * @returns Applied when any face changed texture.
 */
export function assignTopologyWorkingFaceTexture(
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
  textureId: string,
): TopologyOperatorResult {
  let changed = 0;
  for (const index of faces) {
    const face = geometry.faces[index];
    if (!face || face.textureId === textureId) continue;
    face.textureId = textureId;
    changed++;
  }
  return changed > 0
    ? topologyOperatorApplied()
    : topologyOperatorRefused('The selected faces already show this texture');
}
