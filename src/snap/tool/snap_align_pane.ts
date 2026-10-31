import * as THREE from 'three';
import { findPickSurfaceAtClientPoint } from '@/utils/pointer_client_hit.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';

/**
 * Resolves the viewport under a client point.
 *
 * @param viewports Live viewports.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param ownerDocument Document that owns the coordinates.
 * @returns Camera and pick element, or null.
 */
export function resolveAlignPane(
  viewports: readonly ViewportEditor[],
  clientX: number,
  clientY: number,
  ownerDocument: Document | null,
): { camera: THREE.Camera; pickElement: HTMLElement } | null {
  const viewport = findPickSurfaceAtClientPoint(
    viewports,
    (candidate) => candidate.getContentElement(),
    clientX,
    clientY,
    ownerDocument,
  );
  const pickElement = viewport?.getContentElement();
  if (!viewport || !pickElement) {
    return null;
  }
  return { camera: viewport.getCamera(), pickElement };
}
