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

/** Data stored alongside each arrow handle for proper scene management. */
interface ArrowData {
  group: THREE.Group;
  headMesh: THREE.Mesh;
  stemMesh: THREE.Mesh;
}

/**
 * Creates the translate transform gizmo with axis arrows, thick invisible pick
 * volumes, and a Unity-style free-move center cube (camera-plane drag).
 */
export class TranslateGizmo {
  private theme: typeof Theme;
  private handles: GizmoHandle[];
  private arrowData: ArrowData[];
  private centerGroup: THREE.Group | null;
  private coordinateAdapter: CoordinateSpaceAdapter;

  /**
   * Creates a new translate gizmo builder.
   *
   * @param theme The theme containing gizmo color definitions.
   */
  constructor(theme: typeof Theme) {
    this.theme = theme;
    this.handles = [];
    this.arrowData = [];
    this.centerGroup = null;
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
   * Creates three axis arrows plus a free-move center handle.
   *
   * @returns GizmoHandle instances for X, Y, Z, and VIEW.
   */
  createHandles(): GizmoHandle[] {
    this.handles = [];
    this.arrowData = [];
    this.centerGroup = null;
    this.createAxisArrow(
      GizmoAxis.X,
      this.theme.gizmoXAxisColor,
      this.coordinateAdapter.profileAxisToEditorDirection('x'),
    );
    this.createAxisArrow(
      GizmoAxis.Y,
      this.theme.gizmoYAxisColor,
      this.coordinateAdapter.profileAxisToEditorDirection('y'),
    );
    this.createAxisArrow(
      GizmoAxis.Z,
      this.theme.gizmoZAxisColor,
      this.coordinateAdapter.profileAxisToEditorDirection('z'),
    );
    this.createCenterHandle();
    return this.handles;
  }

  /**
   * Returns all scene objects that need to be added to the gizmo group.
   *
   * @returns An array of all Three.js objects created by this gizmo.
   */
  getAllSceneObjects(): THREE.Object3D[] {
    const objects: THREE.Object3D[] = [];
    this.arrowData.forEach((data) => objects.push(data.group));
    if (this.centerGroup) objects.push(this.centerGroup);
    return objects;
  }

  /** Disposes all geometries and materials created by this gizmo. */
  dispose(): void {
    this.arrowData.forEach((data) => this.disposeObject3D(data.group));
    if (this.centerGroup) this.disposeObject3D(this.centerGroup);
    this.arrowData = [];
    this.centerGroup = null;
    this.handles = [];
  }

  /**
   * Creates a single axis arrow with thin visuals and a thicker pick volume.
   *
   * @param axis The gizmo axis for this arrow.
   * @param color The hex color of the arrow.
   * @param direction The unit direction vector for the arrow orientation.
   */
  private createAxisArrow(axis: GizmoAxis, color: number, direction: THREE.Vector3): void {
    const group = new THREE.Group();
    const stemMesh = this.createMoveStemMesh(color);
    const headMesh = this.createMoveHeadMesh(color);
    const handle = new GizmoHandle(axis, color, headMesh);
    const handleId = handle.getHandleId();
    this.attachAxisArrowMeshes(group, stemMesh, headMesh, handleId);
    this.alignGroupToDirection(group, direction);
    this.arrowData.push({ group, headMesh, stemMesh });
    this.handles.push(handle);
  }

  /**
   * Creates the thin cylinder stem for a move arrow.
   *
   * @param color Axis color.
   * @returns Front stem mesh positioned along local +Y.
   */
  private createMoveStemMesh(color: number): THREE.Mesh {
    const stemGeometry = new THREE.CylinderGeometry(
      GizmoVisualStyle.stemRadius,
      GizmoVisualStyle.stemRadius,
      GizmoVisualStyle.moveStemLength,
      8,
    );
    const stemMesh = this.createFrontMesh(stemGeometry, color);
    stemMesh.position.set(0, GizmoVisualStyle.moveStemLength * 0.5, 0);
    return stemMesh;
  }

  /**
   * Creates the cone head for a move arrow.
   *
   * @param color Axis color.
   * @returns Front head mesh positioned at the stem tip.
   */
  private createMoveHeadMesh(color: number): THREE.Mesh {
    const headGeometry = new THREE.ConeGeometry(GizmoVisualStyle.moveHeadRadius, GizmoVisualStyle.moveHeadLength, 8);
    const headMesh = this.createFrontMesh(headGeometry, color);
    const headOffset = GizmoVisualStyle.moveStemLength + GizmoVisualStyle.moveHeadLength * 0.5;
    headMesh.position.set(0, headOffset, 0);
    return headMesh;
  }

  /**
   * Tags, ghosts, pick-volumes, and parents stem and head under the axis group.
   *
   * @param group Axis handle group.
   * @param stemMesh Visual stem.
   * @param headMesh Visual head.
   * @param handleId Shared handle id.
   */
  private attachAxisArrowMeshes(
    group: THREE.Group,
    stemMesh: THREE.Mesh,
    headMesh: THREE.Mesh,
    handleId: number,
  ): void {
    this.tagHandleId(stemMesh, handleId);
    this.tagHandleId(headMesh, handleId);
    this.addOccludedPair(group, stemMesh.geometry, this.materialColorOf(stemMesh), handleId, stemMesh.position);
    this.addOccludedPair(group, headMesh.geometry, this.materialColorOf(headMesh), handleId, headMesh.position);
    this.addAxisPickVolumes(group, handleId, stemMesh.position, headMesh.position);
    group.add(stemMesh);
    group.add(headMesh);
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
   * Adds invisible thicker pick meshes for stem and head along local Y.
   *
   * @param group Axis handle group.
   * @param handleId Shared handle id.
   * @param stemPosition Local stem center.
   * @param headPosition Local head center.
   */
  private addAxisPickVolumes(
    group: THREE.Group,
    handleId: number,
    stemPosition: THREE.Vector3,
    headPosition: THREE.Vector3,
  ): void {
    const stemPick = createGizmoPickMesh(
      new THREE.CylinderGeometry(
        GizmoVisualStyle.stemPickRadius,
        GizmoVisualStyle.stemPickRadius,
        GizmoVisualStyle.moveStemLength,
        8,
      ),
      handleId,
    );
    stemPick.position.copy(stemPosition);
    const headPick = createGizmoPickMesh(
      new THREE.ConeGeometry(GizmoVisualStyle.moveHeadPickRadius, GizmoVisualStyle.moveHeadLength, 8),
      handleId,
    );
    headPick.position.copy(headPosition);
    group.add(stemPick);
    group.add(headPick);
  }

  /** Creates the free-move center cube used for camera-plane translation. */
  private createCenterHandle(): void {
    const group = new THREE.Group();
    const size = GizmoVisualStyle.centerHandleSize;
    const geometry = new THREE.BoxGeometry(size, size, size);
    const color = this.theme.gizmoCenterColor;
    const mesh = this.createFrontMesh(geometry, color);
    const handle = new GizmoHandle(GizmoAxis.VIEW, color, mesh);
    const handleId = handle.getHandleId();
    this.tagHandleId(mesh, handleId);
    this.addOccludedPair(group, geometry, color, handleId, mesh.position);
    const pick = createGizmoPickMesh(new THREE.BoxGeometry(size * 1.35, size * 1.35, size * 1.35), handleId);
    group.add(pick);
    group.add(mesh);
    this.centerGroup = group;
    this.handles.push(handle);
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
