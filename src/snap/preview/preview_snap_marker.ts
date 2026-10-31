import * as THREE from 'three';
import { Theme } from '@/theme.js';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import { snapPixelRadiusToWorld } from '@/snap/query/snap_screen_project.js';

/**
 * Small orange marker drawn at the active geometry snap hit. Vertex, edge, and
 * face hits use different shapes. The marker does not participate in picking.
 */
export class PreviewSnapMarker {
  private readonly root: THREE.Group;
  private readonly vertexMarker: THREE.Mesh;
  private readonly edgeMarker: THREE.Line;
  private readonly faceMarker: THREE.LineSegments;
  private parent: THREE.Object3D | null;

  /** Creates the marker meshes. They are hidden until a hit is shown. */
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'snap-marker';
    this.root.renderOrder = 1000;
    this.vertexMarker = createVertexMarker();
    this.edgeMarker = createEdgeMarker();
    this.faceMarker = createFaceMarker();
    this.root.add(this.vertexMarker, this.edgeMarker, this.faceMarker);
    disableMarkerRaycast(this.root);
    this.parent = null;
    this.root.visible = false;
  }

  /**
   * Parents the marker under a scene object that is not part of the saved
   * world.
   *
   * @param parent Scene or overlay parent.
   */
  attach(parent: THREE.Object3D): void {
    if (this.parent === parent) {
      return;
    }
    this.detach();
    this.parent = parent;
    parent.add(this.root);
  }

  /**
   * Shows the marker for a hit and scales it to a constant screen size.
   *
   * @param hit Winning snap hit.
   * @param camera Camera used for screen scale.
   * @param viewportHeight Viewport height in CSS pixels.
   */
  show(hit: SnapHit, camera: THREE.Camera, viewportHeight: number): void {
    this.root.visible = true;
    this.root.position.copy(hit.point);
    this.applyScreenScale(hit.point, camera, viewportHeight);
    this.showKind(hit);
  }

  /** Hides the marker without detaching it. */
  hide(): void {
    this.root.visible = false;
  }

  /** Removes the marker from its parent and releases geometries. */
  dispose(): void {
    this.detach();
    disposeMarkerObject(this.vertexMarker);
    disposeMarkerObject(this.edgeMarker);
    disposeMarkerObject(this.faceMarker);
  }

  /**
   * Scales the marker so it stays about ten pixels wide.
   *
   * @param point Marker world position.
   * @param camera Camera.
   * @param viewportHeight Viewport height.
   */
  private applyScreenScale(point: THREE.Vector3, camera: THREE.Camera, viewportHeight: number): void {
    const distance = camera.position.distanceTo(point);
    const scale = snapPixelRadiusToWorld(camera, Math.max(distance, 0.001), 10, viewportHeight);
    this.root.scale.setScalar(Math.max(scale, 1e-4));
  }

  /**
   * Shows the shape that matches the hit kind and aims it at the hit normal.
   *
   * @param hit Winning snap hit.
   */
  private showKind(hit: SnapHit): void {
    this.vertexMarker.visible = hit.kind === 'vertex';
    this.edgeMarker.visible = hit.kind === 'edge';
    this.faceMarker.visible = hit.kind === 'face';
    orientMarkerToHit(this.root, hit);
  }

  /** Removes the marker from its current parent. */
  private detach(): void {
    this.parent?.remove(this.root);
    this.parent = null;
  }
}

/**
 * Builds the vertex square.
 *
 * @returns Marker mesh.
 */
function createVertexMarker(): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ color: Theme.selectionColor, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.renderOrder = 1000;
  return mesh;
}

/**
 * Builds the edge tick.
 *
 * @returns Marker line.
 */
function createEdgeMarker(): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)]);
  const material = new THREE.LineBasicMaterial({ color: Theme.selectionColor, depthTest: false });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 1000;
  return line;
}

/**
 * Builds the face cross.
 *
 * @returns Marker line segments.
 */
function createFaceMarker(): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0, 1),
  ]);
  const material = new THREE.LineBasicMaterial({ color: Theme.selectionColor, depthTest: false });
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 1000;
  return lines;
}

/**
 * Stops raycasters from hitting the marker.
 *
 * @param root Marker root.
 */
function disableMarkerRaycast(root: THREE.Object3D): void {
  root.traverse((child) => {
    child.raycast = () => undefined;
    child.userData['snapMarker'] = true;
  });
}

/**
 * Aims the marker using the hit normal when one exists.
 *
 * @param root Marker root.
 * @param hit Winning snap hit.
 */
function orientMarkerToHit(root: THREE.Object3D, hit: SnapHit): void {
  if (hit.normal.lengthSq() < 1e-8) {
    root.quaternion.identity();
    return;
  }
  const direction = hit.kind === 'edge' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  root.quaternion.setFromUnitVectors(direction, hit.normal.clone().normalize());
}

/**
 * Disposes one marker's geometry and material.
 *
 * @param object Marker object.
 */
function disposeMarkerObject(object: THREE.Object3D): void {
  const withGeometry = object as THREE.Mesh;
  withGeometry.geometry?.dispose();
  const material = withGeometry.material;
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }
  material?.dispose();
}
