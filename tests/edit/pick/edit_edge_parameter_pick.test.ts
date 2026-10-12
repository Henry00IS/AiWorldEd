import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { pickEditEdgeParameterAtClient } from '@/edit/pick/edit_edge_parameter_pick.js';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';

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

describe('edit edge parameter pick', () => {
  it('picks the half-edge under the pointer from document topology', () => {
    const document = meshDocumentFromPolygonList(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), [[0, 1, 2]]);
    const mesh = new THREE.Mesh();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0.5, 0, 3);
    camera.lookAt(0.5, 0, 0);
    camera.updateMatrixWorld(true);
    const { clientX, clientY } = projectWorldToClient(new THREE.Vector3(0.5, 0, 0), camera);
    const hit = pickEditEdgeParameterAtClient(
      { clientX, clientY } as MouseEvent,
      camera,
      createPickElement(),
      [{ targetId: 'triangle', mesh, document }],
      [],
    );
    expect(hit).not.toBeNull();
    if (!hit) {
      return;
    }
    const endpoints = [hit.vertexA, hit.vertexB].sort((left, right) => left - right);
    expect(endpoints).toEqual([0, 1]);
    expect(hit.parameter).toBeGreaterThan(0.3);
    expect(hit.parameter).toBeLessThan(0.7);
  });
});
