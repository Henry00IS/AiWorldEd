import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';

/** UserData flag: brush is non-convex and excluded from solid CSG. */
export const SOLID_BRUSH_NON_CONVEX_USERDATA_KEY = 'solidBrushNonConvex';

/** Warning tint for non-convex brush previews (muted violet). */
const NON_CONVEX_BRUSH_TINT = 0x9b59b6;

/**
 * Marks a brush preview mesh as convex or non-convex and updates its tint.
 *
 * @param mesh Brush preview mesh.
 * @param isConvex True when the brush passes convex validation.
 */
export function markSolidBrushConvexityState(mesh: THREE.Mesh, isConvex: boolean): void {
  if (!SolidBrushVisual.isBrushObject(mesh)) {
    return;
  }
  if (isConvex) {
    delete mesh.userData[SOLID_BRUSH_NON_CONVEX_USERDATA_KEY];
    restoreBrushOperationTint(mesh);
    return;
  }
  mesh.userData[SOLID_BRUSH_NON_CONVEX_USERDATA_KEY] = true;
  applyNonConvexBrushTint(mesh);
}

/**
 * Returns whether a brush mesh is marked non-convex.
 *
 * @param mesh Candidate mesh.
 * @returns True when excluded from CSG for non-convexity.
 */
export function isSolidBrushMarkedNonConvex(mesh: THREE.Object3D): boolean {
  return mesh.userData[SOLID_BRUSH_NON_CONVEX_USERDATA_KEY] === true;
}

/**
 * Marks a preview mesh from the brush validity result.
 *
 * @param mesh Brush preview mesh.
 * @param brush Brush represented by the mesh.
 */
export function markSolidBrushPreviewValidity(mesh: THREE.Mesh, brush: SolidBrush): void {
  markSolidBrushConvexityState(mesh, SolidBrushValidator.validate(brush).valid);
}

/**
 * Applies the non-convex warning tint to brush hull fill materials.
 *
 * @param mesh Brush preview mesh.
 */
function applyNonConvexBrushTint(mesh: THREE.Mesh): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!material || !('color' in material)) {
      continue;
    }
    (material as THREE.MeshBasicMaterial).color.setHex(NON_CONVEX_BRUSH_TINT);
  }
}

/**
 * Restores operation-colored brush presentation after returning to convex.
 *
 * @param mesh Brush preview mesh.
 */
function restoreBrushOperationTint(mesh: THREE.Mesh): void {
  const fillVisible = SolidBrushVisual.isHullFillVisible(mesh);
  SolidBrushVisual.setHullFillVisible(mesh, fillVisible);
}
