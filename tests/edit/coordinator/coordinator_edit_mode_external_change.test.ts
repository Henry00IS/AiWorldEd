import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CoordinatorEditMode } from '@/edit/coordinator/coordinator_edit_mode.js';
import { MESH_EDIT_DOCUMENT_USERDATA_KEY } from '@/edit/mesh/mesh_edit_binding.js';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import { EditorComponentMode } from '@/types/editor_component_mode.js';

/**
 * Builds a triangle mesh with an edit document binding.
 *
 * @param uuid Object uuid.
 * @returns Mesh ready for Edit Mode.
 */
function createTriangleMesh(uuid: string): THREE.Mesh {
  const builder = new MeshTopologyBuilder();
  const a = builder.appendVertex(0, 0, 0);
  const b = builder.appendVertex(2, 0, 0);
  const c = builder.appendVertex(0, 2, 0);
  builder.appendFace([a, b, c]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3));
  geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.uuid = uuid;
  mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = new MeshDocument(builder.build());
  return mesh;
}

/**
 * Opens Edit Mode in face mode on a mesh with one selected face and a stale
 * face key, then lets a room rebuild the mesh under the same uuid.
 *
 * @returns Coordinator, world, the rebuilt mesh and the selection holder.
 */
function openThenRebuild(): { coordinator: CoordinatorEditMode; world: THREE.Group; rebuilt: THREE.Mesh } {
  const world = new THREE.Group();
  const original = createTriangleMesh('mesh-a');
  world.add(original);
  let selected: THREE.Object3D[] = [original];
  const coordinator = new CoordinatorEditMode({
    getPrimaryScene: () => new THREE.Scene(),
    getSelectedObjects: () => selected,
    getViewports: () => [],
    showStatusMessage: vi.fn(),
    getCommandStack: () => null,
  });
  expect(coordinator.enterFromObjectSelection()).toBe(true);
  coordinator.setComponentMode(EditorComponentMode.FACE);
  const selection = coordinator.getSession().getComponentSelection();
  selection.replaceAll([
    { targetId: 'mesh-a', kind: 'face', componentKey: '0' },
    { targetId: 'mesh-a', kind: 'face', componentKey: '7' },
  ]);
  const rebuilt = createTriangleMesh('mesh-a');
  world.remove(original);
  world.add(rebuilt);
  selected = [rebuilt];
  return { coordinator, world, rebuilt };
}

describe('CoordinatorEditMode after an external scene change', () => {
  it('rebinds a rebuilt mesh and keeps mode and the components that still exist', () => {
    const { coordinator, world, rebuilt } = openThenRebuild();
    coordinator.refreshAfterExternalChange(world);
    const session = coordinator.getSession();
    expect(session.isActive()).toBe(true);
    expect(session.getContentMeshTargets().map((target) => target.mesh)).toEqual([rebuilt]);
    expect(session.getComponentMode()).toBe(EditorComponentMode.FACE);
    expect(session.getComponentSelection().getSelected()).toEqual([
      { targetId: 'mesh-a', kind: 'face', componentKey: '0' },
    ]);
  });

  it('leaves Edit Mode when the rebuilt object is no longer selected', () => {
    const world = new THREE.Group();
    const mesh = createTriangleMesh('mesh-b');
    world.add(mesh);
    let selected: THREE.Object3D[] = [mesh];
    const coordinator = new CoordinatorEditMode({
      getPrimaryScene: () => new THREE.Scene(),
      getSelectedObjects: () => selected,
      getViewports: () => [],
      showStatusMessage: vi.fn(),
      getCommandStack: () => null,
    });
    expect(coordinator.enterFromObjectSelection()).toBe(true);
    world.remove(mesh);
    selected = [];
    coordinator.refreshAfterExternalChange(world);
    expect(coordinator.isActive()).toBe(false);
  });
});
