import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import { MESH_EDIT_DOCUMENT_USERDATA_KEY } from '@/edit/mesh/mesh_edit_binding.js';
import { pickNearestWorldPointIndex } from '@/edit/pick/raycaster_component_world_points.js';
import { isWorldPointUnoccluded } from '@/edit/pick/edit_component_occlusion.js';
import { resolveEditComponentPickRadius } from '@/edit/pick/edit_component_screen_metrics.js';
import { EDIT_COMPONENT_VERTEX_PICK_RADIUS_PX } from '@/edit/component/component_edit_pick_radii.js';
import { CoordinatorEditMode } from '@/edit/coordinator/coordinator_edit_mode.js';
import { EditorComponentMode } from '@/types/editor_component_mode.js';

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
 * Builds a triangle mesh document at the origin.
 *
 * @returns Mesh and document.
 */
function createTriangleMesh(): THREE.Mesh {
  const builder = new MeshTopologyBuilder();
  const a = builder.appendVertex(0, 0, 0);
  const b = builder.appendVertex(2, 0, 0);
  const c = builder.appendVertex(0, 2, 0);
  builder.appendFace([a, b, c]);
  const document = new MeshDocument(builder.build());
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = document;
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('edit component pick integration', () => {
  it('picks a surface vertex under a perspective camera with self-occlusion', () => {
    const mesh = createTriangleMesh();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(1, 1, 5);
    camera.lookAt(1, 0.5, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const worldPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0), new THREE.Vector3(0, 2, 0)];
    const target = worldPoints[0]!.clone().project(camera);
    const clientX = (target.x + 1) * 0.5 * 400;
    const clientY = (1 - (target.y + 1) * 0.5) * 400;
    const event = { clientX, clientY } as MouseEvent;
    const hit = pickNearestWorldPointIndex(
      event,
      camera,
      pickElement,
      worldPoints,
      resolveEditComponentPickRadius(camera, EDIT_COMPONENT_VERTEX_PICK_RADIUS_PX),
    );
    expect(hit).not.toBeNull();
    expect(hit?.index).toBe(0);
    expect(isWorldPointUnoccluded(worldPoints[0]!, camera, [mesh])).toBe(true);
    mesh.geometry.dispose();
  });

  it('picks vertices through CoordinatorEditMode in a fake viewport', () => {
    const mesh = createTriangleMesh();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(1, 1, 5);
    camera.lookAt(1, 0.5, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const scene = new THREE.Scene();
    scene.add(mesh);
    const coordinator = new CoordinatorEditMode({
      getPrimaryScene: () => scene,
      getSelectedObjects: () => [mesh],
      getViewports: () => [
        {
          getContentElement: () => pickElement,
          getCamera: () => camera,
        },
      ],
      showStatusMessage: () => undefined,
      getCommandStack: () => null,
    });
    expect(coordinator.enterFromObjectSelection()).toBe(true);
    coordinator.setComponentMode(EditorComponentMode.VERTEX);
    const world = new THREE.Vector3(0, 0, 0);
    const projected = world.project(camera);
    const clientX = (projected.x + 1) * 0.5 * 400;
    const clientY = (1 - (projected.y + 1) * 0.5) * 400;
    const picked = coordinator.pickAtClientPoint(clientX, clientY, false, false);
    expect(picked).toBe(true);
    expect(coordinator.getComponentSelectionCount()).toBe(1);
    coordinator.dispose();
    mesh.geometry.dispose();
  });

  it('picks front-facing vertices in orthographic view', () => {
    const mesh = createTriangleMesh();
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const scene = new THREE.Scene();
    scene.add(mesh);
    const coordinator = new CoordinatorEditMode({
      getPrimaryScene: () => scene,
      getSelectedObjects: () => [mesh],
      getViewports: () => [
        {
          getContentElement: () => pickElement,
          getCamera: () => camera,
        },
      ],
      showStatusMessage: () => undefined,
      getCommandStack: () => null,
    });
    expect(coordinator.enterFromObjectSelection()).toBe(true);
    const world = new THREE.Vector3(0, 0, 0);
    const projected = world.project(camera);
    const clientX = (projected.x + 1) * 0.5 * 400;
    const clientY = (1 - (projected.y + 1) * 0.5) * 400;
    expect(coordinator.pickAtClientPoint(clientX, clientY, false, false)).toBe(true);
    coordinator.dispose();
    mesh.geometry.dispose();
  });
});
