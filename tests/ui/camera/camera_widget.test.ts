import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '@/theme.js';
import {
  CAMERA_WIDGET_LABEL_CANVAS_HEIGHT_PX,
  CAMERA_WIDGET_LABEL_CANVAS_WIDTH_PX,
  CAMERA_WIDGET_LABEL_FONT_SIZE_PX,
  CAMERA_WIDGET_LABEL_WORLD_HEIGHT,
  CAMERA_WIDGET_LABEL_WORLD_WIDTH,
  CameraWidget,
} from '@/ui/camera/camera_widget.js';
import {
  CAMERA_WIDGET_DEFAULT_SIZE_PX,
  CAMERA_WIDGET_MARGIN_PX,
  CAMERA_WIDGET_MAX_SIZE_PX,
  CAMERA_WIDGET_MIN_SIZE_PX,
} from '@/ui/camera/camera_widget_layout.js';
import { getBuiltInCoordinateSpace } from '@/settings/coordinate/coordinate_space_presets.js';
import { ViewportPresentationContext } from '@/viewports/presentation/viewport_presentation_context.js';
import type { GameProfile } from '@/settings/store/settings_types.js';

/** Builds a profile using a built-in coordinate space and selected metric unit. */
function buildProfile(presetId: string, metricUnit: GameProfile['metricUnit'] = 'meter'): GameProfile {
  const coordinateSpace = getBuiltInCoordinateSpace(presetId);
  if (!coordinateSpace) throw new Error(`Unknown coordinate space: ${presetId}`);
  return {
    id: presetId,
    name: presetId,
    unitSystem: 'metric',
    metricUnit,
    imperialUnit: 'foot',
    coordinateSpace,
  };
}

/** Returns the line material color for an orientation arrow. */
function getArrowColor(arrow: THREE.ArrowHelper): number {
  const material = arrow.line.material;
  if (Array.isArray(material)) throw new Error('Orientation arrow line has multiple materials');
  if (!(material instanceof THREE.LineBasicMaterial))
    throw new Error('Orientation arrow line has an unexpected material');
  return material.color.getHex();
}

/**
 * Returns the direction represented by an arrow helper before parent
 * transforms.
 */
function getArrowDirection(arrow: THREE.ArrowHelper): THREE.Vector3 {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion).normalize();
}

/**
 * Asserts that two vectors represent the same direction within floating-point
 * tolerance.
 */
function expectVectorCloseTo(actual: THREE.Vector3, expected: THREE.Vector3): void {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.z).toBeCloseTo(expected.z);
}

/** Returns all label sprites currently owned by a camera widget. */
function getLabelSprites(widget: CameraWidget): THREE.Sprite[] {
  const labelGroup = widget.getScene().children.find((child) => child !== widget.getArrowGroup());
  if (!(labelGroup instanceof THREE.Group)) throw new Error('Camera widget label group is missing');
  return labelGroup.children.filter((child): child is THREE.Sprite => child instanceof THREE.Sprite);
}

/** Creates the minimal canvas context required by camera-widget label drawing. */
function createCanvasContextStub(fillText: ReturnType<typeof vi.fn>): CanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    fillText,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    fillStyle: '#000000',
  } as unknown as CanvasRenderingContext2D;
}

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

describe('CameraWidget semantic axis colors', () => {
  it('colors profile-role arrows by their underlying X Y or Z axis', () => {
    const expectations = [
      ['godot', Theme.widgetXAxisColor, Theme.widgetYAxisColor, Theme.widgetZAxisColor],
      ['blender', Theme.widgetXAxisColor, Theme.widgetZAxisColor, Theme.widgetYAxisColor],
      ['unity', Theme.widgetXAxisColor, Theme.widgetYAxisColor, Theme.widgetZAxisColor],
      ['unreal', Theme.widgetYAxisColor, Theme.widgetZAxisColor, Theme.widgetXAxisColor],
    ] as const;

    expectations.forEach(([presetId, rightColor, upColor, forwardColor]) => {
      const widget = new CameraWidget();
      try {
        const context = new ViewportPresentationContext(buildProfile(presetId));
        widget.setPresentationContext(context);
        expect(getArrowColor(widget.getArrowX())).toBe(rightColor);
        expect(getArrowColor(widget.getArrowY())).toBe(upColor);
        expect(getArrowColor(widget.getArrowZ())).toBe(forwardColor);
        expect(widget.getAxisLabels(context)).toEqual({
          right: context.getAxisLabel('right'),
          up: context.getAxisLabel('up'),
          forward: context.getAxisLabel('forward'),
        });
      } finally {
        widget.dispose();
      }
    });
  });

  it('preserves widget labels and colors when only the active unit changes', () => {
    const widget = new CameraWidget();
    try {
      const meterContext = new ViewportPresentationContext(buildProfile('unreal', 'meter'));
      const centimeterContext = new ViewportPresentationContext(buildProfile('unreal', 'centimeter'));
      widget.setPresentationContext(meterContext);
      const meterLabels = widget.getAxisLabels(meterContext);
      const meterColors = [
        getArrowColor(widget.getArrowX()),
        getArrowColor(widget.getArrowY()),
        getArrowColor(widget.getArrowZ()),
      ];
      widget.setPresentationContext(centimeterContext);

      expect(widget.getAxisLabels(centimeterContext)).toEqual(meterLabels);
      expect([
        getArrowColor(widget.getArrowX()),
        getArrowColor(widget.getArrowY()),
        getArrowColor(widget.getArrowZ()),
      ]).toEqual(meterColors);
    } finally {
      widget.dispose();
    }
  });
});

describe('CameraWidget profile directions', () => {
  it('maps all built-in profile axes into the editor space with signed labels', () => {
    const expectedEditorBasis = {
      right: new THREE.Vector3(1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
      forward: new THREE.Vector3(0, 0, -1),
    };
    const expectedLabels = {
      godot: { right: '+X', up: '+Y', forward: '-Z' },
      blender: { right: '+X', up: '+Z', forward: '+Y' },
      unity: { right: '+X', up: '+Y', forward: '+Z' },
      unreal: { right: '+Y', up: '+Z', forward: '+X' },
    } as const;

    (Object.keys(expectedLabels) as Array<keyof typeof expectedLabels>).forEach((presetId) => {
      const widget = new CameraWidget();
      try {
        const context = new ViewportPresentationContext(buildProfile(presetId));
        widget.setPresentationContext(context);

        expectVectorCloseTo(getArrowDirection(widget.getArrowX()), expectedEditorBasis.right);
        expectVectorCloseTo(getArrowDirection(widget.getArrowY()), expectedEditorBasis.up);
        expectVectorCloseTo(getArrowDirection(widget.getArrowZ()), expectedEditorBasis.forward);
        expect(widget.getAxisLabels(context)).toEqual(expectedLabels[presetId]);
      } finally {
        widget.dispose();
      }
    });
  });
});

describe('CameraWidget labels', () => {
  it('draws high-resolution labels with a readable widget-relative footprint', () => {
    const fillText = vi.fn();
    const context = createCanvasContextStub(fillText);
    const contextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    const widget = new CameraWidget();

    try {
      const sprites = getLabelSprites(widget);
      expect(sprites).toHaveLength(3);
      expect(fillText).toHaveBeenCalledTimes(3);
      expect(context.font).toBe(`bold ${CAMERA_WIDGET_LABEL_FONT_SIZE_PX}px sans-serif`);

      const texture = (sprites[0]?.material as THREE.SpriteMaterial).map;
      const textureImage = texture?.image;
      if (!(textureImage instanceof HTMLCanvasElement)) throw new Error('Camera widget label texture is not a canvas');
      expect(textureImage.width).toBe(CAMERA_WIDGET_LABEL_CANVAS_WIDTH_PX);
      expect(textureImage.height).toBe(CAMERA_WIDGET_LABEL_CANVAS_HEIGHT_PX);
      expect(sprites[0]?.scale.x).toBe(CAMERA_WIDGET_LABEL_WORLD_WIDTH);
      expect(sprites[0]?.scale.y).toBe(CAMERA_WIDGET_LABEL_WORLD_HEIGHT);
    } finally {
      widget.dispose();
      contextSpy.mockRestore();
    }
  });
});

describe('CameraWidget size', () => {
  it('clamps requested size and applies it to the rendered overlay', () => {
    const widget = new CameraWidget();
    try {
      expect(widget.getSize()).toBe(CAMERA_WIDGET_DEFAULT_SIZE_PX);
      widget.setSize(144);
      expect(widget.getSize()).toBe(144);
      widget.setSize(CAMERA_WIDGET_MAX_SIZE_PX + 1);
      expect(widget.getSize()).toBe(CAMERA_WIDGET_MAX_SIZE_PX);
      widget.setSize(CAMERA_WIDGET_MIN_SIZE_PX - 1);
      expect(widget.getSize()).toBe(CAMERA_WIDGET_MIN_SIZE_PX);
    } finally {
      widget.dispose();
    }
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
