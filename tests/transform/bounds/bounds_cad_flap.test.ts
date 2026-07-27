import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  BOUNDS_HANDLE_IS_EAR_KEY,
  createCadResizeCubeGeometry,
  createCadResizeFlapGeometry,
  quaternionForViewPlaneEar,
} from '../../../src/transform/bounds/bounds_cad_flap.js';
import { BOUNDS_FACE_AXIS_USERDATA_KEY } from '../../../src/transform/bounds/bounds_gizmo.js';
import { Theme } from '../../../src/theme.js';
import { TransformGizmo } from '../../../src/transform/gizmo/transform_gizmo.js';
import { TransformMode } from '../../../src/types/transform_mode.js';
import { BoundsFace } from '../../../src/types/bounds_face.js';

describe('CAD resize ear geometry', () => {
  it('builds a centered stadium (line handle with rounded ends)', () => {
    const geometry = createCadResizeFlapGeometry();
    const positions = geometry.getAttribute('position');
    expect(positions).toBeTruthy();
    expect(positions!.count).toBeGreaterThan(8);
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < positions!.count; i += 1) {
      minX = Math.min(minX, positions!.getX(i));
      maxX = Math.max(maxX, positions!.getX(i));
      minY = Math.min(minY, positions!.getY(i));
      maxY = Math.max(maxY, positions!.getY(i));
    }
    // Longer along X (edge) than thick along Y (outward).
    expect(maxX - minX).toBeGreaterThan(maxY - minY);
    // Centered around the origin (not a one-sided mushroom tab).
    expect((minX + maxX) * 0.5).toBeCloseTo(0, 2);
    expect((minY + maxY) * 0.5).toBeCloseTo(0, 2);
    geometry.dispose();
  });

  it('builds a unit cube for perspective grips', () => {
    const geometry = createCadResizeCubeGeometry();
    expect(geometry).toBeInstanceOf(THREE.BoxGeometry);
    geometry.dispose();
  });

  it('orients top-view ears in the XZ plane for all four sides', () => {
    const faces = [BoundsFace.POS_X, BoundsFace.NEG_X, BoundsFace.POS_Z, BoundsFace.NEG_Z];
    faces.forEach((face) => {
      const quaternion = quaternionForViewPlaneEar(face, 'xz');
      expect(quaternion).not.toBeNull();
      const outward = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion!);
      expect(Math.abs(outward.y)).toBeLessThan(1e-5);
      const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion!);
      expect(Math.abs(planeNormal.y)).toBeGreaterThan(0.99);
    });
    expect(quaternionForViewPlaneEar(BoundsFace.POS_Y, 'xz')).toBeNull();
  });

  it('orients side-view ears in the YZ plane for all four sides', () => {
    const faces = [BoundsFace.POS_Y, BoundsFace.NEG_Y, BoundsFace.POS_Z, BoundsFace.NEG_Z];
    faces.forEach((face) => {
      const quaternion = quaternionForViewPlaneEar(face, 'yz');
      expect(quaternion).not.toBeNull();
      const outward = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion!);
      expect(Math.abs(outward.x)).toBeLessThan(1e-5);
      const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion!);
      expect(Math.abs(planeNormal.x)).toBeGreaterThan(0.99);
    });
    expect(quaternionForViewPlaneEar(BoundsFace.POS_X, 'yz')).toBeNull();
  });
});

describe('orthographic ears and perspective cubes', () => {
  it('hides Y resize grips in top (xz) but keeps Y face picks for body drag', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.updateMatrixWorld(true);
    const gizmo = new TransformGizmo(Theme);
    gizmo.setMode(TransformMode.BOUNDS);
    gizmo.setVisible(true);
    gizmo.updateBoundsFromMeshes([mesh]);
    const topClone = gizmo.getHandleGroupClone('xz');
    const summary = collectHandleSummary(topClone);
    expect(summary.axesVisible.has('y')).toBe(false);
    expect(summary.axesVisible.has('x')).toBe(true);
    expect(summary.axesVisible.has('z')).toBe(true);
    expect(summary.earCount).toBe(4);
    expect(summary.cubeCount).toBe(0);
    expect(countVisibleFacePicks(topClone)).toBe(6);
    expect(countVisibleFacePicksForAxis(topClone, 'y')).toBe(2);
    gizmo.dispose();
  });

  it('hides Z grips in front (xy) clones and styles X/Y as ears', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.updateMatrixWorld(true);
    const gizmo = new TransformGizmo(Theme);
    gizmo.setMode(TransformMode.BOUNDS);
    gizmo.setVisible(true);
    gizmo.updateBoundsFromMeshes([mesh]);
    const frontClone = gizmo.getHandleGroupClone('xy');
    const summary = collectHandleSummary(frontClone);
    expect(summary.axesVisible.has('z')).toBe(false);
    expect(summary.axesVisible.has('x')).toBe(true);
    expect(summary.axesVisible.has('y')).toBe(true);
    expect(summary.earCount).toBe(4);
    expect(countVisibleFacePicks(frontClone)).toBe(6);
    gizmo.dispose();
  });

  it('hides X grips in side (yz) clones and styles Y/Z as ears', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.updateMatrixWorld(true);
    const gizmo = new TransformGizmo(Theme);
    gizmo.setMode(TransformMode.BOUNDS);
    gizmo.setVisible(true);
    gizmo.updateBoundsFromMeshes([mesh]);
    const sideClone = gizmo.getHandleGroupClone('yz');
    const summary = collectHandleSummary(sideClone);
    expect(summary.axesVisible.has('x')).toBe(false);
    expect(summary.axesVisible.has('y')).toBe(true);
    expect(summary.axesVisible.has('z')).toBe(true);
    expect(summary.earCount).toBe(4);
    expect(countVisibleFacePicks(sideClone)).toBe(6);
    gizmo.dispose();
  });

  it('keeps six 3D arrow grips in perspective clones (no ears)', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.updateMatrixWorld(true);
    const gizmo = new TransformGizmo(Theme);
    gizmo.setMode(TransformMode.BOUNDS);
    gizmo.setVisible(true);
    gizmo.updateBoundsFromMeshes([mesh]);
    const perspectiveClone = gizmo.getHandleGroupClone('xyz');
    const summary = collectHandleSummary(perspectiveClone);
    expect(summary.axesVisible.has('x')).toBe(true);
    expect(summary.axesVisible.has('y')).toBe(true);
    expect(summary.axesVisible.has('z')).toBe(true);
    expect(summary.earCount).toBe(0);
    expect(summary.arrowHandleCount).toBe(6);
    expect(gizmo.getHandles()).toHaveLength(6);
    // Pick roots are boxes; arrow stem/cone share handleId for direct picking.
    let pickRoots = 0;
    let arrowPartsWithHandleId = 0;
    perspectiveClone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (typeof child.userData['handleId'] !== 'number') return;
      if (child.userData['boundsCubePick'] === true) {
        pickRoots += 1;
        expect(child.geometry).toBeInstanceOf(THREE.BoxGeometry);
      } else if (child.userData['boundsCubeVisual'] === true) {
        arrowPartsWithHandleId += 1;
      }
    });
    expect(pickRoots).toBe(6);
    expect(arrowPartsWithHandleId).toBeGreaterThan(0);
    gizmo.dispose();
  });

  it('does not mutate shared pick materials when styling 2D ears', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.updateMatrixWorld(true);
    const gizmo = new TransformGizmo(Theme);
    gizmo.setMode(TransformMode.BOUNDS);
    gizmo.setVisible(true);
    gizmo.updateBoundsFromMeshes([mesh]);
    const master = gizmo.getHandleGroup();
    const masterCube = findPickRoot(master, BoundsFace.POS_X);
    expect(masterCube).not.toBeNull();
    const masterMaterial = masterCube!.material as THREE.MeshBasicMaterial;
    expect(masterMaterial.side).toBe(THREE.FrontSide);
    gizmo.getHandleGroupClone('xz');
    expect(masterMaterial.side).toBe(THREE.FrontSide);
    expect(masterCube!.geometry).toBeInstanceOf(THREE.BoxGeometry);
    gizmo.dispose();
  });

  it('offsets ears slightly past the face half-extent', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.updateMatrixWorld(true);
    const gizmo = new TransformGizmo(Theme);
    gizmo.setMode(TransformMode.BOUNDS);
    gizmo.setVisible(true);
    gizmo.updateBoundsFromMeshes([mesh]);
    const topClone = gizmo.getHandleGroupClone('xz');
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    gizmo.prepareBoundsCloneForCamera(topClone, camera, 'xz', 512);
    const posX = findVisibleHandle(topClone, BoundsFace.POS_X);
    expect(posX).not.toBeNull();
    // Half extent is 1; ear sits beyond the face with a positive gap.
    expect(posX!.position.x).toBeGreaterThan(1);
    gizmo.dispose();
  });
});

/** Summary of visible bounds handles under a viewport clone. */
interface HandleSummary {
  axesVisible: Set<'x' | 'y' | 'z'>;
  earCount: number;
  cubeCount: number;
  arrowHandleCount: number;
}

/**
 * Collects visibility and geometry style of bounds_handle meshes.
 *
 * @param root Viewport gizmo clone.
 * @returns Summary of visible grips.
 */
function collectHandleSummary(root: THREE.Object3D): HandleSummary {
  const axesVisible = new Set<'x' | 'y' | 'z'>();
  let earCount = 0;
  let cubeCount = 0;
  let arrowHandleCount = 0;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) return;
    if (typeof child.userData['handleId'] !== 'number') return;
    const axis = child.userData[BOUNDS_FACE_AXIS_USERDATA_KEY] as 'x' | 'y' | 'z' | undefined;
    if (axis) axesVisible.add(axis);
    if (child.userData[BOUNDS_HANDLE_IS_EAR_KEY] === true) {
      earCount += 1;
    } else if (child.userData['boundsCubePick'] === true) {
      arrowHandleCount += 1;
      if (child.geometry instanceof THREE.BoxGeometry) cubeCount += 1;
    }
  });
  return { axesVisible, earCount, cubeCount, arrowHandleCount };
}

/**
 * Counts visible face pick planes under a gizmo root.
 *
 * @param root Gizmo root.
 * @returns Number of visible face pick meshes.
 */
function countVisibleFacePicks(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) return;
    if (child.userData['isBoundsFacePick'] === true) count += 1;
  });
  return count;
}

/**
 * Counts visible face pick planes on a given axis.
 *
 * @param root Gizmo root.
 * @param axis Axis letter.
 * @returns Count of matching visible face picks.
 */
function countVisibleFacePicksForAxis(root: THREE.Object3D, axis: 'x' | 'y' | 'z'): number {
  let count = 0;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) return;
    if (child.userData['isBoundsFacePick'] !== true) return;
    const face = child.userData['boundsFace'] as BoundsFace | undefined;
    if (!face) return;
    if (axis === 'x' && (face === BoundsFace.POS_X || face === BoundsFace.NEG_X)) count += 1;
    if (axis === 'y' && (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y)) count += 1;
    if (axis === 'z' && (face === BoundsFace.POS_Z || face === BoundsFace.NEG_Z)) count += 1;
  });
  return count;
}

/**
 * Finds a visible handle mesh for a given face under a clone.
 *
 * @param root Viewport gizmo clone.
 * @param face Bounds face to find.
 * @returns Handle mesh, or null.
 */
function findVisibleHandle(root: THREE.Object3D, face: BoundsFace): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) return;
    if (child.userData['boundsFace'] !== face) return;
    if (typeof child.userData['handleId'] !== 'number') return;
    found = child;
  });
  return found;
}

/**
 * Finds the invisible pick-root mesh for a face (not stem/cone children).
 *
 * @param root Gizmo root.
 * @param face Bounds face.
 * @returns Pick mesh, or null.
 */
function findPickRoot(root: THREE.Object3D, face: BoundsFace): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) return;
    if (child.userData['boundsFace'] !== face) return;
    if (child.userData['boundsCubePick'] !== true) return;
    found = child;
  });
  return found;
}
