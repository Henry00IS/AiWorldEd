import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import { MESH_EDIT_DOCUMENT_USERDATA_KEY } from '@/edit/mesh/mesh_edit_binding.js';
import { HandlerComponentTransform } from '@/edit/transform/handler_component_transform.js';
import { expandComponentSelectionToTransformVertices } from '@/edit/transform/component_transform_selection.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { GizmoAxis, TransformMode } from '@/types/transform_mode.js';
import { readComponentTransformVertexLocal } from '@/edit/transform/component_transform_vertex.js';

const INTERVAL = 0.25;

/**
 * In Edit Mode with Local transform space, a vertex moved along a turned handle
 * snaps in steps along that handle, not on the workspace grid.
 */
describe('moving components in Local transform space', () => {
  it('snaps along the turned handle axis', () => {
    const moved = dragAlongTurnedX(true);
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(turn());
    const along = moved.dot(axis);
    expect(moved.clone().sub(axis.clone().multiplyScalar(along)).length()).toBeLessThan(1e-6);
    expect(Math.abs(along / INTERVAL - Math.round(along / INTERVAL))).toBeLessThan(1e-6);
    expect(Math.abs(along)).toBeGreaterThan(0);
  });

  it('keeps the workspace grid in Global space', () => {
    const moved = dragAlongTurnedX(false);
    for (const value of moved.toArray()) {
      expect(Math.abs(value / INTERVAL - Math.round(value / INTERVAL))).toBeLessThan(1e-6);
    }
  });
});

/**
 * Returns the handle orientation: turned 30 degrees about Z.
 *
 * @returns Orientation.
 */
function turn(): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(30));
}

/**
 * Drags one vertex of a triangle along a turned X handle.
 *
 * @param local Whether Local transform space is active.
 * @returns How far the vertex moved.
 */
function dragAlongTurnedX(local: boolean): THREE.Vector3 {
  const builder = new MeshTopologyBuilder();
  const a = builder.appendVertex(0, 0, 0);
  builder.appendFace([a, builder.appendVertex(2, 0, 0), builder.appendVertex(0, 2, 0)]);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = new MeshDocument(builder.build());
  mesh.updateMatrixWorld(true);
  const gridSnap = new GridSnap(true, INTERVAL);
  gridSnap.setKeyboardAxisUsesObjectOrientation(local);
  const handler = new HandlerComponentTransform(gridSnap, null);
  const vertices = expandComponentSelectionToTransformVertices(
    [{ targetId: mesh.uuid, kind: 'vertex', componentKey: '0' }],
    [{ kind: 'content_mesh', mesh, targetId: mesh.uuid }],
  );
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const element = document.createElement('div');
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
  });
  handler.beginGizmoHandleDrag(
    TransformMode.TRANSLATE,
    GizmoAxis.X,
    turn(),
    vertices,
    new THREE.Vector3(),
    camera,
    element,
    100,
    100,
  );
  handler.applyPointerMove(163, 88);
  return readComponentTransformVertexLocal(vertices[0]!).clone();
}
