import * as THREE from 'three';
import { Theme } from '../../theme.js';
import { GizmoAxis } from '../../types/transform_mode.js';
import { GizmoHandle } from './gizmo_handle.js';
import {
  GizmoVisualStyle,
  applyGizmoFrontRenderOrder,
  createGizmoFrontMaterial,
  createGizmoOccludedMesh,
  createGizmoPickMesh,
} from './gizmo_visual_style.js';
import { CoordinateSpaceAdapter } from '../../coordinates/coordinate_space_adapter.js';
import { createDefaultCoordinateSpace } from '../../settings/coordinate_space_presets.js';
import type { CoordinateSpaceDefinition } from '../../settings/coordinate_space_types.js';

/**
 * Creates the rotate transform gizmo with thin torus rings for each axis and
 * thicker invisible pick tori so rings are easy to grab without looking fat.
 */
export class RotateGizmo {
  private theme: typeof Theme;
  private handles: GizmoHandle[];
  private ringGroups: THREE.Group[];
  private coordinateAdapter: CoordinateSpaceAdapter;

  /**
   * Creates a new rotate gizmo builder.
   *
   * @param theme The theme containing gizmo color definitions.
   */
  constructor(theme: typeof Theme) {
    this.theme = theme;
    this.handles = [];
    this.ringGroups = [];
    this.coordinateAdapter = new CoordinateSpaceAdapter(createDefaultCoordinateSpace());
  }

  /**
   * Changes the profile axes used when creating handles.
   *
   * @param space Active profile coordinate space.
   */
  setCoordinateSpace(space: CoordinateSpaceDefinition): void {
    this.coordinateAdapter = new CoordinateSpaceAdapter(space);
  }

  /**
   * Creates all 3 rotate handles and returns them.
   *
   * @returns An array of GizmoHandle instances for X, Y, Z axes.
   */
  createHandles(): GizmoHandle[] {
    this.handles = [];
    this.ringGroups = [];
    this.createRing(GizmoAxis.X, this.theme.gizmoXAxisColor, this.coordinateAdapter.profileAxisToEditorDirection('x'));
    this.createRing(GizmoAxis.Y, this.theme.gizmoYAxisColor, this.coordinateAdapter.profileAxisToEditorDirection('y'));
    this.createRing(GizmoAxis.Z, this.theme.gizmoZAxisColor, this.coordinateAdapter.profileAxisToEditorDirection('z'));
    return this.handles;
  }

  /**
   * Returns all scene objects that need to be added to the gizmo group.
   *
   * @returns An array of all Three.js objects created by this gizmo.
   */
  getAllSceneObjects(): THREE.Object3D[] {
    return [...this.ringGroups];
  }

  /** Disposes all geometries and materials created by this gizmo. */
  dispose(): void {
    this.ringGroups.forEach((group) => this.disposeObject3D(group));
    this.ringGroups = [];
    this.handles = [];
  }

  /**
   * Creates a single ring handle with front, occluded ghost, and pick meshes.
   *
   * @param axis The gizmo axis for this ring.
   * @param color The hex color of the ring.
   * @param axisDirection The direction vector of the rotation axis.
   */
  private createRing(axis: GizmoAxis, color: number, axisDirection: THREE.Vector3): void {
    const group = new THREE.Group();
    const geometry = new THREE.TorusGeometry(GizmoVisualStyle.ringRadius, GizmoVisualStyle.stemRadius, 12, 64);
    const frontMesh = new THREE.Mesh(geometry, createGizmoFrontMaterial(color));
    applyGizmoFrontRenderOrder(frontMesh);
    const handle = new GizmoHandle(axis, color, frontMesh);
    this.attachRingMeshes(group, geometry, frontMesh, color, handle.getHandleId());
    this.alignRingToAxis(group, axisDirection);
    this.ringGroups.push(group);
    this.handles.push(handle);
  }

  /**
   * Tags the front mesh and adds ghost plus thick pick torus under the ring
   * group.
   *
   * @param group Ring handle group.
   * @param geometry Shared torus geometry for front and ghost.
   * @param frontMesh Visible front ring.
   * @param color Axis color.
   * @param handleId Shared handle id.
   */
  private attachRingMeshes(
    group: THREE.Group,
    geometry: THREE.BufferGeometry,
    frontMesh: THREE.Mesh,
    color: number,
    handleId: number,
  ): void {
    frontMesh.userData['handleId'] = handleId;
    const ghostMesh = createGizmoOccludedMesh(geometry, color, handleId);
    const pickGeometry = new THREE.TorusGeometry(
      GizmoVisualStyle.ringRadius,
      GizmoVisualStyle.ringPickTubeRadius,
      10,
      48,
    );
    group.add(createGizmoPickMesh(pickGeometry, handleId));
    group.add(ghostMesh);
    group.add(frontMesh);
  }

  /**
   * Aligns a ring group so the torus lies in the plane perpendicular to the
   * axis.
   *
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
   *
   * @param obj The object to dispose.
   */
  private disposeObject3D(obj: THREE.Object3D): void {
    if (obj instanceof THREE.Mesh) {
      this.disposeMesh(obj);
    }
    obj.children.forEach((child) => this.disposeObject3D(child));
  }

  /**
   * Disposes the geometry and material of a single mesh. Shared geometries are
   * disposed once when first encountered.
   *
   * @param mesh The mesh to dispose.
   */
  private disposeMesh(mesh: THREE.Mesh): void {
    if (mesh.geometry && !mesh.userData['geometryDisposed']) {
      mesh.geometry.dispose();
      mesh.userData['geometryDisposed'] = true;
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
