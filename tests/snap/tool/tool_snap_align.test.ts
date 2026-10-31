import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Tool } from '@/editor/tools/tool.js';

/** Concrete parent so a single-use tool can return to it. */
class ParentTool extends Tool {}
import type { EditorWindow } from '@/editor/window/editor_window.js';
import { SOLID_BRUSH_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { SnapPolicy } from '@/snap/policy/snap_policy.js';
import type { SnapAlignHost } from '@/snap/tool/snap_align_host.js';
import { collectBrushPreviewMeshes, publishSnapAlignBrushPoses } from '@/snap/tool/snap_align_brush_meshes.js';
import { applySnapFaceAlign, applySnapFaceSeat } from '@/snap/tool/snap_face_pose_apply.js';
import type { SnapFaceSample } from '@/snap/tool/snap_face_sample.js';
import { ToolFaceAlign } from '@/snap/tool/tool_face_align.js';
import { ToolFaceSeat } from '@/snap/tool/tool_face_seat.js';
import { ToolHingeAlign } from '@/snap/tool/tool_hinge_align.js';

/**
 * Builds a face sample on a mesh.
 *
 * @param mesh Mesh that owns the face.
 * @param normal Outward normal.
 * @param centroid Face centroid.
 * @param point Point on the plane.
 * @param corners Corners that decide a seat. Defaults to the centroid.
 * @returns Face sample.
 */
function faceSample(
  mesh: THREE.Mesh,
  normal: THREE.Vector3,
  centroid: THREE.Vector3,
  point: THREE.Vector3,
  corners: readonly THREE.Vector3[] = [centroid],
): SnapFaceSample {
  return {
    mesh,
    root: mesh,
    faceIndex: 0,
    normal,
    centroid,
    tangent: new THREE.Vector3(1, 0, 0),
    point,
    corners,
  };
}

describe('face align and seat poses', () => {
  it('turns the source normal toward the inverse target and keeps the centroid', () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    const centroid = new THREE.Vector3(0, 2, 0);
    const source = faceSample(mesh, new THREE.Vector3(0, 1, 0), centroid, centroid.clone());
    const target = faceSample(
      new THREE.Mesh(),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    );
    const startQuaternion = mesh.quaternion.clone();
    applySnapFaceAlign(mesh, mesh.position.clone(), startQuaternion, source, target);
    const turned = source.normal
      .clone()
      .applyQuaternion(mesh.quaternion.clone().multiply(startQuaternion.clone().invert()));
    expect(turned.distanceTo(new THREE.Vector3(0, -1, 0))).toBeLessThan(1e-4);
    const worldCentroid = centroid.clone().applyMatrix4(mesh.matrixWorld);
    expect(worldCentroid.distanceTo(centroid)).toBeLessThan(1e-4);
  });

  it('slides the centroid onto the target plane and leaves orientation unchanged', () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    const startQuaternion = mesh.quaternion.clone();
    const centroid = new THREE.Vector3(1, 3, -2);
    const source = faceSample(mesh, new THREE.Vector3(0, 1, 0), centroid, centroid.clone());
    const targetPoint = new THREE.Vector3(4, 0, 1);
    const target = faceSample(new THREE.Mesh(), new THREE.Vector3(0, 1, 0), targetPoint, targetPoint.clone());
    applySnapFaceSeat(mesh, mesh.position.clone(), startQuaternion, source, target);
    expect(mesh.quaternion.angleTo(startQuaternion)).toBeLessThan(1e-6);
    const seated = centroid.clone().applyMatrix4(mesh.matrixWorld);
    expect(Math.abs(seated.y - targetPoint.y)).toBeLessThan(1e-4);
    expect(seated.x).toBeCloseTo(centroid.x);
    expect(seated.z).toBeCloseTo(centroid.z);
  });

  it('seats the nearest corner of a tilted face and leaves the others on the starting side', () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    const startQuaternion = mesh.quaternion.clone();
    const planePoint = new THREE.Vector3();
    const planeNormal = new THREE.Vector3(0, 1, 0);
    const nearest = new THREE.Vector3(0.2, 1, -0.4);
    const mid = new THREE.Vector3(1.5, 2.5, 0.3);
    const far = new THREE.Vector3(-1, 4, 1);
    const centroid = nearest
      .clone()
      .add(mid)
      .add(far)
      .multiplyScalar(1 / 3);
    const corners = [nearest, mid, far];
    const source = faceSample(mesh, planeNormal, centroid, nearest.clone(), corners);
    const target = faceSample(new THREE.Mesh(), planeNormal, planePoint, planePoint.clone());
    applySnapFaceSeat(mesh, mesh.position.clone(), startQuaternion, source, target);
    expect(mesh.quaternion.angleTo(startQuaternion)).toBeLessThan(1e-6);
    expectSeatedCorners(corners, mesh, planePoint, planeNormal);
  });
});

describe('brush pose publish', () => {
  it('asks the host to finalize brush preview meshes and skips content meshes', () => {
    const brush = new THREE.Mesh();
    brush.userData[SOLID_BRUSH_USERDATA_KEY] = true;
    const content = new THREE.Mesh();
    const group = new THREE.Group();
    group.add(brush);
    group.add(content);
    const committed: THREE.Mesh[][] = [];
    const host = {
      notifySolidTransformsLive: () => undefined,
      notifySolidTransformsCommitted: (meshes: readonly THREE.Mesh[]) => {
        committed.push([...meshes]);
      },
    } as unknown as SnapAlignHost;
    publishSnapAlignBrushPoses(host, [group, content], 'commit');
    expect(committed).toHaveLength(1);
    expect(committed[0]).toEqual([brush]);
    expect(collectBrushPreviewMeshes([content])).toEqual([]);
  });
});

describe('single-use align tools', () => {
  it('stays busy until Escape returns to the parent tool', () => {
    const parent = new ParentTool();
    const tools = [new ToolFaceAlign(), new ToolFaceSeat(), new ToolHingeAlign()];
    for (const tool of tools) {
      const switched: Tool[] = [];
      const chrome: string[] = [];
      tool.parent = parent;
      tool.editor = editorWithHost(switched, chrome);
      tool.onActivate();
      expect(tool.isBusy()).toBe(true);
      expect(chrome[0]).toBe(expectedChrome(tool));
      expect(tool.onKeyDown('Escape')).toBe(true);
      expect(tool.isBusy()).toBe(false);
      expect(switched[0]).toBe(parent);
      expect(chrome[1]).toBe('end');
    }
  });
});

/**
 * Builds an editor stub whose align host can arm a session.
 *
 * @param switched Tools passed to switchTool.
 * @returns Editor stub.
 */
function editorWithHost(switched: Tool[], chrome: string[]): EditorWindow {
  const host: SnapAlignHost = {
    worldObject: new THREE.Group(),
    commandStack: null,
    getViewports: () => [],
    getPrimaryScene: () => new THREE.Scene(),
    getSelectedRoots: () => [],
    showStatusMessage: () => undefined,
    notifySolidTransformsLive: () => undefined,
    notifySolidTransformsCommitted: () => undefined,
    basePolicy: new SnapPolicy(),
    beginAlignChrome: (which) => {
      chrome.push(which);
    },
    endAlignChrome: () => {
      chrome.push('end');
    },
  };
  return {
    lastPointerClientX: 0,
    lastPointerClientY: 0,
    lastPointerOwnerDocument: null,
    getServices: () => ({
      getSnapAlignHost: () => host,
      setStatusMessage: () => undefined,
    }),
    switchTool: (next: Tool) => {
      switched.push(next);
    },
  } as unknown as EditorWindow;
}

/**
 * Chrome id opened by a single-use align tool.
 *
 * @param tool Armed tool.
 * @returns Chrome id.
 */
function expectedChrome(tool: Tool): string {
  if (tool instanceof ToolFaceSeat) {
    return 'seat';
  }
  if (tool instanceof ToolHingeAlign) {
    return 'hinge';
  }
  return 'align';
}

/**
 * Checks seated corners touch the plane and stay on its front side.
 *
 * @param corners Corners before the seat.
 * @param mesh Mesh that moved.
 * @param planePoint Point on the target plane.
 * @param planeNormal Target normal.
 */
function expectSeatedCorners(
  corners: readonly THREE.Vector3[],
  mesh: THREE.Object3D,
  planePoint: THREE.Vector3,
  planeNormal: THREE.Vector3,
): void {
  mesh.updateMatrixWorld(true);
  const unit = planeNormal.clone().normalize();
  const distances = corners.map((corner) => signedPlaneDistance(corner, mesh, planePoint, unit));
  expect(Math.min(...distances)).toBeCloseTo(0, 4);
  for (const distance of distances) {
    expect(distance).toBeGreaterThanOrEqual(-1e-5);
  }
}

/**
 * Returns the signed distance of a moved corner from a plane.
 *
 * @param corner Corner before the seat.
 * @param mesh Mesh that moved.
 * @param planePoint Point on the target plane.
 * @param unitNormal Unit target normal.
 * @returns Signed distance.
 */
function signedPlaneDistance(
  corner: THREE.Vector3,
  mesh: THREE.Object3D,
  planePoint: THREE.Vector3,
  unitNormal: THREE.Vector3,
): number {
  return corner.clone().applyMatrix4(mesh.matrixWorld).sub(planePoint).dot(unitNormal);
}
