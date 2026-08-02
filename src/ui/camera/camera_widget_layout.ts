import { isDrawableRect, type PaneLogicalRect } from '@/viewports/pane/pane_content_rect.js';
import {
  CAMERA_WIDGET_SIZE_DEFAULT_PX,
  CAMERA_WIDGET_SIZE_MAX_PX,
  CAMERA_WIDGET_SIZE_MIN_PX,
} from '@/settings/store/settings_types.js';

/** Default on-screen size of the orientation gizmo in CSS pixels. */
export const CAMERA_WIDGET_DEFAULT_SIZE_PX = CAMERA_WIDGET_SIZE_DEFAULT_PX;

/** Minimum on-screen size of the orientation gizmo in CSS pixels. */
export const CAMERA_WIDGET_MIN_SIZE_PX = CAMERA_WIDGET_SIZE_MIN_PX;

/** Maximum on-screen size of the orientation gizmo in CSS pixels. */
export const CAMERA_WIDGET_MAX_SIZE_PX = CAMERA_WIDGET_SIZE_MAX_PX;

/** Margin from the top-right corner of the pane content in CSS pixels. */
export const CAMERA_WIDGET_MARGIN_PX = 4;

/**
 * Computes the lower-left logical scissor rect for the camera orientation
 * widget inside a perspective pane. The widget sits in the top-right corner of
 * the drawable content (already below the viewport toolbar).
 *
 * @param paneLogicalRect Logical scissor rect of the perspective pane content.
 * @param sizePx Desired widget edge length in logical pixels.
 * @param marginPx Inset from the top and right edges of the pane.
 * @returns Widget rect, or null when the pane has no drawable area.
 */
export function computeCameraWidgetLogicalRect(
  paneLogicalRect: PaneLogicalRect,
  sizePx: number = CAMERA_WIDGET_DEFAULT_SIZE_PX,
  marginPx: number = CAMERA_WIDGET_MARGIN_PX,
): PaneLogicalRect | null {
  if (!isDrawableRect(paneLogicalRect)) return null;
  const size = Math.min(sizePx, paneLogicalRect.width, paneLogicalRect.height);
  if (size <= 0) return null;
  const horizontalMargin = Math.min(marginPx, Math.max(0, paneLogicalRect.width - size));
  const verticalMargin = Math.min(marginPx, Math.max(0, paneLogicalRect.height - size));
  return {
    x: paneLogicalRect.x + paneLogicalRect.width - size - horizontalMargin,
    y: paneLogicalRect.y + paneLogicalRect.height - size - verticalMargin,
    width: size,
    height: size,
  };
}
