import { UndoCommand } from './undo_command.js';
import { SolidModel } from '../solid/model/solid_model.js';
import {
  FaceTextureMapping,
  cloneFaceTextureMapping
} from '../texture/face_texture_mapping.js';

/**
 * One solid face texture paint target.
 */
export interface SolidFaceTextureTarget {
  model: SolidModel;
  brushId: string;
  surfaceIndex: number;
}

/**
 * Snapshot of one face texture mapping for undo.
 */
interface FaceTextureSnapshot {
  model: SolidModel;
  brushId: string;
  surfaceIndex: number;
  previousMapping: FaceTextureMapping;
}

/**
 * Undoable per-face solid texture assignment on brush surfaces.
 */
export class AssignSolidFaceTextureCommand implements UndoCommand {
  private readonly targets: SolidFaceTextureTarget[];
  private readonly textureId: string;
  private snapshots: FaceTextureSnapshot[];
  private executed: boolean;

  /**
   * Creates a solid face texture command.
   * @param targets Unique brush faces to paint.
   * @param textureId Texture identity.
   */
  constructor(targets: SolidFaceTextureTarget[], textureId: string) {
    this.targets = targets.slice();
    this.textureId = textureId;
    this.snapshots = [];
    this.executed = false;
  }

  /**
   * Applies per-face textures and rebuilds each affected solid model.
   */
  execute(): void {
    if (this.executed) return;
    this.snapshots = [];
    const models = new Set<SolidModel>();
    for (const target of this.targets) {
      if (this.applyToTarget(target)) models.add(target.model);
    }
    this.rebuildModels(models);
    this.executed = true;
  }

  /**
   * Restores prior face mappings and rebuilds.
   */
  undo(): void {
    if (!this.executed) return;
    const models = new Set<SolidModel>();
    for (const snapshot of this.snapshots) {
      if (this.restoreSnapshot(snapshot)) models.add(snapshot.model);
    }
    this.rebuildModels(models);
    this.snapshots = [];
    this.executed = false;
  }

  /**
   * Snapshots and paints one face target.
   * @param target Brush face to paint.
   * @returns True when the brush was found.
   */
  private applyToTarget(target: SolidFaceTextureTarget): boolean {
    const brush = target.model.findBrush(target.brushId);
    if (!brush) return false;
    this.snapshots.push({
      model: target.model,
      brushId: target.brushId,
      surfaceIndex: target.surfaceIndex,
      previousMapping: brush.getSurfaceMapping(target.surfaceIndex)
    });
    brush.setFaceTextureId(target.surfaceIndex, this.textureId);
    return true;
  }

  /**
   * Restores one face mapping snapshot.
   * @param snapshot Prior mapping state.
   * @returns True when the brush was found.
   */
  private restoreSnapshot(snapshot: FaceTextureSnapshot): boolean {
    const brush = snapshot.model.findBrush(snapshot.brushId);
    if (!brush) return false;
    brush.setFaceMapping(
      snapshot.surfaceIndex,
      cloneFaceTextureMapping(snapshot.previousMapping)
    );
    return true;
  }

  /**
   * Rebuilds each solid model in the set.
   * @param models Models that need a CSG rebuild.
   */
  private rebuildModels(models: Set<SolidModel>): void {
    for (const model of models) {
      model.markDirty();
      model.rebuild(true);
    }
  }
}
