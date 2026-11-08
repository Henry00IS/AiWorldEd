import type * as THREE from 'three';
import { isDecorativeEdge, isSolidBrushEdge } from '@/utils/mesh_edge_sync.js';
import { isEditModeWireframeSuppressed } from '@/utils/edit_mode_wireframe_suppress.js';
import { SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY } from '@/solid/model/solid_brush_edge_batch.js';
import { MODIFIER_VOLUME_OUTLINE_KEY } from '@/modifier/volume/modifier_volume_bevel_keys.js';

/**
 * Applies the content/brush wireframe visibility preference for one multi-view
 * pane prepare pass. Edit Mode suppress always wins. When enabled, decorative
 * edges, static batches, and volume and generator box outlines are shown;
 * personal brush edges keep the visibility already set by the edge fader for
 * this pass.
 *
 * @param root World group or scene to walk.
 * @param enabled Whether content and brush wireframes should draw.
 */
export function applyContentWireframeVisibilityForRenderPass(root: THREE.Object3D, enabled: boolean): void {
  root.traverse((object) => {
    if (!isContentBrushWireframeHelper(object)) {
      return;
    }
    applyOneWireframeHelperVisibility(object, enabled);
  });
}

/**
 * Returns whether an object is a permanent content or brush edge helper.
 *
 * @param object Scene object to test.
 * @returns True for decorative edges, personal brush edges, edge batches, and
 *   volume and generator box outlines.
 */
export function isContentBrushWireframeHelper(object: THREE.Object3D): boolean {
  if (isDecorativeEdge(object) || isSolidBrushEdge(object)) {
    return true;
  }
  return isAlwaysShownWireframeHelper(object);
}

/**
 * Returns whether a helper draws whenever content wireframes are enabled.
 *
 * @param object Scene object to test.
 * @returns True for edge batches and volume and generator box outlines.
 */
function isAlwaysShownWireframeHelper(object: THREE.Object3D): boolean {
  return (
    object.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true ||
    object.userData[MODIFIER_VOLUME_OUTLINE_KEY] === true
  );
}

/**
 * Sets visibility for one wireframe helper under the pass preference.
 *
 * @param object Wireframe helper line object.
 * @param enabled Whether content wireframes are enabled for this pane.
 */
function applyOneWireframeHelperVisibility(object: THREE.Object3D, enabled: boolean): void {
  if (isEditModeWireframeSuppressed(object)) {
    object.visible = false;
    return;
  }
  if (!enabled) {
    object.visible = false;
    return;
  }
  if (isDecorativeEdge(object) || isAlwaysShownWireframeHelper(object)) {
    object.visible = true;
  }
}
