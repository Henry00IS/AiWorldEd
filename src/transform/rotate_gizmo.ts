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
 * Creates the rotate transform gizmo with thin torus rings for each axis.
 * Front-facing ring segments stay solid; segments behind geometry draw faint.
 * Produces 3 handles: X, Y, Z ring handles.
 */
export class RotateGizmo {
  private theme: typeof Theme;
  private handles: GizmoHandle[];
  private ringGroups: THREE.Group[];

  /**
   * Creates a new rotate gizmo builder.
   * @param theme The theme containing gizmo color definitions.
   */
  constructor(theme: typeof Theme) {
    this.theme = theme;
    this.handles = [];
    this.ringGroups = [];
  }

  /**
   * Creates all 3 rotate handles and returns them.
   * @returns An array of GizmoHandle instances for X, Y, Z axes.
   */
  createHandles(): GizmoHandle[] {
    this.handles = [];
    this.ringGroups = [];
    this.createRing(GizmoAxis.X, this.theme.gizmoXAxisColor, new THREE.Vector3(1, 0, 0));
    this.createRing(GizmoAxis.Y, this.theme.gizmoYAxisColor, new THREE.Vector3(0, 1, 0));
    this.createRing(GizmoAxis.Z, this.theme.gizmoZAxisColor, new THREE.Vector3(0, 0, 1));
    return this.handles;
  }

  /**
   * Returns all scene objects that need to be added to the gizmo group.
   * @returns An array of all Three.js objects created by this gizmo.
   */
  getAllSceneObjects(): THREE.Object3D[] {
    return [...this.ringGroups];
  }

  /**
   * Disposes all geometries and materials created by this gizmo.
   */
  dispose(): void {
    this.ringGroups.forEach((group) => this.disposeObject3D(group));
    this.ringGroups = [];
    this.handles = [];
  }

  /**
   * Creates a single ring handle with front and occluded ghost meshes.
   * @param axis The gizmo axis for this ring.
   * @param color The hex color of the ring.
   * @param axisDirection The direction vector of the rotation axis.
   */
  private createRing(axis: GizmoAxis, color: number, axisDirection: THREE.Vector3): void {
    const group = new THREE.Group();
    const geometry = new THREE.TorusGeometry(
      GizmoVisualStyle.ringRadius,
      GizmoVisualStyle.stemRadius,
      12,
      64
    );
    const frontMesh = new THREE.Mesh(geometry, createGizmoFrontMaterial(color));
    applyGizmoFrontRenderOrder(frontMesh);
    const handle = new GizmoHandle(axis, color, frontMesh);
    const handleId = handle.getHandleId();
    frontMesh.userData.handleId = handleId;
    const ghostMesh = createGizmoOccludedMesh(geometry, color, handleId);
    group.add(ghostMesh);
    group.add(frontMesh);
    this.alignRingToAxis(group, axisDirection);
    this.ringGroups.push(group);
    this.handles.push(handle);
  }

  /**
   * Aligns a ring group so the torus lies in the plane perpendicular to the axis.
   * @param group The ring group to rotate.
   * @param axisDirection The direction of the rotation axis.
   */
  private alignRingToAxis(group: THREE.Group, axisDirection: THREE.Vector3): void {
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    const targetNormal = axisDirection.clone().normalize();
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(defaultNormal, targetNormal);
    group.quaternion.copy(quaternion);
  }

  /**
   * Recursively disposes geometries and materials under an object.
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
   * Shared geometries are disposed once when first encountered.
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
