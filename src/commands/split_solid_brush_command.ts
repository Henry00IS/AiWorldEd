import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { SolidBrush } from '../solid/brush/solid_brush.js';
import { SolidBrushInstance } from '../solid/model/solid_brush_instance.js';
import { SolidModel } from '../solid/model/solid_model.js';
import { SolidBrushVisual } from '../solid/model/solid_brush_visual.js';
import { SolidBrushPlaneClip } from '../solid/brush/solid_brush_plane_clip.js';
import { SolidOperation } from '../solid/types/solid_operation.js';

/**
 * Undoable split of one solid brush into two pieces by a world plane.
 */
export class SplitSolidBrushCommand implements UndoCommand {
  private readonly model: SolidModel;
  private readonly sourceBrushId: string;
  private readonly worldPlane: THREE.Plane;
  private previousBrush: SolidBrush | null;
  private previousOperation: SolidOperation;
  private previousPosition: THREE.Vector3;
  private previousRotation: THREE.Euler;
  private previousScale: THREE.Vector3;
  private previousName: string;
  private frontBrushId: string | null;
  private backBrushId: string | null;
  private executed: boolean;

  /**
   * Creates a solid brush split command.
   * @param model Owning solid model.
   * @param sourceBrushId Brush to split.
   * @param worldPlane World-space split plane.
   */
  constructor(
    model: SolidModel,
    sourceBrushId: string,
    worldPlane: THREE.Plane
  ) {
    this.model = model;
    this.sourceBrushId = sourceBrushId;
    this.worldPlane = worldPlane.clone();
    this.previousBrush = null;
    this.previousOperation = SolidOperation.Additive;
    this.previousPosition = new THREE.Vector3();
    this.previousRotation = new THREE.Euler();
    this.previousScale = new THREE.Vector3(1, 1, 1);
    this.previousName = '';
    this.frontBrushId = null;
    this.backBrushId = null;
    this.executed = false;
  }

  /**
   * Replaces the source brush with front and back pieces.
   */
  execute(): void {
    if (this.executed) return;
    const source = this.model.findBrush(this.sourceBrushId);
    if (!source) return;
    source.pullTransformFromMesh();
    const localPlane = this.worldPlaneToLocal(source, this.worldPlane);
    const front = SolidBrushPlaneClip.clipKeepThreeHalfSpace(
      source.brush,
      localPlane,
      true
    );
    const back = SolidBrushPlaneClip.clipKeepThreeHalfSpace(
      source.brush,
      localPlane,
      false
    );
    if (!front || !back) return;
    this.snapshotSource(source);
    this.model.removeBrush(this.sourceBrushId, true);
    const frontInstance = this.createPiece(
      `${this.previousName}_A`,
      front,
      this.previousOperation
    );
    const backInstance = this.createPiece(
      `${this.previousName}_B`,
      back,
      this.previousOperation
    );
    this.model.addBrushInstance(frontInstance);
    this.model.addBrushInstance(backInstance);
    this.frontBrushId = frontInstance.id;
    this.backBrushId = backInstance.id;
    this.executed = true;
  }

  /**
   * Removes split pieces and restores the original brush.
   */
  undo(): void {
    if (!this.executed || !this.previousBrush) return;
    if (this.frontBrushId) this.model.removeBrush(this.frontBrushId, true);
    if (this.backBrushId) this.model.removeBrush(this.backBrushId, true);
    const restored = new SolidBrushInstance(
      this.sourceBrushId,
      this.previousName,
      this.previousBrush,
      this.previousOperation
    );
    restored.position.copy(this.previousPosition);
    restored.rotation.copy(this.previousRotation);
    restored.scale.copy(this.previousScale);
    const preview = SolidBrushVisual.createHullPreview(
      this.previousName,
      this.previousBrush,
      this.previousOperation
    );
    restored.attachMesh(preview);
    this.model.addBrushInstance(restored);
    this.frontBrushId = null;
    this.backBrushId = null;
    this.previousBrush = null;
    this.executed = false;
  }

  /**
   * Returns whether execute produced two pieces.
   * @returns True when split succeeded.
   */
  didSplit(): boolean {
    return this.executed;
  }

  /**
   * Returns meshes of the created pieces for selection.
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
   * @param source Source instance.
   */
  private snapshotSource(source: SolidBrushInstance): void {
    this.previousBrush = source.brush.clone();
    this.previousOperation = source.operation;
    this.previousPosition.copy(source.position);
    this.previousRotation.copy(source.rotation);
    this.previousScale.copy(source.scale);
    this.previousName = source.name;
  }

  /**
   * Creates a new brush piece at the source transform.
   * @param name Display name.
   * @param brush Local topology.
   * @param operation CSG operation.
   * @returns Configured instance with hull preview.
   */
  private createPiece(
    name: string,
    brush: SolidBrush,
    operation: SolidOperation
  ): SolidBrushInstance {
    const id = `${this.sourceBrushId}-split-${Math.random().toString(36).slice(2, 8)}`;
    const instance = new SolidBrushInstance(id, name, brush, operation);
    instance.position.copy(this.previousPosition);
    instance.rotation.copy(this.previousRotation);
    instance.scale.copy(this.previousScale);
    const preview = SolidBrushVisual.createHullPreview(name, brush, operation);
    instance.attachMesh(preview);
    return instance;
  }

  /**
   * Transforms a world plane into brush local space.
   * @param instance Brush instance.
   * @param worldPlane World plane.
   * @returns Local Three.js plane.
   */
  private worldPlaneToLocal(
    instance: SolidBrushInstance,
    worldPlane: THREE.Plane
  ): THREE.Plane {
    const matrix = instance.getLocalMatrix();
    return worldPlane.clone().applyMatrix4(matrix.clone().invert());
  }
}
