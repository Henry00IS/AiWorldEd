import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { SolidModel } from '../solid/model/solid_model.js';
import { SolidOperation } from '../solid/types/solid_operation.js';

/**
 * Snapshot of one brush operation for undo.
 */
interface OperationSnapshot {
  model: SolidModel;
  brushId: string;
  previousOperation: SolidOperation;
}

/**
 * Undoable command that sets the CSG operation on one or more solid brushes.
 */
export class SetSolidBrushOperationCommand implements UndoCommand {
  private readonly brushMeshes: THREE.Mesh[];
  private readonly operation: SolidOperation;
  private snapshots: OperationSnapshot[];
  private executed: boolean;

  /**
   * Creates a set-operation command for solid brushes.
   * @param brushMeshes Brush preview meshes to update.
   * @param operation New CSG operation.
   */
  constructor(brushMeshes: THREE.Mesh[], operation: SolidOperation) {
    this.brushMeshes = brushMeshes.slice();
    this.operation = operation;
    this.snapshots = [];
    this.executed = false;
  }

  /**
   * Applies the operation to each brush and rebuilds affected solids.
   */
  execute(): void {
    if (this.executed) return;
    this.snapshots = [];
    const models = new Set<SolidModel>();
    for (const mesh of this.brushMeshes) {
      const model = this.applyToMesh(mesh);
      if (model) models.add(model);
    }
    if (this.snapshots.length === 0) return;
    this.rebuildModels(models);
    this.executed = true;
  }

  /**
   * Restores prior operations and rebuilds affected solids.
   */
  undo(): void {
    if (!this.executed) return;
    const models = new Set<SolidModel>();
    for (const snapshot of this.snapshots) {
      if (snapshot.model.setBrushOperation(snapshot.brushId, snapshot.previousOperation)) {
        models.add(snapshot.model);
      }
    }
    this.rebuildModels(models);
    this.snapshots = [];
    this.executed = false;
  }

  /**
   * Snapshots and updates one brush mesh operation.
   * @param mesh Brush preview mesh.
   * @returns Solid model when updated, otherwise null.
   */
  private applyToMesh(mesh: THREE.Mesh): SolidModel | null {
    const model = SolidModel.fromObject(mesh);
    if (!model) return null;
    const brush = model.findBrushByMesh(mesh);
    if (!brush) return null;
    if (brush.operation === this.operation) return null;
    this.snapshots.push({
      model,
      brushId: brush.id,
      previousOperation: brush.operation
    });
    model.setBrushOperation(brush.id, this.operation);
    return model;
  }

  /**
   * Rebuilds each solid model (setBrushOperation already rebuilds; force sync).
   * @param models Models touched by this command.
   */
  private rebuildModels(models: Set<SolidModel>): void {
    for (const model of models) {
      model.markDirty();
      model.rebuild(true);
    }
  }
}
