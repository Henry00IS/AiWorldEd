import type * as THREE from 'three';
import { findPickSurfaceAtClientPoint } from '@/utils/pointer_client_hit.js';
import { projectLoopCutParameterOnLockedEdge } from '@/edit/tool/edit_loop_cut_slide.js';
import { readPointerWorldRay, type LoopCutPointerWorldRay } from '@/edit/tool/edit_loop_cut_slide_ray.js';

/** Viewport surface the Edit Mode pointer helpers can pick through. */
export interface EditModePointerSurface {
  /** Returns the viewport camera. */
  getCamera(): THREE.Camera;
  /** Returns the element that receives pointer input. */
  getContentElement(): HTMLElement;
}

/**
 * Finds the viewport under a client point. When ownerDocument is set, only
 * panes in that document match.
 *
 * @param viewports Candidate viewports.
 * @param clientX Client X.
 * @param clientY Client Y.
 * @param ownerDocument Document that owns the coordinates, or null.
 * @returns Viewport, or null.
 */
export function editModeViewportAtClientPoint<Surface extends EditModePointerSurface>(
  viewports: readonly Surface[],
  clientX: number,
  clientY: number,
  ownerDocument: Document | null,
): Surface | null {
  return findPickSurfaceAtClientPoint(
    viewports,
    (viewport) => viewport.getContentElement(),
    clientX,
    clientY,
    ownerDocument,
  );
}

/**
 * Returns the world pick ray under a client point.
 *
 * @param viewports Candidate viewports.
 * @param clientX Client X.
 * @param clientY Client Y.
 * @param ownerDocument Document that owns the coordinates, or null.
 * @returns Ray, or null when no viewport is under the point.
 */
export function editModePointerWorldRay(
  viewports: readonly EditModePointerSurface[],
  clientX: number,
  clientY: number,
  ownerDocument: Document | null,
): LoopCutPointerWorldRay | null {
  const viewport = editModeViewportAtClientPoint(viewports, clientX, clientY, ownerDocument);
  if (!viewport) return null;
  return readPointerWorldRay({ clientX, clientY } as MouseEvent, viewport.getCamera(), viewport.getContentElement());
}

/**
 * Projects a client point onto a locked loop-cut edge.
 *
 * @param viewports Candidate viewports.
 * @param clientX Client X.
 * @param clientY Client Y.
 * @param worldA Locked edge start.
 * @param worldB Locked edge end.
 * @param ownerDocument Document that owns the coordinates, or null.
 * @returns Interior parameter, or null.
 */
export function editModeLockedLoopCutParameter(
  viewports: readonly EditModePointerSurface[],
  clientX: number,
  clientY: number,
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
  ownerDocument: Document | null,
): number | null {
  const viewport = editModeViewportAtClientPoint(viewports, clientX, clientY, ownerDocument);
  if (!viewport) return null;
  const event = { clientX, clientY } as MouseEvent;
  return projectLoopCutParameterOnLockedEdge(event, viewport.getCamera(), viewport.getContentElement(), worldA, worldB);
}
