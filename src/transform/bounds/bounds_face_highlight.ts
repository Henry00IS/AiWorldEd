import * as THREE from 'three';
import { BoundsFace, BOUNDS_FACE_USERDATA_KEY } from '../../types/bounds_face.js';
import { Theme } from '../../theme.js';

/** UserData key for the bounds face edge-outline highlight object. */
export const BOUNDS_FACE_EDGE_HIGHLIGHT_KEY = 'isBoundsFaceEdgeHighlight';

/** Why a face edge is outlined: resize grip vs body-move hover. */
export type BoundsFaceHighlightMode = 'resize' | 'move';

/** Soft white for 3D body-move face hover (not used in 2D). */
export const BOUNDS_MOVE_HIGHLIGHT_COLOR = 0xf0f0f0;

/**
 * Applies or clears the edge-outline highlight for a bounds face. Resize uses
 * selection orange; move uses white (callers should skip move mode on 2D
 * clones).
 *
 * @param root Gizmo root (master or viewport clone).
 * @param highlightedFace Face to outline, or null to clear.
 * @param mode Resize (orange) or move (white).
 * @param theme Theme colors.
 * @param allowMoveHighlight When false, move-mode outlines stay hidden (2D).
 */
export function applyBoundsFaceEdgeHighlight(
  root: THREE.Object3D,
  highlightedFace: BoundsFace | null,
  mode: BoundsFaceHighlightMode = 'resize',
  theme: typeof Theme = Theme,
  allowMoveHighlight: boolean = true,
): void {
  const showMove = mode === 'move' && allowMoveHighlight;
  const activeFace = mode === 'resize' || showMove ? highlightedFace : null;
  const color = mode === 'move' ? BOUNDS_MOVE_HIGHLIGHT_COLOR : theme.selectionColor;
  root.traverse((child) => {
    if (child.userData[BOUNDS_FACE_EDGE_HIGHLIGHT_KEY] !== true) return;
    const face = child.userData[BOUNDS_FACE_USERDATA_KEY] as BoundsFace | undefined;
    child.visible = activeFace !== null && face === activeFace;
    if (!child.visible || !(child instanceof THREE.LineSegments)) return;
    const material = child.material;
    if (!Array.isArray(material) && material instanceof THREE.LineBasicMaterial) {
      material.color.setHex(color);
      material.needsUpdate = true;
    }
  });
}

/**
 * Builds a unit face perimeter (local Z = 0, extent ±1 on X/Y) for edge
 * highlight meshes that are later scaled to the OBB face size.
 *
 * @returns Buffer geometry for four line segments around a unit square.
 */
export function createUnitFaceEdgeHighlightGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, -1, 0, 1, 1, 0, 1, 1, 0, -1, 1, 0, -1, 1, 0, -1, -1, 0]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}
