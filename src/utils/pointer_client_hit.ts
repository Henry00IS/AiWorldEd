import { panelFloatingScopeCoversPoint } from '@/ui/floating_panel/panel_floating_scope.js';

/**
 * Single source of truth for window-local pointer hit tests. Client coordinates
 * from pointer events are always relative to the window that raised the event
 * (main editor or a detached viewport popup). Never compare a detached sample
 * against a main-window element without filtering by ownerDocument first — both
 * windows report geometry near (0,0), so cross-document tests pick the wrong
 * pane.
 */

/**
 * Returns whether a client point lies inside an element's CSS bounding box.
 *
 * @param clientX Pointer client X in the element's owner window.
 * @param clientY Pointer client Y in the element's owner window.
 * @param element Element whose bounds are tested.
 * @returns True when the point is inside the element bounds.
 */
export function isClientPointInsideElementBounds(clientX: number, clientY: number, element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

/**
 * Returns whether an element should be considered for a document-scoped hit.
 * When ownerDocument is null/undefined, every element is eligible.
 *
 * @param element Candidate pick element.
 * @param ownerDocument Document that owns the client coordinates, or null.
 * @returns True when the element may participate in the hit test.
 */
export function doesElementBelongToPointerDocument(
  element: HTMLElement,
  ownerDocument: Document | null | undefined,
): boolean {
  if (!ownerDocument) {
    return true;
  }
  return element.ownerDocument === ownerDocument;
}

/**
 * Among candidate elements, returns the smallest-area element containing the
 * client point. Optionally restricts to one owner document so main and detached
 * windows never cross-match.
 *
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param elements Candidate elements (any documents).
 * @param ownerDocument Optional document that owns the client coordinates.
 * @returns Matching element, or null.
 */
export function findSmallestElementContainingClientPoint(
  clientX: number,
  clientY: number,
  elements: readonly HTMLElement[],
  ownerDocument: Document | null = null,
): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const element of elements) {
    if (!doesElementBelongToPointerDocument(element, ownerDocument)) {
      continue;
    }
    if (!isClientPointInsideElementBounds(clientX, clientY, element)) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    const area = Math.max(rect.width, 0) * Math.max(rect.height, 0);
    if (area < bestArea) {
      best = element;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Finds the first pick surface whose content element contains a client point.
 * Client coordinates are window-local; when ownerDocument is set only surfaces
 * in that document are tested so detached popups never hit main-window panes. A
 * point a floating window covers hits no surface, so viewports under the window
 * do not react to it.
 *
 * @param surfaces Interactive panes or other pick surfaces.
 * @param getContentElement Resolves the DOM pick element for a surface.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param ownerDocument Optional document that owns the client coordinates.
 * @returns Matching surface, or null.
 */
export function findPickSurfaceAtClientPoint<T>(
  surfaces: readonly T[],
  getContentElement: (surface: T) => HTMLElement | null | undefined,
  clientX: number,
  clientY: number,
  ownerDocument: Document | null = null,
): T | null {
  if (panelFloatingScopeCoversPoint(ownerDocument ?? document, clientX, clientY)) return null;
  for (const surface of surfaces) {
    const pickElement = getContentElement(surface);
    if (!pickElement) {
      continue;
    }
    if (!doesElementBelongToPointerDocument(pickElement, ownerDocument)) {
      continue;
    }
    if (!isClientPointInsideElementBounds(clientX, clientY, pickElement)) {
      continue;
    }
    return surface;
  }
  return null;
}
