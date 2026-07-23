import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { SolidModel } from '../solid/model/solid_model.js';
import { SolidBrushInstance } from '../solid/model/solid_brush_instance.js';

/**
 * Snapshot of one solid brush duplication for undo.
 */
interface SolidBrushDuplicateEntry {
  model: SolidModel;
  sourceBrushId: string;
  createdBrushId: string;
}

/**
 * Undoable command that duplicates solid brushes inside their solid models.
 */
export class DuplicateSolidBrushesCommand implements UndoCommand {
  private readonly sourceMeshes: THREE.Mesh[];
  private readonly offset: THREE.Vector3;
  private readonly entries: SolidBrushDuplicateEntry[];
  private clonedMeshes: THREE.Mesh[];
  private executed: boolean;

  /**
   * Creates a solid-brush duplication command.
   * @param sourceMeshes Brush preview meshes to duplicate.
   * @param offset Local offset applied to each clone.
   */
  constructor(sourceMeshes: THREE.Mesh[], offset: THREE.Vector3) {
    this.sourceMeshes = sourceMeshes.slice();
    this.offset = offset.clone();
    this.entries = [];
    this.clonedMeshes = [];
    this.executed = false;
  }

  /**
   * Duplicates each source brush under its solid model.
   */
  execute(): void {
    if (this.executed) return;
    this.entries.length = 0;
    this.clonedMeshes = [];
    for (const mesh of this.sourceMeshes) {
      const created = this.duplicateOne(mesh);
      if (created?.mesh) {
        this.clonedMeshes.push(created.mesh);
      }
    }
    this.executed = true;
  }

  /**
   * Removes created brushes and rebuilds each affected solid model.
   */
  undo(): void {
    for (let index = this.entries.length - 1; index >= 0; index--) {
      const entry = this.entries[index];
      entry.model.removeBrush(entry.createdBrushId);
    }
    this.entries.length = 0;
    this.clonedMeshes = [];
    this.executed = false;
  }

  /**
   * Returns the cloned brush preview meshes created by execute.
   * @returns Clone meshes.
   */
  getClonedMeshes(): THREE.Mesh[] {
    return this.clonedMeshes.slice();
  }

  /**
   * Duplicates a single brush mesh into its solid model.
   * @param mesh Source brush mesh.
   * @returns Created brush instance or null.
   */
  private duplicateOne(mesh: THREE.Mesh): SolidBrushInstance | null {
    const model = SolidModel.fromObject(mesh);
    if (!model) return null;
    const source = model.findBrushByMesh(mesh);
    if (!source) return null;
    const created = model.duplicateBrush(source.id, this.offset);
    if (!created) return null;
    this.entries.push({
      model,
      sourceBrushId: source.id,
      createdBrushId: created.id
    });
    return created;
  }
}
