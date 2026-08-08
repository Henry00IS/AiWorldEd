import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { isDecorativeEdge } from '@/utils/mesh_edge_sync.js';
import { isEditModeWireframeSuppressed } from '@/utils/edit_mode_wireframe_suppress.js';
import { SolidBrushEdgeMaterials } from '@/solid/model/solid_brush_edge_materials.js';
import { EDIT_MODE_REST_WIRE_COLOR_2D } from '@/edit/component/component_edit_selection_draw.js';

/** True while an Edit Mode session is open. */
let editModeSessionActive = false;

/**
 * Records whether Edit Mode is currently active for viewport line styling.
 *
 * @param active True while a session is open.
 */
export function setEditModeViewportLineStyleActive(active: boolean): void {
  editModeSessionActive = active;
  if (!active) {
    SolidBrushEdgeMaterials.clearDiffuseColorOverrideForRenderPass();
  }
}

/**
 * Returns whether Edit Mode line styling is active.
 *
 * @returns True while a session is open.
 */
export function isEditModeViewportLineStyleActive(): boolean {
  return editModeSessionActive;
}

/**
 * Applies orthographic 2D rest-of-scene wire colors for one multi-view pane
 * pass. Edit cage/selection colors are handled in shaders from the camera
 * projection and need no CPU recoloring.
 *
 * @param worldRoot World group containing content and brush edges.
 */
export function applyEditModeLineStyleForOrthographicPass(worldRoot: THREE.Object3D | null): void {
  if (!editModeSessionActive) {
    applyObjectModeRestWireColors(worldRoot);
    return;
  }
  applyDecorativeEdgeColorForRenderPass(worldRoot, EDIT_MODE_REST_WIRE_COLOR_2D);
  SolidBrushEdgeMaterials.setDiffuseColorOverrideForRenderPass(EDIT_MODE_REST_WIRE_COLOR_2D);
}

/**
 * Applies perspective 3D rest-of-scene wire colors for one multi-view pane
 * pass.
 *
 * @param worldRoot World group containing content and brush edges.
 */
export function applyEditModeLineStyleForPerspectivePass(worldRoot: THREE.Object3D | null): void {
  applyObjectModeRestWireColors(worldRoot);
}

/**
 * Restores object-mode content/brush edge colors.
 *
 * @param worldRoot World group containing content edges.
 */
function applyObjectModeRestWireColors(worldRoot: THREE.Object3D | null): void {
  applyDecorativeEdgeColorForRenderPass(worldRoot, Theme.boxEdgeColor);
  SolidBrushEdgeMaterials.clearDiffuseColorOverrideForRenderPass();
}

/**
 * Sets decorative content edge line colors for one pane pass.
 *
 * @param worldRoot World group to walk, or null.
 * @param color Hex line color.
 */
function applyDecorativeEdgeColorForRenderPass(worldRoot: THREE.Object3D | null, color: number): void {
  if (!worldRoot) {
    return;
  }
  worldRoot.traverse((object) => {
    if (!isDecorativeEdge(object)) {
      return;
    }
    if (isEditModeWireframeSuppressed(object)) {
      return;
    }
    writeLineBasicMaterialColor(object, color);
  });
}

/**
 * Writes a solid color onto a LineSegments LineBasicMaterial.
 *
 * @param object Line object.
 * @param color Hex color.
 */
function writeLineBasicMaterialColor(object: THREE.Object3D, color: number): void {
  if (!(object instanceof THREE.LineSegments)) {
    return;
  }
  const material = object.material;
  if (Array.isArray(material)) {
    for (const entry of material) {
      writeOneLineBasicColor(entry, color);
    }
    return;
  }
  writeOneLineBasicColor(material, color);
}

/**
 * Writes color on one material when it is a LineBasicMaterial.
 *
 * @param material Candidate material.
 * @param color Hex color.
 */
function writeOneLineBasicColor(material: THREE.Material, color: number): void {
  if (!(material instanceof THREE.LineBasicMaterial)) {
    return;
  }
  material.color.setHex(color);
}
