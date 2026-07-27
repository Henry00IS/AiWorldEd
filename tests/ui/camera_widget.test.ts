import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { CameraWidget } from '../../src/ui/camera_widget.js';
import { CAMERA_WIDGET_DEFAULT_SIZE_PX, CAMERA_WIDGET_MARGIN_PX } from '../../src/ui/camera_widget_layout.js';

describe('CameraWidget theme colors', () => {
  it('should define all widget theme colors', () => {
    expect(Theme.widgetXAxisColor).toBeDefined();
    expect(Theme.widgetYAxisColor).toBeDefined();
    expect(Theme.widgetZAxisColor).toBeDefined();
    expect(Theme.widgetBackgroundColor).toBeDefined();
  });

  it('should use distinct colors for each axis', () => {
    expect(Theme.widgetXAxisColor).not.toBe(Theme.widgetYAxisColor);
    expect(Theme.widgetYAxisColor).not.toBe(Theme.widgetZAxisColor);
    expect(Theme.widgetXAxisColor).not.toBe(Theme.widgetZAxisColor);
  });

  it('should have a red-dominant X axis color', () => {
    const r = (Theme.widgetXAxisColor >> 16) & 255;
    const g = (Theme.widgetXAxisColor >> 8) & 255;
    const b = Theme.widgetXAxisColor & 255;
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('should have a green-dominant Y axis color', () => {
    const r = (Theme.widgetYAxisColor >> 16) & 255;
    const g = (Theme.widgetYAxisColor >> 8) & 255;
    const b = Theme.widgetYAxisColor & 255;
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('should have a blue-dominant Z axis color', () => {
    const r = (Theme.widgetZAxisColor >> 16) & 255;
    const g = (Theme.widgetZAxisColor >> 8) & 255;
    const b = Theme.widgetZAxisColor & 255;
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  it('should use a dark background color', () => {
    const avg =
      ((Theme.widgetBackgroundColor >> 16) & 255) +
      ((Theme.widgetBackgroundColor >> 8) & 255) +
      (Theme.widgetBackgroundColor & 255);
    expect(avg / 3).toBeLessThan(60);
  });
});

describe('CameraWidget construction', () => {
  let widget: CameraWidget | null = null;

  afterEach(() => {
    widget?.dispose();
    widget = null;
  });

  it('creates three colored axis arrows without allocating a canvas or renderer', () => {
    const canvasCountBefore = document.querySelectorAll('canvas').length;
    widget = new CameraWidget();

    expect(document.querySelectorAll('canvas').length).toBe(canvasCountBefore);
    expect(widget.getArrowX()).toBeInstanceOf(THREE.ArrowHelper);
    expect(widget.getArrowY()).toBeInstanceOf(THREE.ArrowHelper);
    expect(widget.getArrowZ()).toBeInstanceOf(THREE.ArrowHelper);
    expect((widget.getArrowX().line.material as THREE.LineBasicMaterial).color.getHex()).toBe(Theme.widgetXAxisColor);
    expect((widget.getArrowY().cone.material as THREE.MeshBasicMaterial).color.getHex()).toBe(Theme.widgetYAxisColor);
    expect((widget.getArrowZ().line.material as THREE.LineBasicMaterial).color.getHex()).toBe(Theme.widgetZAxisColor);
  });

  it('parents all three arrows under a single group in the widget scene', () => {
    widget = new CameraWidget();
    const group = widget.getArrowGroup();
    expect(widget.getScene().children).toContain(group);
    expect(group.children).toEqual([widget.getArrowX(), widget.getArrowY(), widget.getArrowZ()]);
  });

  it('exposes a fixed orthographic camera that looks at the origin', () => {
    widget = new CameraWidget();
    const camera = widget.getCamera();
    expect(camera).toBeInstanceOf(THREE.OrthographicCamera);
    expect(camera.position.z).toBe(5);
    expect(camera.near).toBe(0.1);
    expect(camera.far).toBe(100);
  });
});

describe('CameraWidget orientation mirroring', () => {
  let widget: CameraWidget | null = null;

  afterEach(() => {
    widget?.dispose();
    widget = null;
  });

  it('inverts the main camera world quaternion onto the arrow group', () => {
    widget = new CameraWidget();
    const mainCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    mainCamera.position.set(3, 4, 5);
    mainCamera.lookAt(0, 0, 0);
    mainCamera.updateMatrixWorld(true);

    widget.syncOrientation(mainCamera);

    const mainQuaternion = new THREE.Quaternion();
    mainCamera.getWorldQuaternion(mainQuaternion);
    const expected = mainQuaternion.clone().invert();
    const actual = widget.getArrowGroup().quaternion;
    expect(actual.x).toBeCloseTo(expected.x);
    expect(actual.y).toBeCloseTo(expected.y);
    expect(actual.z).toBeCloseTo(expected.z);
    expect(actual.w).toBeCloseTo(expected.w);
  });

  it('produces different arrow orientations for different camera poses', () => {
    widget = new CameraWidget();
    const mainCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

    mainCamera.position.set(5, 5, 5);
    mainCamera.lookAt(0, 0, 0);
    mainCamera.updateMatrixWorld(true);
    widget.syncOrientation(mainCamera);
    const first = widget.getArrowGroup().quaternion.clone();

    mainCamera.position.set(-5, 3, -2);
    mainCamera.lookAt(0, 0, 0);
    mainCamera.updateMatrixWorld(true);
    widget.syncOrientation(mainCamera);
    const second = widget.getArrowGroup().quaternion;

    expect(first.x).not.toBeCloseTo(second.x);
  });
});

describe('CameraWidget shared-renderer overlay', () => {
  let widget: CameraWidget | null = null;

  afterEach(() => {
    widget?.dispose();
    widget = null;
  });

  it('scissors a top-right corner, clears depth only, and renders the widget scene', () => {
    widget = new CameraWidget();
    const setViewport = vi.fn();
    const setScissor = vi.fn();
    const clearDepth = vi.fn();
    const render = vi.fn();
    const renderer = { setViewport, setScissor, clearDepth, render } as unknown as THREE.WebGLRenderer;
    const pane = { x: 20, y: 40, width: 500, height: 400 };

    widget.renderOverlay(renderer, pane);

    const expectedX = pane.x + pane.width - CAMERA_WIDGET_DEFAULT_SIZE_PX - CAMERA_WIDGET_MARGIN_PX;
    const expectedY = pane.y + pane.height - CAMERA_WIDGET_DEFAULT_SIZE_PX - CAMERA_WIDGET_MARGIN_PX;
    expect(setViewport).toHaveBeenCalledWith(
      expectedX,
      expectedY,
      CAMERA_WIDGET_DEFAULT_SIZE_PX,
      CAMERA_WIDGET_DEFAULT_SIZE_PX,
    );
    expect(setScissor).toHaveBeenCalledWith(
      expectedX,
      expectedY,
      CAMERA_WIDGET_DEFAULT_SIZE_PX,
      CAMERA_WIDGET_DEFAULT_SIZE_PX,
    );
    expect(clearDepth).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledWith(widget.getScene(), widget.getCamera());
  });

  it('skips rendering when the pane has no drawable area', () => {
    widget = new CameraWidget();
    const setViewport = vi.fn();
    const setScissor = vi.fn();
    const clearDepth = vi.fn();
    const render = vi.fn();
    const renderer = { setViewport, setScissor, clearDepth, render } as unknown as THREE.WebGLRenderer;

    widget.renderOverlay(renderer, { x: 0, y: 0, width: 0, height: 100 });

    expect(setViewport).not.toHaveBeenCalled();
    expect(setScissor).not.toHaveBeenCalled();
    expect(clearDepth).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
});
