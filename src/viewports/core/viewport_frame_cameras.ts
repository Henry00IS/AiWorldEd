import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';

/**
 * Brings the world matrices of every given viewport camera up to date. Camera
 * navigation only moves position and orientation, and the renderer refreshes
 * the matrices when it draws, so screen overlays projected before the draw (CAD
 * ruler labels, tool widgets) would otherwise trail the camera by a frame. Both
 * the main window loop and detached windows call this before their
 * before-render work.
 *
 * @param viewports Viewports about to draw this frame.
 */
export function viewportFrameCamerasSync(viewports: readonly ViewportEditor[]): void {
  for (const viewport of viewports) viewport.getCamera().updateMatrixWorld();
}
