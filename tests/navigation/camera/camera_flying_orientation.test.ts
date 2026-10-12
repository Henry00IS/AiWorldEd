import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraFlying } from '@/navigation/camera/camera_flying.js';
import { EditorOrientation } from '@/navigation/orientation/editor_orientation.js';
import { ManagerInput } from '@/input/manager_input.js';

describe('CameraFlying orientation', () => {
  it('moves Q/E along editor up after face alignment', () => {
    const keys = new Set<string>(['KeyE']);
    const mockInputManager = {
      isKeyDown: (code: string) => keys.has(code),
      isPhysicalKeyDown: (code: string) => keys.has(code),
      isShiftDown: () => false,
      isRightMouseDown: () => true,
      reset: () => {},
    } as unknown as ManagerInput;
    const canvas = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    const orientation = new EditorOrientation();
    orientation.setFromFaceNormal(new THREE.Vector3(1, 0, 0), new THREE.Vector3());
    const flying = new CameraFlying(canvas, camera, mockInputManager, 0, 0, orientation);
    (flying as unknown as { isRotating: boolean }).isRotating = true;
    const before = camera.position.clone();
    flying.update(1);
    const delta = camera.position.clone().sub(before);
    expect(delta.x).toBeGreaterThan(0.5);
    expect(Math.abs(delta.y)).toBeLessThan(0.1);
    expect(Math.abs(delta.z)).toBeLessThan(0.1);
    flying.dispose();
  });
});
