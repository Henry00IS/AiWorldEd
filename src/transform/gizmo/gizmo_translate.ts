import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis } from '@/types/transform_mode.js';
import { GizmoHandle } from './gizmo_handle.js';
import { GizmoBuilderBase } from './gizmo_builder_base.js';
import { GizmoVisualStyle, createGizmoPickMesh } from './gizmo_visual_style.js';

/**
 * Creates the translate transform gizmo with axis arrows, thick invisible pick
 * volumes, and a free-move center cube (camera-plane drag).
 */
export class GizmoTranslate extends GizmoBuilderBase {
  /**
   * Creates a new translate gizmo builder.
   *
   * @param theme The theme containing gizmo color definitions.
   */
  constructor(theme: typeof Theme) {
    super(theme);
  }

  /**
   * Creates three axis arrows plus a free-move center handle.
   *
   * @returns GizmoHandle instances for X, Y, Z, and VIEW.
   */
  createHandles(): GizmoHandle[] {
    this.beginHandleBuild();
    for (const spec of this.listStandardAxisSpecs()) {
      this.createAxisArrow(spec.axis, spec.color, spec.direction);
    }
    this.createCenterHandle();
    return this.handles;
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
    this.attachAxisArrowMeshes(group, stemMesh, headMesh, handle.getHandleId());
    this.alignGroupLocalYToDirection(group, direction);
    this.registerSceneRoot(group);
    this.registerHandle(handle);
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
    this.registerSceneRoot(group);
    this.registerHandle(handle);
  }
}
