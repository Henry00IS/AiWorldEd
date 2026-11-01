import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { ManagerFaceSelection } from '@/selection/face/manager_face_selection.js';
import { faceSelectionClaimAdmission } from '@/selection/face/face_selection_claim.js';
import { selectionCoversObjects } from '@/selection/object/selection_object_cover.js';

/**
 * Builds a box mesh under a group.
 *
 * @returns Group and mesh.
 */
function groupedBox(): { group: THREE.Group; mesh: THREE.Mesh } {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  group.add(mesh);
  return { group, mesh };
}

describe('selection cover', () => {
  it('counts an object as covered when it or an ancestor is selected', () => {
    const { group, mesh } = groupedBox();
    const selection = new ManagerSelection();
    expect(selectionCoversObjects(selection, [mesh])).toBe(false);
    selection.setSelection([mesh], [group]);
    expect(selectionCoversObjects(selection, [mesh, group])).toBe(true);
  });
});

describe('face selection claim in a room', () => {
  it('admits every pick offline without touching the object selection', () => {
    const { mesh } = groupedBox();
    const selection = new ManagerSelection();
    const faces = new ManagerFaceSelection();
    faces.setAdmission(faceSelectionClaimAdmission(selection));
    faces.selectFace(mesh, 0, false, false);
    expect(faces.getSelectedFaceCount()).toBe(1);
    expect(selection.getAllSelectedObjectsAsArray()).toEqual([]);
  });

  it('selects the owning mesh so the room takes its lock', () => {
    const { mesh } = groupedBox();
    const selection = new ManagerSelection();
    selection.selectionAdmissionSet(() => true);
    const faces = new ManagerFaceSelection();
    faces.setAdmission(faceSelectionClaimAdmission(selection));
    faces.selectFace(mesh, 0, false, false);
    expect(faces.getSelectedFaceCount()).toBe(1);
    expect(selection.getAllSelectedObjectsAsArray()).toEqual([mesh]);
  });

  it('leaves the face selection unchanged when another member holds the mesh', () => {
    const { mesh } = groupedBox();
    const selection = new ManagerSelection();
    selection.selectionAdmissionSet(() => false);
    const faces = new ManagerFaceSelection();
    faces.setAdmission(faceSelectionClaimAdmission(selection));
    faces.selectFace(mesh, 0, false, false);
    faces.selectFaceSeeds([{ mesh, faceIndex: 0 }], true);
    expect(faces.getSelectedFaceCount()).toBe(0);
    expect(selection.getAllSelectedObjectsAsArray()).toEqual([]);
  });
});
