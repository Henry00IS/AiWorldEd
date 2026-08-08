import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { buildBrushEditCage } from '@/edit/brush/brush_edit_cage.js';
import { pickComponentBrushCageFace } from '@/edit/pick/raycaster_component_brush_cage_face.js';

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

describe('pickComponentBrushCageFace', () => {
  it('picks a front face on a subtractive brush cage with empty CSG result', () => {
    const model = new SolidModel('CageFaceSub');
    const instance = model.addBoxBrush(2, SolidOperation.Subtractive);
    model.rebuild(true);
    expect(model.getResultMesh().geometry.getAttribute('position')?.count ?? 0).toBe(0);
    const cage = buildBrushEditCage(model, instance, `brush:${instance.id}`);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const faceCenter = findFaceCenterFacingCamera(cage, camera);
    expect(faceCenter).not.toBeNull();
    const { clientX, clientY } = projectWorldToClient(faceCenter!, camera);
    const hit = pickComponentBrushCageFace({ clientX, clientY } as MouseEvent, camera, pickElement, [cage]);
    expect(hit).not.toBeNull();
    expect(hit!.targetId).toBe(`brush:${instance.id}`);
    expect(hit!.faceIndex).toBeGreaterThanOrEqual(0);
    expect(hit!.faceIndex).toBeLessThan(cage.faces.length);
  });

  it('returns null when the pointer misses every cage face', () => {
    const model = new SolidModel('CageFaceMiss');
    const instance = model.addBoxBrush(2, SolidOperation.Additive);
    const cage = buildBrushEditCage(model, instance, `brush:${instance.id}`);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const hit = pickComponentBrushCageFace({ clientX: 0, clientY: 0 } as MouseEvent, camera, pickElement, [cage]);
    expect(hit).toBeNull();
  });
});

/**
 * Finds the world center of the cage face whose normal faces the camera best.
 *
 * @param cage Brush cage.
 * @param camera Camera.
 * @returns Face center, or null when no face is available.
 */
function findFaceCenterFacingCamera(
  cage: ReturnType<typeof buildBrushEditCage>,
  camera: THREE.Camera,
): THREE.Vector3 | null {
  let bestCenter: THREE.Vector3 | null = null;
  let bestDot = -Infinity;
  const view = new THREE.Vector3().subVectors(camera.position, new THREE.Vector3()).normalize();
  for (const face of cage.faces) {
    const center = averageFaceVertices(cage, face.vertexIndices);
    const normal = computeFaceNormal(cage, face.vertexIndices);
    if (!center || !normal) {
      continue;
    }
    const dot = normal.dot(view);
    if (dot <= bestDot) {
      continue;
    }
    bestDot = dot;
    bestCenter = center;
  }
  return bestCenter;
}

/**
 * Averages world vertices of a face loop.
 *
 * @param cage Brush cage.
 * @param vertexIndices Face vertex indices.
 * @returns Average point, or null.
 */
function averageFaceVertices(
  cage: ReturnType<typeof buildBrushEditCage>,
  vertexIndices: readonly number[],
): THREE.Vector3 | null {
  if (vertexIndices.length === 0) {
    return null;
  }
  const sum = new THREE.Vector3();
  let count = 0;
  for (const index of vertexIndices) {
    const point = cage.worldPositions[index];
    if (!point) {
      continue;
    }
    sum.add(point);
    count += 1;
  }
  if (count === 0) {
    return null;
  }
  return sum.multiplyScalar(1 / count);
}

/**
 * Computes a unit normal for a face loop from the first three vertices.
 *
 * @param cage Brush cage.
 * @param vertexIndices Face vertex indices.
 * @returns Unit normal, or null.
 */
function computeFaceNormal(
  cage: ReturnType<typeof buildBrushEditCage>,
  vertexIndices: readonly number[],
): THREE.Vector3 | null {
  if (vertexIndices.length < 3) {
    return null;
  }
  const a = cage.worldPositions[vertexIndices[0]!];
  const b = cage.worldPositions[vertexIndices[1]!];
  const c = cage.worldPositions[vertexIndices[2]!];
  if (!a || !b || !c) {
    return null;
  }
  return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
}
