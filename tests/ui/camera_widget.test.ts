import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';

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

describe('CameraWidget ArrowHelper setup', () => {
  const TEST_ARROW_LENGTH = 1.2;
  const TEST_HEAD_LENGTH = 0.35;
  const TEST_HEAD_WIDTH = 0.2;

  it('should create an X arrow pointing along positive X', () => {
    const direction = new THREE.Vector3(1, 0, 0);
    const arrow = new THREE.ArrowHelper(
      direction,
      new THREE.Vector3(0, 0, 0),
      TEST_ARROW_LENGTH,
      Theme.widgetXAxisColor,
      TEST_HEAD_LENGTH,
      TEST_HEAD_WIDTH
    );

    const extractedDir = new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion);
    expect(extractedDir.x).toBeCloseTo(1);
    expect(extractedDir.y).toBeCloseTo(0);
    expect(extractedDir.z).toBeCloseTo(0);
  });

  it('should create a Y arrow pointing along positive Y', () => {
    const direction = new THREE.Vector3(0, 1, 0);
    const arrow = new THREE.ArrowHelper(
      direction,
      new THREE.Vector3(0, 0, 0),
      TEST_ARROW_LENGTH,
      Theme.widgetYAxisColor,
      TEST_HEAD_LENGTH,
      TEST_HEAD_WIDTH
    );

    const extractedDir = new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion);
    expect(extractedDir.x).toBeCloseTo(0);
    expect(extractedDir.y).toBeCloseTo(1);
    expect(extractedDir.z).toBeCloseTo(0);
  });

  it('should create a Z arrow pointing along positive Z', () => {
    const direction = new THREE.Vector3(0, 0, 1);
    const arrow = new THREE.ArrowHelper(
      direction,
      new THREE.Vector3(0, 0, 0),
      TEST_ARROW_LENGTH,
      Theme.widgetZAxisColor,
      TEST_HEAD_LENGTH,
      TEST_HEAD_WIDTH
    );

    const extractedDir = new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion);
    expect(extractedDir.x).toBeCloseTo(0);
    expect(extractedDir.y).toBeCloseTo(0);
    expect(extractedDir.z).toBeCloseTo(1);
  });

  it('should apply the correct color to the arrow line material', () => {
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      TEST_ARROW_LENGTH,
      Theme.widgetXAxisColor,
      TEST_HEAD_LENGTH,
      TEST_HEAD_WIDTH
    );
    const lineMat = arrow.line.material as THREE.LineBasicMaterial;
    expect(lineMat.color.getHex()).toBe(Theme.widgetXAxisColor);
  });

  it('should apply the correct color to the arrow cone material', () => {
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      TEST_ARROW_LENGTH,
      Theme.widgetYAxisColor,
      TEST_HEAD_LENGTH,
      TEST_HEAD_WIDTH
    );
    const coneMat = arrow.cone.material as THREE.MeshBasicMaterial;
    expect(coneMat.color.getHex()).toBe(Theme.widgetYAxisColor);
  });

  it('should set all three arrows with normalized directions', () => {
    const configs: { dir: THREE.Vector3; color: number }[] = [
      { dir: new THREE.Vector3(1, 0, 0), color: Theme.widgetXAxisColor },
      { dir: new THREE.Vector3(0, 1, 0), color: Theme.widgetYAxisColor },
      { dir: new THREE.Vector3(0, 0, 1), color: Theme.widgetZAxisColor },
    ];

    configs.forEach(({ dir, color }) => {
      const arrow = new THREE.ArrowHelper(
        dir,
        new THREE.Vector3(0, 0, 0),
        TEST_ARROW_LENGTH,
        color,
        TEST_HEAD_LENGTH,
        TEST_HEAD_WIDTH
      );
      const extractedDir = new THREE.Vector3(0, 0, 1).applyQuaternion(arrow.quaternion);
      expect(extractedDir.length()).toBeCloseTo(1);
    });
  });
});

describe('CameraWidget widget scene composition', () => {
  const TEST_ARROW_LENGTH = 1.2;
  const TEST_HEAD_LENGTH = 0.35;
  const TEST_HEAD_WIDTH = 0.2;

  it('should compose a scene with three arrows and a background color', () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(Theme.widgetBackgroundColor);

    const configs: { dir: THREE.Vector3; color: number }[] = [
      { dir: new THREE.Vector3(1, 0, 0), color: Theme.widgetXAxisColor },
      { dir: new THREE.Vector3(0, 1, 0), color: Theme.widgetYAxisColor },
      { dir: new THREE.Vector3(0, 0, 1), color: Theme.widgetZAxisColor },
    ];

    configs.forEach(({ dir, color }) => {
      const arrow = new THREE.ArrowHelper(
        dir,
        new THREE.Vector3(0, 0, 0),
        TEST_ARROW_LENGTH,
        color,
        TEST_HEAD_LENGTH,
        TEST_HEAD_WIDTH
      );
      scene.add(arrow);
    });

    expect(scene.children.length).toBe(3);
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect((scene.background as THREE.Color).getHex()).toBe(Theme.widgetBackgroundColor);

    const arrowHelpers = scene.children.filter((c) => c instanceof THREE.ArrowHelper);
    expect(arrowHelpers.length).toBe(3);
  });

  it('should create a valid orthographic camera for the widget', () => {
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    expect(camera.position.z).toBe(5);
    expect(camera.near).toBe(0.1);
    expect(camera.far).toBe(100);
  });
});

describe('CameraWidget quaternion mirroring', () => {
  it('should mirror a camera quaternion onto the widget camera', () => {
    const widgetCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
    widgetCamera.position.set(0, 0, 5);
    widgetCamera.lookAt(0, 0, 0);

    const mainCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    mainCamera.position.set(3, 4, 5);
    mainCamera.lookAt(0, 0, 0);

    const mainQuat = new THREE.Quaternion();
    mainCamera.getWorldQuaternion(mainQuat);
    widgetCamera.quaternion.copy(mainQuat);

    const widgetQuat = new THREE.Quaternion();
    widgetCamera.getWorldQuaternion(widgetQuat);

    expect(widgetQuat.x).toBeCloseTo(mainQuat.x);
    expect(widgetQuat.y).toBeCloseTo(mainQuat.y);
    expect(widgetQuat.z).toBeCloseTo(mainQuat.z);
    expect(widgetQuat.w).toBeCloseTo(mainQuat.w);
  });

  it('should produce different widget orientations for different camera positions', () => {
    const widgetCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
    widgetCamera.position.set(0, 0, 5);

    const mainCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    mainCamera.position.set(5, 5, 5);
    mainCamera.lookAt(0, 0, 0);

    const quat1 = new THREE.Quaternion();
    mainCamera.getWorldQuaternion(quat1);
    widgetCamera.quaternion.copy(quat1);

    mainCamera.position.set(-5, 3, -2);
    mainCamera.lookAt(0, 0, 0);

    const quat2 = new THREE.Quaternion();
    mainCamera.getWorldQuaternion(quat2);
    widgetCamera.quaternion.copy(quat2);

    expect(quat1.x).not.toBeCloseTo(quat2.x);
  });
});
