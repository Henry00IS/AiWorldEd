import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis } from '@/types/transform_mode.js';
import { GizmoHandle } from './gizmo_handle.js';
import { GizmoBuilderBase } from './gizmo_builder_base.js';
import {
  GizmoVisualStyle,
  GIZMO_FREE_SCALE_DISC_PICK_USERDATA,
  GIZMO_SCALE_FREE_BILLBOARD_USERDATA,
  createGizmoOccludedMesh,
  createGizmoPickMesh,
} from './gizmo_visual_style.js';

/**
 * Creates the scale transform gizmo with thin stems/tips, thicker axis pick
 * volumes, a free-scale center cube, and a camera-facing wire ring (same
 * free-scale behavior as the cube).
 */
export class GizmoScale extends GizmoBuilderBase {
  /**
   * Creates a new scale gizmo builder.
   *
   * @param theme The theme containing gizmo color definitions.
   */
  constructor(theme: typeof Theme) {
    super(theme);
  }

  /**
   * Creates three axis scale handles plus free-scale center cube and ring.
   *
   * @returns GizmoHandle instances for X, Y, Z, and VIEW.
   */
  createHandles(): GizmoHandle[] {
    this.beginHandleBuild();
    for (const spec of this.listStandardAxisSpecs()) {
      this.createScaleHandle(spec.axis, spec.color, spec.direction);
    }
    this.createFreeScaleHandles();
    return this.handles;
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
    this.alignGroupLocalYToDirection(group, direction);
    this.registerSceneRoot(group);
    this.registerHandle(handle);
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
   * Creates free-scale controls: center cube plus camera-facing wire ring and
   * disc pick (identical free-scale / X Y Z behavior).
   */
  private createFreeScaleHandles(): void {
    const color = this.theme.gizmoCenterColor;
    const cubeSize = GizmoVisualStyle.centerHandleSize;
    const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const cubeMesh = this.createFrontMesh(cubeGeometry, color);
    const handle = new GizmoHandle(GizmoAxis.VIEW, color, cubeMesh);
    const handleId = handle.getHandleId();
    this.buildFreeScaleCenterCube(handleId, color, cubeMesh, cubeGeometry);
    this.buildFreeScaleCameraRing(handleId, color);
    this.registerHandle(handle);
  }

  /**
   * Builds the free-scale center cube (axis-aligned, same VIEW handle).
   *
   * @param handleId Shared free-scale handle id.
   * @param color Center color.
   * @param cubeMesh Front cube mesh.
   * @param cubeGeometry Cube geometry for ghost.
   */
  private buildFreeScaleCenterCube(
    handleId: number,
    color: number,
    cubeMesh: THREE.Mesh,
    cubeGeometry: THREE.BoxGeometry,
  ): void {
    const group = new THREE.Group();
    const size = GizmoVisualStyle.centerHandleSize;
    this.tagHandleId(cubeMesh, handleId);
    this.addOccludedPair(group, cubeGeometry, color, handleId, cubeMesh.position);
    const pick = createGizmoPickMesh(new THREE.BoxGeometry(size * 1.35, size * 1.35, size * 1.35), handleId);
    group.add(pick);
    group.add(cubeMesh);
    this.registerSceneRoot(group);
  }

  /**
   * Builds the camera-facing free-scale wire ring and disc pick volume.
   *
   * @param handleId Shared free-scale handle id.
   * @param color Ring color.
   */
  private buildFreeScaleCameraRing(handleId: number, color: number): void {
    const billboard = new THREE.Group();
    billboard.name = 'gizmo_scale_free_billboard';
    billboard.userData[GIZMO_SCALE_FREE_BILLBOARD_USERDATA] = true;
    const radius = GizmoVisualStyle.scaleFreeRingRadius;
    const tube = GizmoVisualStyle.scaleFreeRingTubeRadius;
    const ringGeometry = new THREE.TorusGeometry(radius, tube, 10, 64);
    const frontMesh = this.createFrontMesh(ringGeometry, color);
    this.tagHandleId(frontMesh, handleId);
    billboard.add(createGizmoOccludedMesh(ringGeometry, color, handleId));
    billboard.add(frontMesh);
    billboard.add(this.createFreeScaleDiscPick(handleId, radius));
    this.registerSceneRoot(billboard);
  }

  /**
   * Creates the invisible camera-facing disc used to start free scale when the
   * pointer is inside the wire ring (axis handles still win when hit).
   *
   * @param handleId Shared free-scale handle id.
   * @param radius Disc radius matching the wire ring.
   * @returns Pick mesh.
   */
  private createFreeScaleDiscPick(handleId: number, radius: number): THREE.Mesh {
    const disc = createGizmoPickMesh(new THREE.CircleGeometry(radius, 48), handleId);
    disc.userData[GIZMO_FREE_SCALE_DISC_PICK_USERDATA] = true;
    return disc;
  }
}
