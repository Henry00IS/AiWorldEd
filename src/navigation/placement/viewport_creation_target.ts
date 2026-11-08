import { isPerspectiveViewport, type ViewportEditor } from '@/viewports/core/viewport_editor.js';

/**
 * Chooses the last input target while live, otherwise a perspective pane or the
 * first available pane.
 *
 * @param viewports Live interactive viewports, including detached panes.
 * @param lastInteractedViewport Most recent real viewport input target.
 * @returns Creation target, or null when no viewport is available.
 */
export function resolveViewportCreationTarget(
  viewports: readonly ViewportEditor[],
  lastInteractedViewport: ViewportEditor | null,
): ViewportEditor | null {
  if (lastInteractedViewport && viewports.includes(lastInteractedViewport)) return lastInteractedViewport;
  return viewports.find(isPerspectiveViewport) ?? viewports[0] ?? null;
}
