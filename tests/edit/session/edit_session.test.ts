import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EditSession } from '@/edit/session/edit_session.js';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { readBoundMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import { rebuildDecorativeEdges, DECORATIVE_EDGE_USERDATA_KEY } from '@/utils/mesh_edge_sync.js';
import { isEditModeWireframeSuppressed } from '@/utils/edit_mode_wireframe_suppress.js';
import { buildComponentTopologyFromMeshDocument } from '@/edit/component/component_selection_topology.js';

/**
 * Finds the content decorative edge LineSegments on a mesh.
 *
 * @param mesh Content mesh.
 * @returns Decorative edge object, or undefined.
 */
function findDecorativeEdge(mesh: THREE.Mesh): THREE.Object3D | undefined {
  return mesh.children.find((child) => child.userData[DECORATIVE_EDGE_USERDATA_KEY] === true);
}

describe('EditSession', () => {
  it('opens for a content mesh and binds a welded document', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const session = new EditSession();
    expect(session.enter([mesh])).toBe(true);
    expect(session.isActive()).toBe(true);
    expect(session.getComponentMode()).toBe(EditorComponentMode.VERTEX);
    expect(readBoundMeshEditDocument(mesh)).not.toBeNull();
    session.exit();
    expect(session.isActive()).toBe(false);
    expect(readBoundMeshEditDocument(mesh)).toBeNull();
    mesh.geometry.dispose();
  });

  it('hides domain decorative edges while active and restores them on exit', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    rebuildDecorativeEdges(mesh);
    const session = new EditSession();
    session.enter([mesh]);
    const decorativeDuring = findDecorativeEdge(mesh);
    expect(decorativeDuring).toBeTruthy();
    expect(decorativeDuring!.visible).toBe(false);
    expect(isEditModeWireframeSuppressed(decorativeDuring!)).toBe(true);
    session.exit();
    const decorativeAfter = findDecorativeEdge(mesh);
    expect(decorativeAfter).toBeTruthy();
    expect(decorativeAfter!.visible).toBe(true);
    expect(isEditModeWireframeSuppressed(decorativeAfter!)).toBe(false);
    mesh.geometry.dispose();
  });

  it('refuses to open with an empty selection', () => {
    const session = new EditSession();
    expect(session.enter([])).toBe(false);
    expect(session.isActive()).toBe(false);
  });

  it('converts face selection into edges and vertices when the mode changes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const session = new EditSession();
    session.enter([mesh]);
    const document = readBoundMeshEditDocument(mesh);
    expect(document).not.toBeNull();
    if (!document) {
      return;
    }
    const topology = buildComponentTopologyFromMeshDocument(mesh.uuid, document);
    const face = topology.faces[0]!;
    session
      .getComponentSelection()
      .select({ targetId: mesh.uuid, kind: 'face', componentKey: String(face.faceIndex) }, false);
    session.setComponentMode(EditorComponentMode.EDGE, [topology]);
    expect(session.getComponentSelection().getSelectedCount()).toBe(face.edgeKeys.length);
    expect(
      session
        .getComponentSelection()
        .getSelected()
        .every((entry) => entry.kind === 'edge'),
    ).toBe(true);
    session.setComponentMode(EditorComponentMode.VERTEX, [topology]);
    const uniqueVerts = new Set(face.vertexIndices);
    expect(session.getComponentSelection().getSelectedCount()).toBe(uniqueVerts.size);
    expect(
      session
        .getComponentSelection()
        .getSelected()
        .every((entry) => entry.kind === 'vertex'),
    ).toBe(true);
    session.exit();
    mesh.geometry.dispose();
  });
});
