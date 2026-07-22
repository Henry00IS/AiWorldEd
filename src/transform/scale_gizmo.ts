import * as THREE from 'three';
import { Theme } from '../theme.js';
import { GizmoAxis } from '../types/transform_mode.js';
import { GizmoHandle } from './gizmo_handle.js';
import {
  GizmoVisualStyle,
  applyGizmoFrontRenderOrder,
  createGizmoFrontMaterial,
  createGizmoOccludedMesh
} from './gizmo_visual_style.js';

/**
 * Data stored alongside each scale handle for proper scene management.
 */
interface ScaleData {
  group: THREE.Group;
  tipMesh: THREE.Mesh;
  lineMesh: THREE.Mesh;
}

/**
 * Creates the scale transform gizmo with stem and box tip for each axis.
 * Uses the same stem thickness and depth-aware materials as Move/Rotate.
 */
export class ScaleGizmo {
  private theme: typeof Theme;
  private handles: GizmoHandle[];
  private scaleData: ScaleData[];

  /**
   * Creates a new scale gizmo builder.
   * @param theme The theme containing gizmo color definitions.
   */
  constructor(theme: typeof Theme) {
    this.theme = theme;
    this.handles = [];
    this.scaleData = [];
  }

  /**
   * Creates all 3 scale handles and returns them.
   * @returns An array of GizmoHandle instances for X, Y, Z axes.
   */
  createHandles(): GizmoHandle[] {
    this.handles = [];
    this.scaleData = [];
    this.createScaleHandle(GizmoAxis.X, this.theme.gizmoXAxisColor, new THREE.Vector3(1, 0, 0));
    this.createScaleHandle(GizmoAxis.Y, this.theme.gizmoYAxisColor, new THREE.Vector3(0, 1, 0));
    this.createScaleHandle(GizmoAxis.Z, this.theme.gizmoZAxisColor, new THREE.Vector3(0, 0, 1));
    return this.handles;
  }

  /**
   * Returns all scene objects that need to be added to the gizmo group.
   * @returns An array of all Three.js objects created by this gizmo.
   */
  getAllSceneObjects(): THREE.Object3D[] {
    const objects: THREE.Object3D[] = [];
    this.scaleData.forEach((data) => objects.push(data.group));
    return objects;
  }

  /**
   * Disposes all geometries and materials created by this gizmo.
   */
  dispose(): void {
    this.scaleData.forEach((data) => this.disposeObject3D(data.group));
    this.scaleData = [];
    this.handles = [];
  }

  /**
   * Creates a single scale handle with a stem and box tip.
   * @param axis The gizmo axis for this handle.
   * @param color The hex color of the handle.
   * @param direction The unit direction vector for the handle orientation.
   */
  private createScaleHandle(axis: GizmoAxis, color: number, direction: THREE.Vector3): void {
    const group = new THREE.Group();
    const lineGeometry = new THREE.CylinderGeometry(
      GizmoVisualStyle.stemRadius,
      GizmoVisualStyle.stemRadius,
      GizmoVisualStyle.scaleStemLength,
      8
    );
    const tipSize = GizmoVisualStyle.scaleTipSize;
    const tipGeometry = new THREE.BoxGeometry(tipSize, tipSize, tipSize);
    const lineMesh = this.createFrontMesh(lineGeometry, color);
    lineMesh.position.set(0, GizmoVisualStyle.scaleStemLength * 0.5, 0);
    const tipMesh = this.createFrontMesh(tipGeometry, color);
    tipMesh.position.set(0, GizmoVisualStyle.scaleStemLength, 0);
    const handle = new GizmoHandle(axis, color, tipMesh);
    const handleId = handle.getHandleId();
    this.tagHandleId(lineMesh, handleId);
    this.tagHandleId(tipMesh, handleId);
    this.addOccludedPair(group, lineGeometry, color, handleId, lineMesh.position);
    this.addOccludedPair(group, tipGeometry, color, handleId, tipMesh.position);
    group.add(lineMesh);
    group.add(tipMesh);
    this.alignGroupToDirection(group, direction);
    this.scaleData.push({ group, tipMesh, lineMesh });
    this.handles.push(handle);
  }

  /**
   * Creates a front-facing gizmo mesh with shared styling.
   * @param geometry Mesh geometry.
   * @param color Hex color.
   * @returns Configured front mesh.
   */
  private createFrontMesh(
    geometry: THREE.BufferGeometry,
    color: number
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, createGizmoFrontMaterial(color));
    applyGizmoFrontRenderOrder(mesh);
    return mesh;
  }

  /**
   * Adds an occluded ghost mesh at the same local position as a front part.
   * @param group Parent group.
   * @param geometry Shared geometry.
   * @param color Hex color.
   * @param handleId Shared handle id.
   * @param position Local position to copy.
   */
  private addOccludedPair(
    group: THREE.Group,
    geometry: THREE.BufferGeometry,
    color: number,
    handleId: number,
    position: THREE.Vector3
  ): void {
    const ghost = createGizmoOccludedMesh(geometry, color, handleId);
    ghost.position.copy(position);
    group.add(ghost);
  }

  /**
   * Stores the handle id on a mesh for raycast matching.
   * @param mesh The mesh to tag.
   * @param handleId The handle identifier.
   */
  private tagHandleId(mesh: THREE.Mesh, handleId: number): void {
    mesh.userData.handleId = handleId;
  }

  /**
   * Aligns a group so its local Y axis points along the given direction.
   * @param group The group to rotate.
   * @param direction The target direction vector.
   */
  private alignGroupToDirection(group: THREE.Group, direction: THREE.Vector3): void {
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(up, direction.clone().normalize());
    group.quaternion.copy(quaternion);
  }

  /**
   * Recursively disposes all geometries and materials of an object.
   * @param obj The object to dispose.
   */
  private disposeObject3D(obj: THREE.Object3D): void {
    if (obj instanceof THREE.Mesh) {
      this.disposeMesh(obj);
    }
    obj.children.forEach((child) => this.disposeObject3D(child));
  }

  /**
   * Disposes the geometry and material of a single mesh.
   * @param mesh The mesh to dispose.
   */
  private disposeMesh(mesh: THREE.Mesh): void {
    if (mesh.geometry && !mesh.userData.geometryDisposed) {
      mesh.geometry.dispose();
      mesh.userData.geometryDisposed = true;
    }
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  }
}
