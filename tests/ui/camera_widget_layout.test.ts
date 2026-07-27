import { describe, it, expect } from 'vitest';
import {
  CAMERA_WIDGET_DEFAULT_SIZE_PX,
  CAMERA_WIDGET_MARGIN_PX,
  computeCameraWidgetLogicalRect,
} from '../../src/ui/camera_widget_layout.js';

describe('computeCameraWidgetLogicalRect', () => {
  it('places the widget in the top-right of a pane using lower-left origin', () => {
    const pane = { x: 100, y: 50, width: 400, height: 300 };
    const rect = computeCameraWidgetLogicalRect(pane);

    expect(rect).not.toBeNull();
    expect(rect!.width).toBe(CAMERA_WIDGET_DEFAULT_SIZE_PX);
    expect(rect!.height).toBe(CAMERA_WIDGET_DEFAULT_SIZE_PX);
    expect(rect!.x).toBe(pane.x + pane.width - CAMERA_WIDGET_DEFAULT_SIZE_PX - CAMERA_WIDGET_MARGIN_PX);
    expect(rect!.y).toBe(pane.y + pane.height - CAMERA_WIDGET_DEFAULT_SIZE_PX - CAMERA_WIDGET_MARGIN_PX);
  });

  it('returns null when the pane has no drawable area', () => {
    expect(computeCameraWidgetLogicalRect({ x: 0, y: 0, width: 0, height: 100 })).toBeNull();
    expect(computeCameraWidgetLogicalRect({ x: 0, y: 0, width: 100, height: 0 })).toBeNull();
  });

  it('shrinks the widget when the pane is smaller than the default size', () => {
    const pane = { x: 0, y: 0, width: 40, height: 30 };
    const rect = computeCameraWidgetLogicalRect(pane);

    expect(rect).not.toBeNull();
    expect(rect!.width).toBe(30);
    expect(rect!.height).toBe(30);
    // Horizontal margin remains when width exceeds size; vertical margin clamps to 0.
    expect(rect!.x).toBe(pane.width - 30 - CAMERA_WIDGET_MARGIN_PX);
    expect(rect!.y).toBe(0);
  });

  it('clamps margins when the pane equals the widget size', () => {
    const size = 50;
    const pane = { x: 10, y: 20, width: size, height: size };
    const rect = computeCameraWidgetLogicalRect(pane, size, 8);

    expect(rect).not.toBeNull();
    expect(rect!.x).toBe(pane.x);
    expect(rect!.y).toBe(pane.y);
    expect(rect!.width).toBe(size);
    expect(rect!.height).toBe(size);
  });

  it('honors custom size and margin arguments', () => {
    const pane = { x: 0, y: 0, width: 200, height: 200 };
    const rect = computeCameraWidgetLogicalRect(pane, 64, 12);

    expect(rect).not.toBeNull();
    expect(rect!.width).toBe(64);
    expect(rect!.height).toBe(64);
    expect(rect!.x).toBe(200 - 64 - 12);
    expect(rect!.y).toBe(200 - 64 - 12);
  });
});
