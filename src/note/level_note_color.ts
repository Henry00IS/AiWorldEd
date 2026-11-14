import * as THREE from 'three';
import { currentSharedContentMaterialList } from '@/viewports/shared/shared_content_material_store.js';

/** Default marker color of a new note. */
export const LEVEL_NOTE_DEFAULT_COLOR = 0xf5c542;

/**
 * Returns the marker color of a note: its own material color, even while a pane
 * draws it with a temporary shading override material.
 *
 * @param object Note marker.
 * @returns Color as 0xRRGGBB.
 */
export function levelNoteColorOf(object: THREE.Object3D): number {
  if (!(object instanceof THREE.Mesh)) return LEVEL_NOTE_DEFAULT_COLOR;
  const material = currentSharedContentMaterialList(object)[0];
  return material instanceof THREE.MeshStandardMaterial ? material.color.getHex() : LEVEL_NOTE_DEFAULT_COLOR;
}
