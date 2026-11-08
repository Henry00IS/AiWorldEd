import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidBrushPlaneClip } from '@/solid/brush/solid_brush_plane_clip.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import {
  applyTransferredSurfacesToInstance,
  captureInstanceFaceSurfaces,
} from '@/solid/brush/solid_brush_surface_transfer.js';
import type {
  FaceSurfaceDescription,
  FaceSurfaceDescriptionSerialized,
} from '@/texture/uv_matrix/face_surface_description.js';
import { cloneFaceSurface, deserializeFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';

/** Undoable split of one solid brush into two pieces by a world plane. */
export class CommandSolidBrushSplit implements UndoCommand {
  private readonly model: SolidModel;
  private readonly sourceBrushId: string;
  private readonly worldPlane: THREE.Plane;
  private previousBrush: SolidBrush | null;
  private previousOperation: SolidOperation;
  private previousPosition: THREE.Vector3;
  private previousRotation: THREE.Euler;
  private previousScale: THREE.Vector3;
  private previousName: string;
  private previousDefaultSurface: FaceSurfaceDescriptionSerialized | null;
  private previousFaceSurfaces: (FaceSurfaceDescriptionSerialized | undefined)[] | null;
  private frontBrushId: string | null;
  private backBrushId: string | null;
  private executed: boolean;

  /**
   * Creates a solid brush split command.
   *
   * @param model Owning solid model.
   * @param sourceBrushId Brush to split.
   * @param worldPlane World-space split plane.
   */
  constructor(model: SolidModel, sourceBrushId: string, worldPlane: THREE.Plane) {
    this.model = model;
    this.sourceBrushId = sourceBrushId;
    this.worldPlane = worldPlane.clone();
    this.previousBrush = null;
    this.previousOperation = SolidOperation.Additive;
    this.previousPosition = new THREE.Vector3();
    this.previousRotation = new THREE.Euler();
    this.previousScale = new THREE.Vector3(1, 1, 1);
    this.previousName = '';
    this.previousDefaultSurface = null;
    this.previousFaceSurfaces = null;
    this.frontBrushId = null;
    this.backBrushId = null;
    this.executed = false;
  }

  /** Replaces the source brush with front and back pieces. */
  execute(): void {
    if (this.executed) return;
    const source = this.model.findBrush(this.sourceBrushId);
    if (!source) return;
    source.pullTransformFromMesh();
    const localPlane = this.worldPlaneToLocal(source, this.worldPlane);
    const front = SolidBrushPlaneClip.clipKeepThreeHalfSpace(source.brush, localPlane, true);
    const back = SolidBrushPlaneClip.clipKeepThreeHalfSpace(source.brush, localPlane, false);
    if (!front || !back) return;
    this.snapshotSource(source);
    const sourceSurfaces = this.materializeSourceSurfaces(source);
    const sourceBrush = source.brush;
    this.model.removeBrush(this.sourceBrushId, true);
    const frontInstance = this.createPiece(front, this.previousOperation);
    const backInstance = this.createPiece(back, this.previousOperation);
    applyTransferredSurfacesToInstance(
      frontInstance,
      sourceBrush,
      sourceSurfaces.defaultSurface,
      sourceSurfaces.faceSurfaces,
    );
    applyTransferredSurfacesToInstance(
      backInstance,
      sourceBrush,
      sourceSurfaces.defaultSurface,
      sourceSurfaces.faceSurfaces,
    );
    this.model.addBrushInstance(frontInstance);
    this.model.addBrushInstance(backInstance);
    this.frontBrushId = frontInstance.id;
    this.backBrushId = backInstance.id;
    this.executed = true;
  }

  /** Removes split pieces and restores the original brush. */
  undo(): void {
    if (!this.executed || !this.previousBrush) return;
    if (this.frontBrushId) this.model.removeBrush(this.frontBrushId, true);
    if (this.backBrushId) this.model.removeBrush(this.backBrushId, true);
    const restored = new SolidBrushInstance(
      this.sourceBrushId,
      this.previousName,
      this.previousBrush,
      this.previousOperation,
    );
    restored.position.copy(this.previousPosition);
    restored.rotation.copy(this.previousRotation);
    restored.scale.copy(this.previousScale);
    restored.restoreFaceSurfaces(this.previousDefaultSurface ?? undefined, this.previousFaceSurfaces ?? undefined);
    const preview = SolidBrushVisual.createHullPreview(this.previousName, this.previousBrush, this.previousOperation);
    restored.attachMesh(preview);
    this.model.addBrushInstance(restored);
    this.frontBrushId = null;
    this.backBrushId = null;
    this.previousBrush = null;
    this.previousDefaultSurface = null;
    this.previousFaceSurfaces = null;
    this.executed = false;
  }

  /**
   * Returns whether execute produced two pieces.
   *
   * @returns True when split succeeded.
   */
  didSplit(): boolean {
    return this.executed;
  }

  /**
   * Returns meshes of the created pieces for selection.
   *
   * @returns Front and back preview meshes.
   */
  getResultMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    if (this.frontBrushId) {
      const front = this.model.findBrush(this.frontBrushId);
      if (front?.mesh) meshes.push(front.mesh);
    }
    if (this.backBrushId) {
      const back = this.model.findBrush(this.backBrushId);
      if (back?.mesh) meshes.push(back.mesh);
    }
    return meshes;
  }

  /**
   * Stores source brush state for undo.
   *
   * @param source Source instance.
   */
  private snapshotSource(source: SolidBrushInstance): void {
    this.previousBrush = source.brush.clone();
    this.previousOperation = source.operation;
    this.previousPosition.copy(source.position);
    this.previousRotation.copy(source.rotation);
    this.previousScale.copy(source.scale);
    this.previousName = source.name;
    const surfaces = captureInstanceFaceSurfaces(source);
    this.previousDefaultSurface = surfaces.defaultSurface;
    this.previousFaceSurfaces = surfaces.faceSurfaces;
  }

  /**
   * Builds resolved face surfaces for plane-match transfer onto split pieces.
   *
   * @param instance Source brush instance.
   * @returns Default and per-face surfaces.
   */
  private materializeSourceSurfaces(instance: SolidBrushInstance): {
    defaultSurface: FaceSurfaceDescription;
    faceSurfaces: (FaceSurfaceDescription | undefined)[];
  } {
    const defaultSurface = deserializeFaceSurface(instance.serializeDefaultSurface());
    const faceSurfaces: (FaceSurfaceDescription | undefined)[] = [];
    const faceCount = instance.brush.faces.length;
    for (let index = 0; index < faceCount; index++) {
      faceSurfaces[index] = cloneFaceSurface(instance.getFaceSurface(index));
    }
    return { defaultSurface, faceSurfaces };
  }

  /**
   * Creates a new brush piece at the source transform.
   *
   * @param brush Local topology.
   * @param operation CSG operation.
   * @returns Configured instance with hull preview.
   */
  private createPiece(brush: SolidBrush, operation: SolidOperation): SolidBrushInstance {
    const instance = this.model.prepareTopologyBrush(
      brush,
      operation,
      this.previousPosition,
      undefined,
      this.previousName,
    );
    instance.rotation.copy(this.previousRotation);
    instance.scale.copy(this.previousScale);
    instance.pushTransformToMesh();
    return instance;
  }

  /**
   * Transforms a world plane into brush local space (includes model root).
   *
   * @param instance Brush instance.
   * @param worldPlane World plane.
   * @returns Local Three.js plane.
   */
  private worldPlaneToLocal(instance: SolidBrushInstance, worldPlane: THREE.Plane): THREE.Plane {
    instance.pullTransformFromMesh();
    if (instance.mesh) {
      instance.mesh.updateMatrixWorld(true);
      return worldPlane.clone().applyMatrix4(instance.mesh.matrixWorld.clone().invert());
    }
    return worldPlane.clone().applyMatrix4(instance.getLocalMatrix().invert());
  }
}
