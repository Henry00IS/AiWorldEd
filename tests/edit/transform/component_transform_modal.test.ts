import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import { HandlerComponentTransform } from '@/edit/transform/handler_component_transform.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { TransformMode } from '@/types/transform_mode.js';
import { readComponentTransformVertexLocal } from '@/edit/transform/component_transform_vertex.js';
import type { ComponentTransformMeshVertex } from '@/edit/transform/component_transform_vertex.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';
import { applyComponentModalNumericValue } from '@/edit/transform/component_transform_modal_apply.js';

/**
 * Builds a triangle mesh transform vertex at the origin.
 *
 * @returns Mesh vertex descriptor.
 */
function createMeshTransformVertex(): ComponentTransformMeshVertex {
  const builder = new MeshTopologyBuilder();
  const a = builder.appendVertex(0, 0, 0);
  const b = builder.appendVertex(1, 0, 0);
  const c = builder.appendVertex(0, 1, 0);
  builder.appendFace([a, b, c]);
  const document = new MeshDocument(builder.build());
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  return {
    kind: 'mesh',
    targetId: 'mesh-1',
    vertexIndex: 0,
    mesh,
    document,
    initialLocal: new THREE.Vector3(0, 0, 0),
  };
}

/**
 * Builds a synthetic pick element with a fixed client rectangle.
 *
 * @returns HTML element for NDC projection.
 */
function createPickElement(): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
  });
  return element;
}

describe('component transform modal (X/Y/Z + numeric)', () => {
  it('applies typed translation along X for component vertices', () => {
    const vertex = createMeshTransformVertex();
    const applied = applyComponentModalNumericValue(
      TransformMode.TRANSLATE,
      [vertex],
      new THREE.Vector3(0, 0, 0),
      2.5,
      TransformModalAxis.X,
      new THREE.Quaternion(),
      null,
    );
    expect(applied).toBe(true);
    expect(readComponentTransformVertexLocal(vertex).x).toBeCloseTo(2.5, 5);
    expect(readComponentTransformVertexLocal(vertex).y).toBeCloseTo(0, 5);
  });

  it('applies typed rotation about Y for component vertices', () => {
    const vertex = createMeshTransformVertex();
    vertex.initialLocal.set(1, 0, 0);
    const positions = vertex.document.getTopology().getPositions();
    positions[0] = 1;
    positions[1] = 0;
    positions[2] = 0;
    const applied = applyComponentModalNumericValue(
      TransformMode.ROTATE,
      [vertex],
      new THREE.Vector3(0, 0, 0),
      90,
      TransformModalAxis.Y,
      new THREE.Quaternion(),
      null,
    );
    expect(applied).toBe(true);
    const local = readComponentTransformVertexLocal(vertex);
    expect(local.x).toBeCloseTo(0, 4);
    expect(local.z).toBeCloseTo(-1, 4);
  });

  it('applies typed free scale uniformly for component vertices', () => {
    const vertex = createMeshTransformVertex();
    vertex.initialLocal.set(1, 0, 0);
    const positions = vertex.document.getTopology().getPositions();
    positions[0] = 1;
    positions[1] = 0;
    positions[2] = 0;
    const applied = applyComponentModalNumericValue(
      TransformMode.SCALE,
      [vertex],
      new THREE.Vector3(0, 0, 0),
      2,
      TransformModalAxis.None,
      new THREE.Quaternion(),
      null,
    );
    expect(applied).toBe(true);
    expect(readComponentTransformVertexLocal(vertex).x).toBeCloseTo(2, 5);
  });

  it('handles modal X axis key during a single-use component drag', () => {
    const handler = new HandlerComponentTransform(new GridSnap(false, 1), null);
    const vertex = createMeshTransformVertex();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const started = handler.beginSingleUseDrag(
      TransformMode.TRANSLATE,
      [vertex],
      new THREE.Vector3(0, 0, 0),
      camera,
      pickElement,
      100,
      100,
    );
    expect(started).toBe(true);
    const keyEvent = new KeyboardEvent('keydown', { code: 'KeyX', key: 'x' });
    expect(handler.handleModalKeyDown(keyEvent)).toBe(true);
    expect(handler.applyNumericValue(3, TransformModalAxis.X)).toBe(true);
    expect(readComponentTransformVertexLocal(vertex).x).toBeCloseTo(3, 5);
    handler.cancelIfNeeded();
  });

  it('applies typed translation along the workspace grid axis', () => {
    const gridSnap = new GridSnap(false, 1);
    const basis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    gridSnap.setWorkspaceBasisQuaternion(basis);
    const handler = new HandlerComponentTransform(gridSnap, null);
    const vertex = createMeshTransformVertex();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const started = handler.beginSingleUseDrag(
      TransformMode.TRANSLATE,
      [vertex],
      new THREE.Vector3(0, 0, 0),
      camera,
      createPickElement(),
      100,
      100,
    );
    expect(started).toBe(true);
    const keyEvent = new KeyboardEvent('keydown', { code: 'KeyX', key: 'x' });
    expect(handler.handleModalKeyDown(keyEvent)).toBe(true);
    const distance = 4;
    expect(handler.applyNumericValue(distance, TransformModalAxis.X)).toBe(true);
    const expected = new THREE.Vector3(1, 0, 0).applyQuaternion(basis).multiplyScalar(distance);
    expect(readComponentTransformVertexLocal(vertex).distanceTo(expected)).toBeLessThan(1e-4);
    handler.cancelIfNeeded();
  });
});
