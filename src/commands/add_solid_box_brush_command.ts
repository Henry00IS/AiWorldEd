import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { SolidModel } from '../solid/model/solid_model.js';
import { SolidBrushInstance } from '../solid/model/solid_brush_instance.js';
import { SolidOperation } from '../solid/types/solid_operation.js';

/**
 * Undoable command that adds a box brush under a solid model.
 */
export class AddSolidBoxBrushCommand implements UndoCommand {
  private readonly model: SolidModel;
  private readonly size: number;
  private readonly operation: SolidOperation;
  private readonly offset: THREE.Vector3;
  private created: SolidBrushInstance | null;
  private listIndex: number;
  private executed: boolean;

  /**
   * Creates an add-box-brush command.
   * @param model Solid model that will own the brush.
   * @param size Box edge length.
   * @param operation CSG operation for the new brush.
   * @param offset Local position applied after creation.
   */
  constructor(
    model: SolidModel,
    size: number,
    operation: SolidOperation,
    offset: THREE.Vector3
  ) {
    this.model = model;
    this.size = size;
    this.operation = operation;
    this.offset = offset.clone();
    this.created = null;
    this.listIndex = -1;
    this.executed = false;
  }

  /**
   * Creates the brush on first run, or re-inserts it on redo.
   */
  execute(): void {
    if (this.executed) return;
    if (this.created) {
      this.reinsertCreatedBrush();
    } else {
      this.createBrush();
    }
    this.executed = true;
  }

  /**
   * Removes the created brush without disposing preview resources.
   */
  undo(): void {
    if (!this.executed || !this.created) return;
    this.model.removeBrush(this.created.id, false);
    this.executed = false;
  }

  /**
   * Returns the brush created by this command when available.
   * @returns Created brush instance or null.
   */
  getCreatedBrush(): SolidBrushInstance | null {
    return this.created;
  }

  /**
   * Builds a new box brush, applies offset, and records its list index.
   */
  private createBrush(): void {
    const brush = this.model.addBoxBrush(this.size, this.operation);
    brush.position.copy(this.offset);
    brush.pushTransformToMesh();
    this.model.rebuild(true);
    this.created = brush;
    this.listIndex = this.model
      .getBrushes()
      .findIndex((entry) => entry.id === brush.id);
  }

  /**
   * Re-inserts a previously created brush at its recorded index.
   */
  private reinsertCreatedBrush(): void {
    if (!this.created) return;
    if (this.model.findBrush(this.created.id)) return;
    this.created.pushTransformToMesh();
    this.model.insertBrushInstance(this.created, this.listIndex, this.size);
  }
}
