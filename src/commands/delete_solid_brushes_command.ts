import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { SolidModel } from '../solid/model/solid_model.js';
import { SolidBrushInstance } from '../solid/model/solid_brush_instance.js';
import { SolidBrushVisual } from '../solid/model/solid_brush_visual.js';

/**
 * Snapshot of a solid brush removed for undo restore.
 */
interface SolidBrushDeleteSnapshot {
  model: SolidModel;
  instance: SolidBrushInstance;
  listIndex: number;
}

/**
 * Undoable deletion of solid brushes that unregisters them from their solid model
 * and rebuilds CSG so they leave the compiled mesh.
 */
export class DeleteSolidBrushesCommand implements UndoCommand {
  private readonly brushMeshes: THREE.Mesh[];
  private snapshots: SolidBrushDeleteSnapshot[];
  private executed: boolean;

  /**
   * Creates a solid-brush delete command.
   * @param brushMeshes Solid brush preview meshes to remove.
   */
  constructor(brushMeshes: THREE.Mesh[]) {
    this.brushMeshes = brushMeshes.slice();
    this.snapshots = [];
    this.executed = false;
  }

  /**
   * Removes each brush from its solid model and rebuilds CSG without the brush.
   */
  execute(): void {
    if (this.executed) return;
    this.snapshots = this.captureSnapshots();
    this.removeCapturedBrushes();
    this.rebuildAffectedModels();
    this.executed = true;
  }

  /**
   * Restores removed brushes at their original list indices and rebuilds.
   */
  undo(): void {
    if (!this.executed) return;
    const ordered = this.snapshots
      .slice()
      .sort((left, right) => left.listIndex - right.listIndex);
    for (const snapshot of ordered) {
      this.restoreSnapshot(snapshot);
    }
    this.rebuildAffectedModels();
    this.executed = false;
  }

  /**
   * Disposes brush preview GPU resources when the delete is permanently dropped
   * while brushes remain removed from the scene.
   */
  dispose(): void {
    if (!this.executed) return;
    for (const snapshot of this.snapshots) {
      if (!snapshot.instance.mesh) continue;
      snapshot.model.disposeBrushMeshResources(snapshot.instance.mesh);
    }
  }

  /**
   * Filters meshes to solid brush previews only.
   * @param meshes Candidate meshes.
   * @returns Solid brush meshes.
   */
  static filterBrushMeshes(meshes: THREE.Mesh[]): THREE.Mesh[] {
    return meshes.filter((mesh) => SolidBrushVisual.isBrushObject(mesh));
  }

  /**
   * Captures brush ownership snapshots for the meshes still registered.
   * @returns Snapshot list in capture order.
   */
  private captureSnapshots(): SolidBrushDeleteSnapshot[] {
    const snapshots: SolidBrushDeleteSnapshot[] = [];
    for (const mesh of this.brushMeshes) {
      const snapshot = this.captureOne(mesh);
      if (snapshot) snapshots.push(snapshot);
    }
    return snapshots;
  }

  /**
   * Captures one brush mesh if it still belongs to a solid model.
   * @param mesh Brush preview mesh.
   * @returns Snapshot or null when the brush is missing.
   */
  private captureOne(mesh: THREE.Mesh): SolidBrushDeleteSnapshot | null {
    const model = SolidModel.fromObject(mesh);
    if (!model) return null;
    const brush = model.findBrushByMesh(mesh);
    if (!brush) return null;
    const listIndex = model
      .getBrushes()
      .findIndex((entry) => entry.id === brush.id);
    if (listIndex < 0) return null;
    brush.pullTransformFromMesh();
    return { model, instance: brush, listIndex };
  }

  /**
   * Removes all captured brushes without disposing mesh resources.
   */
  private removeCapturedBrushes(): void {
    for (const snapshot of this.snapshots) {
      snapshot.model.removeBrush(snapshot.instance.id, false);
    }
  }

  /**
   * Re-inserts one deleted brush at its original evaluation index.
   * @param snapshot Delete snapshot to restore.
   */
  private restoreSnapshot(snapshot: SolidBrushDeleteSnapshot): void {
    if (snapshot.model.findBrush(snapshot.instance.id)) return;
    snapshot.instance.pushTransformToMesh();
    snapshot.model.insertBrushInstance(
      snapshot.instance,
      snapshot.listIndex
    );
  }

  /**
   * Rebuilds every solid model touched by the current snapshots.
   */
  private rebuildAffectedModels(): void {
    const models = new Set(this.snapshots.map((entry) => entry.model));
    for (const model of models) {
      model.markDirty();
      model.rebuild(true);
    }
  }
}
