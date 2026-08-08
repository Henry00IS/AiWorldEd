import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CoordinatorEditMode } from '@/edit/coordinator/coordinator_edit_mode.js';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { ensureMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import { meshTopologyFaceVertexIndices } from '@/mesh/topology/mesh_topology_query.js';
import { pickComponentMeshDocumentFace } from '@/edit/pick/raycaster_component_mesh_document_face.js';

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

describe('edit mesh document face pick', () => {
  it('selects the MeshDocument face under the pointer on a dense sphere', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), new THREE.MeshBasicMaterial());
    const document = ensureMeshEditDocument(mesh);
    expect(document).toBeTruthy();
    if (!document) {
      return;
    }
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const hitPoint = new THREE.Vector3(0, 0, 0.5);
    const { clientX, clientY } = projectWorldToClient(hitPoint, camera);
    const hit = pickComponentMeshDocumentFace({ clientX, clientY } as MouseEvent, camera, pickElement, [
      { targetId: mesh.uuid, mesh, document },
    ]);
    expect(hit).not.toBeNull();
    expect(isPointNearDocumentFace(document, hit!.faceIndex, hitPoint)).toBe(true);
  });

  it('selects the clicked sphere face through CoordinatorEditMode', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), new THREE.MeshBasicMaterial());
    const scene = new THREE.Scene();
    scene.add(mesh);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
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
    });
    expect(coordinator.enterFromObjectSelection()).toBe(true);
    coordinator.setComponentMode(EditorComponentMode.FACE);
    const document = ensureMeshEditDocument(mesh);
    expect(document).toBeTruthy();
    if (!document) {
      coordinator.dispose();
      return;
    }
    const samples = [new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0.35, 0, 0.35), new THREE.Vector3(0, 0.35, 0.35)];
    for (const sample of samples) {
      const { clientX, clientY } = projectWorldToClient(sample, camera);
      const expected = pickComponentMeshDocumentFace({ clientX, clientY } as MouseEvent, camera, pickElement, [
        { targetId: mesh.uuid, mesh, document },
      ]);
      expect(expected).not.toBeNull();
      expect(coordinator.pickAtClientPoint(clientX, clientY, false, false)).toBe(true);
      const selected = coordinator.getSession().getComponentSelection().getSelected();
      expect(selected).toHaveLength(1);
      expect(selected[0]!.kind).toBe('face');
      expect(selected[0]!.componentKey).toBe(String(expected!.faceIndex));
      expect(isPointNearDocumentFace(document, expected!.faceIndex, expected!.hitPoint)).toBe(true);
    }
    coordinator.dispose();
  });

  it('picks a front face on a welded box without inventing coplanar merges', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const document = ensureMeshEditDocument(mesh);
    expect(document).toBeTruthy();
    if (!document) {
      return;
    }
    expect(document.getTopology().getFaceCount()).toBe(12);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 4);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const { clientX, clientY } = projectWorldToClient(new THREE.Vector3(0, 0, 0.5), camera);
    const hit = pickComponentMeshDocumentFace({ clientX, clientY } as MouseEvent, camera, pickElement, [
      { targetId: mesh.uuid, mesh, document },
    ]);
    expect(hit).not.toBeNull();
    expect(isPointNearDocumentFace(document, hit!.faceIndex, new THREE.Vector3(0, 0, 0.5))).toBe(true);
  });
});

/**
 * Returns whether a local point lies near a MeshDocument face plane and
 * polygon.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @param point Local-space point.
 * @returns True when the point is on the face.
 */
function isPointNearDocumentFace(
  document: import('@/mesh/document/mesh_document.js').MeshDocument,
  faceIndex: number,
  point: THREE.Vector3,
): boolean {
  const verts = meshTopologyFaceVertexIndices(document.getTopology(), faceIndex).map((vertexIndex) => {
    const positions = document.getTopology().getPositions();
    const base = vertexIndex * 3;
    return new THREE.Vector3(positions[base]!, positions[base + 1]!, positions[base + 2]!);
  });
  if (verts.length < 3) {
    return false;
  }
  const normal = new THREE.Vector3()
    .subVectors(verts[1]!, verts[0]!)
    .cross(new THREE.Vector3().subVectors(verts[2]!, verts[0]!))
    .normalize();
  if (Math.abs(normal.dot(new THREE.Vector3().subVectors(point, verts[0]!))) > 0.05) {
    return false;
  }
  const closest = closestPointOnFaceLoop(verts, point);
  return closest.distanceTo(point) < 0.08;
}

/**
 * Finds the closest point on a face loop to a query point.
 *
 * @param verts Face corners.
 * @param point Query point.
 * @returns Closest point on the fan triangulation.
 */
function closestPointOnFaceLoop(verts: readonly THREE.Vector3[], point: THREE.Vector3): THREE.Vector3 {
  let best = verts[0]!.clone();
  let bestDistance = best.distanceTo(point);
  const origin = verts[0]!;
  for (let index = 1; index < verts.length - 1; index++) {
    const mid = verts[index]!;
    const last = verts[index + 1]!;
    const candidate = closestPointOnTriangle(origin, mid, last, point);
    const distance = candidate.distanceTo(point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/**
 * Finds the closest point on a triangle to a query point.
 *
 * @param a Triangle corner A.
 * @param b Triangle corner B.
 * @param c Triangle corner C.
 * @param point Query point.
 * @returns Closest point on the triangle.
 */
function closestPointOnTriangle(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  point: THREE.Vector3,
): THREE.Vector3 {
  const result = new THREE.Vector3();
  new THREE.Triangle(a, b, c).closestPointToPoint(point, result);
  return result;
}
