import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  PickerGridEdgeAlign,
  resolveNearestEdgeEndpointForOrigin,
  type GridEdgePickResult,
} from '@/tools/grid/picker_grid_edge_align.js';

/**
 * Builds a pick element with a fixed 200×200 CSS rect.
 *
 * @returns HTML element mock.
 */
function createPickElement(): HTMLElement {
  const pickElement = document.createElement('div');
  pickElement.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return pickElement;
}

describe('PickerGridEdgeAlign', () => {
  it('picks a world-space edge under the pointer on a content mesh', () => {
    const world = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    world.add(mesh);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const picker = new PickerGridEdgeAlign();
    const event = { clientX: 100, clientY: 100 } as MouseEvent;
    const edge = picker.pickEdge(event, camera, createPickElement(), world, 40);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    expect(edge.direction.length()).toBeGreaterThan(0.5);
    expect(edge.closestPoint.distanceTo(edge.pointA) + edge.closestPoint.distanceTo(edge.pointB)).toBeCloseTo(
      edge.pointA.distanceTo(edge.pointB),
      5,
    );
  });

  it('places closestPoint under the pointer on a long edge via ray–segment closest', () => {
    const world = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-4, 0, 0, 4, 0, 0, 0, 2, 0]), 3));
    geometry.setIndex([0, 1, 2]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    world.add(mesh);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const picker = new PickerGridEdgeAlign();
    const aim = new THREE.Vector3(3, 0, 0).project(camera);
    const clientX = (aim.x + 1) * 0.5 * 200;
    const clientY = (1 - (aim.y + 1) * 0.5) * 200;
    const edge = picker.pickEdge({ clientX, clientY } as MouseEvent, camera, createPickElement(), world, 40);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    const midpoint = new THREE.Vector3().addVectors(edge.pointA, edge.pointB).multiplyScalar(0.5);
    expect(edge.closestPoint.distanceTo(new THREE.Vector3(3, 0, 0))).toBeLessThan(0.2);
    expect(edge.closestPoint.distanceTo(midpoint)).toBeGreaterThan(1);
  });

  it('returns null when the world has no pickable meshes', () => {
    const world = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 6);
    const picker = new PickerGridEdgeAlign();
    const edge = picker.pickEdge({ clientX: 100, clientY: 100 } as MouseEvent, camera, createPickElement(), world);
    expect(edge).toBeNull();
  });

  it('picks the edge endpoint nearer the pointer for Zero Origin', () => {
    const pointA = new THREE.Vector3(-4, 0, 0);
    const pointB = new THREE.Vector3(4, 0, 0);
    const edge: GridEdgePickResult = {
      pointA,
      pointB,
      closestPoint: new THREE.Vector3(3, 0, 0),
      direction: new THREE.Vector3(8, 0, 0),
    };
    expect(resolveNearestEdgeEndpointForOrigin(edge)).toBe(pointB);
    edge.closestPoint.set(-2.5, 0, 0);
    expect(resolveNearestEdgeEndpointForOrigin(edge)).toBe(pointA);
  });

  it('prefers the depth edge when a front click lands on a corner', () => {
    const world = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    world.add(mesh);
    const camera = frontPickCamera();
    const corner = new THREE.Vector3(0.5, 0.5, 0).project(camera);
    const edge = new PickerGridEdgeAlign().pickEdge(cornerEvent(corner), camera, createPickElement(), world);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    const direction = edge.direction.clone().normalize();
    expect(Math.abs(direction.dot(new THREE.Vector3(0, 0, 1)))).toBeGreaterThan(0.99);
  });

  it('does not pick a coplanar triangulation diagonal on a flat quad', () => {
    const world = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0]), 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    world.add(mesh);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const picker = new PickerGridEdgeAlign();
    const diagonalMid = new THREE.Vector3(0, 0, 0).project(camera);
    const clientX = (diagonalMid.x + 1) * 0.5 * 200;
    const clientY = (1 - (diagonalMid.y + 1) * 0.5) * 200;
    const edge = picker.pickEdge({ clientX, clientY } as MouseEvent, camera, createPickElement(), world, 8);
    if (edge) {
      const direction = edge.direction.clone().normalize();
      const diagonal = new THREE.Vector3(1, 1, 0).normalize();
      expect(Math.abs(direction.dot(diagonal))).toBeLessThan(0.95);
    }
  });
});

/**
 * Orthographic camera looking down the negative Z axis.
 *
 * @returns Camera.
 */
function frontPickCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 40);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Pointer event at a projected point on the 200 by 200 pick element.
 *
 * @param projected Point already projected by the camera.
 * @returns Mouse event.
 */
function cornerEvent(projected: THREE.Vector3): MouseEvent {
  return {
    clientX: (projected.x * 0.5 + 0.5) * 200,
    clientY: (-projected.y * 0.5 + 0.5) * 200,
  } as MouseEvent;
}
