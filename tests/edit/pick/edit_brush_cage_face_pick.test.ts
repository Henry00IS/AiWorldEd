import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CoordinatorEditMode } from '@/edit/coordinator/coordinator_edit_mode.js';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildBrushEditCage } from '@/edit/brush/brush_edit_cage.js';

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

describe('edit brush cage face pick', () => {
  it('selects faces on a subtractive brush with no CSG result geometry', () => {
    const model = new SolidModel('EditSubFace');
    const instance = model.addBoxBrush(2, SolidOperation.Subtractive);
    model.rebuild(true);
    expect(model.getResultMesh().geometry.getAttribute('position')?.count ?? 0).toBe(0);
    const scene = new THREE.Scene();
    scene.add(model.root);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const coordinator = new CoordinatorEditMode({
      getPrimaryScene: () => scene,
      getSelectedObjects: () => [model.root],
      getViewports: () => [
        {
          getContentElement: () => pickElement,
          getCamera: () => camera,
        },
      ],
      showStatusMessage: () => undefined,
    });
    expect(coordinator.enterFromObjectSelection()).toBe(true);
    coordinator.setComponentMode(EditorComponentMode.FACE);
    const cage = buildBrushEditCage(model, instance, `brush:${instance.id}`);
    const faceCenter = findOutwardFaceCenter(cage, new THREE.Vector3(0, 0, 1));
    expect(faceCenter).not.toBeNull();
    const { clientX, clientY } = projectWorldToClient(faceCenter!, camera);
    expect(coordinator.pickAtClientPoint(clientX, clientY, false, false)).toBe(true);
    const selected = coordinator.getSession().getComponentSelection().getSelected();
    expect(selected).toHaveLength(1);
    expect(selected[0]!.kind).toBe('face');
    expect(selected[0]!.targetId).toBe(`brush:${instance.id}`);
    coordinator.dispose();
  });

  it('selects faces on an additive brush even when only the cage is used', () => {
    const model = new SolidModel('EditAddFace');
    const instance = model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const scene = new THREE.Scene();
    scene.add(model.root);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const coordinator = new CoordinatorEditMode({
      getPrimaryScene: () => scene,
      getSelectedObjects: () => [model.root],
      getViewports: () => [
        {
          getContentElement: () => pickElement,
          getCamera: () => camera,
        },
      ],
      showStatusMessage: () => undefined,
    });
    expect(coordinator.enterFromObjectSelection()).toBe(true);
    coordinator.setComponentMode(EditorComponentMode.FACE);
    const cage = buildBrushEditCage(model, instance, `brush:${instance.id}`);
    const faceCenter = findOutwardFaceCenter(cage, new THREE.Vector3(0, 0, 1));
    expect(faceCenter).not.toBeNull();
    const { clientX, clientY } = projectWorldToClient(faceCenter!, camera);
    expect(coordinator.pickAtClientPoint(clientX, clientY, false, false)).toBe(true);
    expect(coordinator.getComponentSelectionCount()).toBe(1);
    coordinator.dispose();
  });
});

/**
 * Finds the center of the cage face whose normal best matches the target.
 *
 * @param cage Brush cage.
 * @param desiredNormal Desired outward normal.
 * @returns Face center, or null.
 */
function findOutwardFaceCenter(
  cage: ReturnType<typeof buildBrushEditCage>,
  desiredNormal: THREE.Vector3,
): THREE.Vector3 | null {
  let bestCenter: THREE.Vector3 | null = null;
  let bestDot = -Infinity;
  for (const face of cage.faces) {
    if (face.vertexIndices.length < 3) {
      continue;
    }
    const a = cage.worldPositions[face.vertexIndices[0]!];
    const b = cage.worldPositions[face.vertexIndices[1]!];
    const c = cage.worldPositions[face.vertexIndices[2]!];
    if (!a || !b || !c) {
      continue;
    }
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const dot = normal.dot(desiredNormal);
    if (dot <= bestDot) {
      continue;
    }
    bestDot = dot;
    const sum = new THREE.Vector3();
    for (const index of face.vertexIndices) {
      sum.add(cage.worldPositions[index]!);
    }
    bestCenter = sum.multiplyScalar(1 / face.vertexIndices.length);
  }
  return bestCenter;
}
