import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** Undoable command that adds a box brush under a solid model. */
export class CommandSolidBoxBrushAdd implements UndoCommand {
  private readonly model: SolidModel;
  private readonly size: number;
  private readonly operation: SolidOperation;
  private readonly offset: THREE.Vector3;
  private readonly rotation: THREE.Euler;
  /** Hierarchy parent for the preview mesh (solid root or solid CSG group). */
  private readonly hierarchyParent: THREE.Object3D;
  /** Child of the hierarchy parent the brush follows, or null to append. */
  private readonly after: THREE.Object3D | null;
  private created: SolidBrushInstance | null;
  private executed: boolean;
  private readonly scratchModelLocalQuaternion: THREE.Quaternion;
  private readonly scratchRootWorldQuaternion: THREE.Quaternion;
  private readonly scratchParentWorldQuaternion: THREE.Quaternion;
  private readonly scratchWorldQuaternion: THREE.Quaternion;
  private readonly scratchParentLocalQuaternion: THREE.Quaternion;

  /**
   * Creates an add-box-brush command.
   *
   * @param model Solid model that will own the brush.
   * @param size Box edge length.
   * @param operation CSG operation for the new brush.
   * @param offset Model-local position applied after creation.
   * @param hierarchyParent Optional solid root or CSG group to append under.
   * @param rotation Model-local rotation (grid axes in model space). Defaults
   *   to identity.
   * @param after Child of the hierarchy parent the brush follows, or null to
   *   append.
   */
  constructor(
    model: SolidModel,
    size: number,
    operation: SolidOperation,
    offset: THREE.Vector3,
    hierarchyParent: THREE.Object3D | null = null,
    rotation: THREE.Euler | null = null,
    after: THREE.Object3D | null = null,
  ) {
    this.model = model;
    this.size = size;
    this.operation = operation;
    this.offset = offset.clone();
    this.rotation = rotation ? rotation.clone() : new THREE.Euler(0, 0, 0, 'XYZ');
    this.hierarchyParent = model.resolveBrushInsertParent(hierarchyParent);
    this.after = after;
    this.created = null;
    this.executed = false;
    this.scratchModelLocalQuaternion = new THREE.Quaternion();
    this.scratchRootWorldQuaternion = new THREE.Quaternion();
    this.scratchParentWorldQuaternion = new THREE.Quaternion();
    this.scratchWorldQuaternion = new THREE.Quaternion();
    this.scratchParentLocalQuaternion = new THREE.Quaternion();
  }

  /** Creates the brush on first run, or re-inserts it on redo. */
  execute(): void {
    if (this.executed) {
      return;
    }
    if (this.created) {
      this.reinsertCreatedBrush();
    } else {
      this.createBrush();
    }
    this.executed = true;
  }

  /** Removes the created brush without disposing preview resources. */
  undo(): void {
    if (!this.executed || !this.created) {
      return;
    }
    this.model.removeBrush(this.created.id, false);
    this.executed = false;
  }

  /**
   * Returns the brush created by this command when available.
   *
   * @returns Created brush instance or null.
   */
  getCreatedBrush(): SolidBrushInstance | null {
    return this.created;
  }

  /**
   * Builds a new box brush under the hierarchy parent, poses it, then runs one
   * partial CSG rebuild at the final spawn transform.
   */
  private createBrush(): void {
    const brush = this.model.addBoxBrush(this.size, this.operation, this.hierarchyParent, false, this.after);
    this.applySpawnPose(brush);
    this.model.markBrushesDirty([brush.id]);
    this.model.rebuild();
    this.created = brush;
  }

  /** Re-inserts a previously created brush at its original parent and slot. */
  private reinsertCreatedBrush(): void {
    if (!this.created) {
      return;
    }
    if (this.model.findBrush(this.created.id)) {
      return;
    }
    this.created.pushTransformToMesh();
    this.model.addBrushInstanceAfter(this.created, this.hierarchyParent, this.after);
  }

  /**
   * Applies spawn position and rotation for the new brush.
   *
   * @param brush Newly created brush instance.
   */
  private applySpawnPose(brush: SolidBrushInstance): void {
    this.applyModelLocalOffset(brush);
    this.applyModelLocalRotation(brush);
  }

  /**
   * Applies the spawn offset in model space, converting into parent-local space
   * when the brush lives under a nested solid CSG group.
   *
   * @param brush Newly created brush instance.
   */
  private applyModelLocalOffset(brush: SolidBrushInstance): void {
    const mesh = brush.mesh;
    if (!mesh) {
      brush.position.copy(this.offset);
      return;
    }
    if (this.hierarchyParent === this.model.root) {
      brush.position.copy(this.offset);
      brush.pushTransformToMesh();
      return;
    }
    this.model.root.updateWorldMatrix(true, false);
    this.hierarchyParent.updateWorldMatrix(true, false);
    const worldPosition = this.offset.clone().applyMatrix4(this.model.root.matrixWorld);
    mesh.position.copy(this.hierarchyParent.worldToLocal(worldPosition));
    brush.pullTransformFromMesh();
  }

  /**
   * Applies model-local spawn rotation, converting into parent-local space when
   * the brush lives under a nested solid CSG group.
   *
   * @param brush Newly created brush instance.
   */
  private applyModelLocalRotation(brush: SolidBrushInstance): void {
    const mesh = brush.mesh;
    if (!mesh) {
      brush.rotation.copy(this.rotation);
      return;
    }
    if (this.hierarchyParent === this.model.root) {
      brush.rotation.copy(this.rotation);
      brush.pushTransformToMesh();
      return;
    }
    this.writeParentLocalRotationFromModelLocal(mesh);
    brush.pullTransformFromMesh();
  }

  /**
   * Writes mesh quaternion so model-local rotation becomes parent-local.
   *
   * @param mesh Brush preview mesh.
   */
  private writeParentLocalRotationFromModelLocal(mesh: THREE.Mesh): void {
    this.model.root.updateWorldMatrix(true, false);
    this.hierarchyParent.updateWorldMatrix(true, false);
    this.scratchModelLocalQuaternion.setFromEuler(this.rotation);
    this.model.root.getWorldQuaternion(this.scratchRootWorldQuaternion);
    this.hierarchyParent.getWorldQuaternion(this.scratchParentWorldQuaternion);
    this.scratchWorldQuaternion.copy(this.scratchRootWorldQuaternion).multiply(this.scratchModelLocalQuaternion);
    this.scratchParentLocalQuaternion
      .copy(this.scratchParentWorldQuaternion)
      .invert()
      .multiply(this.scratchWorldQuaternion);
    mesh.quaternion.copy(this.scratchParentLocalQuaternion);
  }
}
