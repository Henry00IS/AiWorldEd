import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { CameraWidget } from '../../src/ui/camera_widget.js';
import { CAMERA_WIDGET_DEFAULT_SIZE_PX, CAMERA_WIDGET_MARGIN_PX } from '../../src/ui/camera_widget_layout.js';
import { getBuiltInCoordinateSpace } from '../../src/settings/coordinate_space_presets.js';
import type { CoordinateAxis } from '../../src/coordinates/coordinate_space_adapter.js';
import type { CameraWidgetAxisRole } from '../../src/ui/camera_widget_axis_presentation.js';

const WIDGET_ROLES: readonly CameraWidgetAxisRole[] = ['right', 'up', 'forward'];
const COORDINATE_AXES: readonly CoordinateAxis[] = ['x', 'y', 'z'];

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
    expect(widget.getAxisLabel('x').getText()).toBe('+X');
    expect(widget.getAxisLabel('y').getText()).toBe('+Y');
    expect(widget.getAxisLabel('z').getText()).toBe('-Z');
  });

  it('parents reusable semantic arrows and labels under one group', () => {
    widget = new CameraWidget();
    const group = widget.getArrowGroup();
    expect(widget.getScene().children).toContain(group);
    expect(group.children).toEqual([
      widget.getArrowForRole('right'),
      widget.getLabelForRole('right').getSprite(),
      widget.getArrowForRole('up'),
      widget.getLabelForRole('up').getSprite(),
      widget.getArrowForRole('forward'),
      widget.getLabelForRole('forward').getSprite(),
    ]);
  });

  it('exposes a fixed orthographic camera that looks at the origin', () => {
    widget = new CameraWidget();
    const camera = widget.getCamera();
    expect(camera).toBeInstanceOf(THREE.OrthographicCamera);
    expect(camera.position.z).toBe(5);
    expect(camera.near).toBe(0.1);
    expect(camera.far).toBe(100);
  });

  it('maps Blender profile axes into editor-space arrow directions', () => {
    widget = new CameraWidget();
    widget.setCoordinateSpace(getBuiltInCoordinateSpace('blender')!);
    expectArrowDirection(widget.getArrowX(), new THREE.Vector3(1, 0, 0));
    expectArrowDirection(widget.getArrowY(), new THREE.Vector3(0, 0, -1));
    expectArrowDirection(widget.getArrowZ(), new THREE.Vector3(0, 1, 0));
    expect(widget.getLabelForRole('right').getText()).toBe('+X');
    expect(widget.getLabelForRole('up').getText()).toBe('+Z');
    expect(widget.getLabelForRole('forward').getText()).toBe('+Y');
  });

  it('updates labels and colors in place without modifying the widget camera', () => {
    widget = new CameraWidget();
    const resources = captureWidgetResources(widget);
    widget.setCoordinateSpace(getBuiltInCoordinateSpace('unreal')!);
    expectWidgetResourcesUnchanged(widget, resources);
    expect(widget.getLabelForRole('right').getText()).toBe('+Y');
    expect(widget.getLabelForRole('up').getText()).toBe('+Z');
    expect(widget.getLabelForRole('forward').getText()).toBe('+X');
    expectArrowColor(widget.getArrowForRole('right'), Theme.widgetYAxisColor);
    expectArrowColor(widget.getArrowForRole('up'), Theme.widgetZAxisColor);
    expectArrowColor(widget.getArrowForRole('forward'), Theme.widgetXAxisColor);
    expect(widget.getArrowX()).toBe(widget.getArrowForRole('forward'));
    expect(widget.getArrowY()).toBe(widget.getArrowForRole('right'));
    expect(widget.getArrowZ()).toBe(widget.getArrowForRole('up'));
  });

  it('disposes every label texture and material', () => {
    widget = new CameraWidget();
    const labels = COORDINATE_AXES.map((axis) => widget!.getAxisLabel(axis));
    const textureDisposals = labels.map((label) => vi.spyOn(label.getTexture(), 'dispose'));
    const materialDisposals = labels.map((label) => vi.spyOn(label.getMaterial(), 'dispose'));

    widget.dispose();
    widget = null;

    textureDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
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

/**
 * Expects an ArrowHelper shaft to point along a direction.
 *
 * @param arrow Arrow helper.
 * @param expected Expected local direction.
 */
function expectArrowDirection(arrow: THREE.ArrowHelper, expected: THREE.Vector3): void {
  const actual = new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion);
  expect(actual.distanceTo(expected)).toBeLessThan(1e-7);
}

/**
 * Expects an arrow shaft and head to share an axis color.
 *
 * @param arrow Arrow helper.
 * @param expected Expected hexadecimal color.
 */
function expectArrowColor(arrow: THREE.ArrowHelper, expected: number): void {
  expect((arrow.line.material as THREE.LineBasicMaterial).color.getHex()).toBe(expected);
  expect((arrow.cone.material as THREE.MeshBasicMaterial).color.getHex()).toBe(expected);
}

/** Stable widget resources captured before a profile change. */
interface WidgetResourceSnapshot {
  children: THREE.Object3D[];
  arrows: THREE.ArrowHelper[];
  textures: THREE.CanvasTexture[];
  cameraPosition: THREE.Vector3;
  cameraQuaternion: THREE.Quaternion;
}

/**
 * Captures widget resource identities and camera pose.
 *
 * @param widget Camera widget to inspect.
 * @returns Stable resource snapshot.
 */
function captureWidgetResources(widget: CameraWidget): WidgetResourceSnapshot {
  return {
    children: [...widget.getArrowGroup().children],
    arrows: WIDGET_ROLES.map((role) => widget.getArrowForRole(role)),
    textures: WIDGET_ROLES.map((role) => widget.getLabelForRole(role).getTexture()),
    cameraPosition: widget.getCamera().position.clone(),
    cameraQuaternion: widget.getCamera().quaternion.clone(),
  };
}

/**
 * Verifies profile updates preserve resources and camera pose.
 *
 * @param widget Updated camera widget.
 * @param snapshot Resources captured before the update.
 */
function expectWidgetResourcesUnchanged(widget: CameraWidget, snapshot: WidgetResourceSnapshot): void {
  widget.getArrowGroup().children.forEach((child, index) => expect(child).toBe(snapshot.children[index]));
  WIDGET_ROLES.forEach((role, index) => {
    expect(widget.getArrowForRole(role)).toBe(snapshot.arrows[index]);
    expect(widget.getLabelForRole(role).getTexture()).toBe(snapshot.textures[index]);
  });
  expect(widget.getCamera().position.equals(snapshot.cameraPosition)).toBe(true);
  expect(widget.getCamera().quaternion.equals(snapshot.cameraQuaternion)).toBe(true);
}

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
