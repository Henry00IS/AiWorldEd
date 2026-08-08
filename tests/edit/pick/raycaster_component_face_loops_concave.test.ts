import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pickComponentFaceLoops } from '@/edit/pick/raycaster_component_face_loops.js';

/**
 * Builds a pick element mock with fixed layout size.
 *
 * @returns HTML element mock.
 */
function createPickElement(): HTMLElement {
  return {
    clientWidth: 400,
    clientHeight: 400,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 }),
  } as HTMLElement;
}

/**
 * Projects a world point to client coordinates for the fixed pick element.
 *
 * @param world World point.
 * @param camera Camera.
 * @returns Client coordinates.
 */
function projectWorldToClient(world: THREE.Vector3, camera: THREE.Camera): { clientX: number; clientY: number } {
  const projected = world.clone().project(camera);
  return {
    clientX: (projected.x + 1) * 0.5 * 400,
    clientY: (1 - (projected.y + 1) * 0.5) * 400,
  };
}

/**
 * Builds a C-shaped concave n-gon in the XY plane. Fan triangulation from the
 * first vertex fills the open mouth; ear-clip does not.
 *
 * @returns Ordered world loop.
 */
function buildCShapedFaceLoop(): THREE.Vector3[] {
  return [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(3, 0, 0),
    new THREE.Vector3(3, 1, 0),
    new THREE.Vector3(1, 1, 0),
    new THREE.Vector3(1, 2, 0),
    new THREE.Vector3(3, 2, 0),
    new THREE.Vector3(3, 3, 0),
    new THREE.Vector3(0, 3, 0),
  ];
}

describe('pickComponentFaceLoops concave n-gons', () => {
  it('does not select a C-shaped face when clicking in the open mouth hole', () => {
    const worldLoop = buildCShapedFaceLoop();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(1.5, 1.5, 8);
    camera.lookAt(1.5, 1.5, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const holePoint = new THREE.Vector3(2, 1.5, 0);
    const { clientX, clientY } = projectWorldToClient(holePoint, camera);
    const hit = pickComponentFaceLoops({ clientX, clientY } as MouseEvent, camera, pickElement, [
      {
        targetId: 'mesh-c',
        faces: [{ faceIndex: 0, worldLoop }],
      },
    ]);
    expect(hit).toBeNull();
  });

  it('selects a C-shaped face when clicking solid surface', () => {
    const worldLoop = buildCShapedFaceLoop();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(1.5, 1.5, 8);
    camera.lookAt(1.5, 1.5, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const solidPoint = new THREE.Vector3(0.5, 1.5, 0);
    const { clientX, clientY } = projectWorldToClient(solidPoint, camera);
    const hit = pickComponentFaceLoops({ clientX, clientY } as MouseEvent, camera, pickElement, [
      {
        targetId: 'mesh-c',
        faces: [{ faceIndex: 0, worldLoop }],
      },
    ]);
    expect(hit).not.toBeNull();
    expect(hit!.faceIndex).toBe(0);
    expect(hit!.targetId).toBe('mesh-c');
  });

  it('still picks a convex quad face under the pointer', () => {
    const worldLoop = [
      new THREE.Vector3(-1, -1, 0),
      new THREE.Vector3(1, -1, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(-1, 1, 0),
    ];
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const { clientX, clientY } = projectWorldToClient(new THREE.Vector3(0, 0, 0), camera);
    const hit = pickComponentFaceLoops({ clientX, clientY } as MouseEvent, camera, pickElement, [
      {
        targetId: 'mesh-quad',
        faces: [{ faceIndex: 2, worldLoop }],
      },
    ]);
    expect(hit).not.toBeNull();
    expect(hit!.faceIndex).toBe(2);
  });
});
