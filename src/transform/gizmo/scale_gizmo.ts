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

/** Data stored alongside each scale handle for proper scene management. */
interface ScaleData {
  group: THREE.Group;
  tipMesh: THREE.Mesh;
  lineMesh: THREE.Mesh;
}

/**
 * Creates the scale transform gizmo with thin stems/tips and thicker invisible
 * pick volumes for easier clicking.
 */
export class ScaleGizmo {
  private theme: typeof Theme;
  private handles: GizmoHandle[];
  private scaleData: ScaleData[];
  private coordinateAdapter: CoordinateSpaceAdapter;

  /**
   * Creates a new scale gizmo builder.
   *
   * @param theme The theme containing gizmo color definitions.
   */
  constructor(theme: typeof Theme) {
    this.theme = theme;
    this.handles = [];
    this.scaleData = [];
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
   * Creates all 3 scale handles and returns them.
   *
   * @returns An array of GizmoHandle instances for X, Y, Z axes.
   */
  createHandles(): GizmoHandle[] {
    this.handles = [];
    this.scaleData = [];
    this.createScaleHandle(
      GizmoAxis.X,
      this.theme.gizmoXAxisColor,
      this.coordinateAdapter.profileAxisToEditorDirection('x'),
    );
    this.createScaleHandle(
      GizmoAxis.Y,
      this.theme.gizmoYAxisColor,
      this.coordinateAdapter.profileAxisToEditorDirection('y'),
    );
    this.createScaleHandle(
      GizmoAxis.Z,
      this.theme.gizmoZAxisColor,
      this.coordinateAdapter.profileAxisToEditorDirection('z'),
    );
    return this.handles;
  }

  /**
   * Returns all scene objects that need to be added to the gizmo group.
   *
   * @returns An array of all Three.js objects created by this gizmo.
   */
  getAllSceneObjects(): THREE.Object3D[] {
    const objects: THREE.Object3D[] = [];
    this.scaleData.forEach((data) => objects.push(data.group));
    return objects;
  }

  /** Disposes all geometries and materials created by this gizmo. */
  dispose(): void {
    this.scaleData.forEach((data) => this.disposeObject3D(data.group));
    this.scaleData = [];
    this.handles = [];
  }

  /**
   * Creates a single scale handle with a stem, tip, and thick pick volumes.
   *
   * @param axis The gizmo axis for this handle.
   * @param color The hex color of the handle.
   * @param direction The unit direction vector for the handle orientation.
   */
  private createScaleHandle(axis: GizmoAxis, color: number, direction: THREE.Vector3): void {
    const group = new THREE.Group();
    const lineMesh = this.createScaleStemMesh(color);
    const tipMesh = this.createScaleTipMesh(color);
    const handle = new GizmoHandle(axis, color, tipMesh);
    this.attachScaleHandleMeshes(group, lineMesh, tipMesh, handle.getHandleId());
    this.alignGroupToDirection(group, direction);
    this.scaleData.push({ group, tipMesh, lineMesh });
    this.handles.push(handle);
  }

  /**
   * Creates the thin scale stem cylinder.
   *
   * @param color Axis color.
   * @returns Front stem mesh.
   */
  private createScaleStemMesh(color: number): THREE.Mesh {
    const lineGeometry = new THREE.CylinderGeometry(
      GizmoVisualStyle.stemRadius,
      GizmoVisualStyle.stemRadius,
      GizmoVisualStyle.scaleStemLength,
      8,
    );
    const lineMesh = this.createFrontMesh(lineGeometry, color);
    lineMesh.position.set(0, GizmoVisualStyle.scaleStemLength * 0.5, 0);
    return lineMesh;
  }

  /**
   * Creates the scale tip cube.
   *
   * @param color Axis color.
   * @returns Front tip mesh.
   */
  private createScaleTipMesh(color: number): THREE.Mesh {
    const tipSize = GizmoVisualStyle.scaleTipSize;
    const tipGeometry = new THREE.BoxGeometry(tipSize, tipSize, tipSize);
    const tipMesh = this.createFrontMesh(tipGeometry, color);
    tipMesh.position.set(0, GizmoVisualStyle.scaleStemLength, 0);
    return tipMesh;
  }

  /**
   * Tags, ghosts, pick-volumes, and parents scale stem and tip.
   *
   * @param group Scale handle group.
   * @param lineMesh Visual stem.
   * @param tipMesh Visual tip.
   * @param handleId Shared handle id.
   */
  private attachScaleHandleMeshes(
    group: THREE.Group,
    lineMesh: THREE.Mesh,
    tipMesh: THREE.Mesh,
    handleId: number,
  ): void {
    this.tagHandleId(lineMesh, handleId);
    this.tagHandleId(tipMesh, handleId);
    this.addOccludedPair(group, lineMesh.geometry, this.materialColorOf(lineMesh), handleId, lineMesh.position);
    this.addOccludedPair(group, tipMesh.geometry, this.materialColorOf(tipMesh), handleId, tipMesh.position);
    this.addScalePickVolumes(group, handleId, lineMesh.position, tipMesh.position);
    group.add(lineMesh);
    group.add(tipMesh);
  }

  /**
   * Reads the hex color from a mesh basic material.
   *
   * @param mesh Mesh with MeshBasicMaterial.
   * @returns Hex color, or white when unavailable.
   */
  private materialColorOf(mesh: THREE.Mesh): number {
    const material = mesh.material;
    if (material instanceof THREE.MeshBasicMaterial) {
      return material.color.getHex();
    }
    return 0xffffff;
  }

  /**
   * Adds invisible thicker pick meshes for stem and tip.
   *
   * @param group Scale handle group.
   * @param handleId Shared handle id.
   * @param linePosition Local stem center.
   * @param tipPosition Local tip center.
   */
  private addScalePickVolumes(
    group: THREE.Group,
    handleId: number,
    linePosition: THREE.Vector3,
    tipPosition: THREE.Vector3,
  ): void {
    const stemPick = createGizmoPickMesh(
      new THREE.CylinderGeometry(
        GizmoVisualStyle.stemPickRadius,
        GizmoVisualStyle.stemPickRadius,
        GizmoVisualStyle.scaleStemLength,
        8,
      ),
      handleId,
    );
    stemPick.position.copy(linePosition);
    const pickSize = GizmoVisualStyle.scaleTipPickSize;
    const tipPick = createGizmoPickMesh(new THREE.BoxGeometry(pickSize, pickSize, pickSize), handleId);
    tipPick.position.copy(tipPosition);
    group.add(stemPick);
    group.add(tipPick);
  }

  /**
   * Creates a front-facing gizmo mesh with shared styling.
   *
   * @param geometry Mesh geometry.
   * @param color Hex color.
   * @returns Configured front mesh.
   */
  private createFrontMesh(geometry: THREE.BufferGeometry, color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, createGizmoFrontMaterial(color));
    applyGizmoFrontRenderOrder(mesh);
    return mesh;
  }

  /**
   * Adds an occluded ghost mesh at the same local position as a front part.
   *
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
    position: THREE.Vector3,
  ): void {
    const ghost = createGizmoOccludedMesh(geometry, color, handleId);
    ghost.position.copy(position);
    group.add(ghost);
  }

  /**
   * Stores the handle id on a mesh for raycast matching.
   *
   * @param mesh The mesh to tag.
   * @param handleId The handle identifier.
   */
  private tagHandleId(mesh: THREE.Mesh, handleId: number): void {
    mesh.userData['handleId'] = handleId;
  }

  /**
   * Aligns a group so its local Y axis points along the given direction.
   *
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
   * Disposes the geometry and material of a single mesh.
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
