import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BoundsFacePicker } from '../../src/transform/bounds_face_picker.js';
import { BoundsGizmo } from '../../src/transform/bounds_gizmo.js';
import { Theme } from '../../src/theme.js';
import { OrientedBoundsData } from '../../src/transform/oriented_bounds.js';

describe('BoundsFacePicker', () => {
  it('should return null when the gizmo group is hidden', () => {
    const picker = new BoundsFacePicker();
    const setup = createPickerSetup();
    setup.gizmoGroup.visible = false;
    const event = createCenterEvent();
    const result = picker.pickFace(
      event,
      setup.camera,
      setup.renderer,
      setup.gizmoGroup
    );
    expect(result).toBeNull();
  });

  it('should pick a face in move mode for a center click', () => {
    const picker = new BoundsFacePicker();
    const setup = createPickerSetup();
    setup.gizmoGroup.visible = true;
    setup.gizmoGroup.updateMatrixWorld(true);
    const event = createCenterEvent();
    const result = picker.pickFace(
      event,
      setup.camera,
      setup.renderer,
      setup.gizmoGroup
    );
    expect(result).not.toBeNull();
    expect(result!.face).toBeDefined();
    expect(result!.normal.length()).toBeCloseTo(1, 5);
  });

  it('should dispose without errors', () => {
    const picker = new BoundsFacePicker();
    expect(() => picker.dispose()).not.toThrow();
  });
});

/**
 * Builds camera, renderer, and bounds gizmo group for face picking.
 * @returns Fixtures for BoundsFacePicker tests.
 */
function createPickerSetup(): {
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  gizmoGroup: THREE.Group;
} {
  const boundsGizmo = new BoundsGizmo(Theme);
  boundsGizmo.createHandles();
  const bounds: OrientedBoundsData = {
    center: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(),
    halfExtents: new THREE.Vector3(1, 1, 1)
  };
  boundsGizmo.updateFromBounds(bounds, 0.2);
  const gizmoGroup = new THREE.Group();
  boundsGizmo.getAllSceneObjects().forEach((obj) => gizmoGroup.add(obj));
  gizmoGroup.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  };
  const renderer = { domElement: canvas } as unknown as THREE.WebGLRenderer;
  return { camera, renderer, gizmoGroup };
}

/**
 * Creates a pointer event at the canvas center.
 * @returns A MouseEvent at NDC origin.
 */
function createCenterEvent(): MouseEvent {
  return new MouseEvent('pointerdown', { clientX: 400, clientY: 300 });
}
