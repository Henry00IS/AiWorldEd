import type * as THREE from 'three';
import type { SolidModel } from '@/solid/model/solid_model.js';

/**
 * Collects the side effects of one batch of applied node states so models are
 * rebuilt and sibling orders enforced once per batch.
 */
export class BatchCollaborationApply {
  readonly parents: Set<THREE.Object3D>;
  readonly modelsFull: Set<SolidModel>;
  readonly brushesDirty: Map<SolidModel, Set<string>>;
  readonly brushesReordered: Map<SolidModel, Set<string>>;
  readonly changedIds: Set<string>;

  /** Creates an empty batch. */
  constructor() {
    this.parents = new Set();
    this.modelsFull = new Set();
    this.brushesDirty = new Map();
    this.brushesReordered = new Map();
    this.changedIds = new Set();
  }

  /**
   * Records a brush whose transform or visibility changed.
   *
   * @param model Owning model.
   * @param brushId Local brush id.
   */
  brushDirty(model: SolidModel, brushId: string): void {
    BatchCollaborationApply.brushIdsAdd(this.brushesDirty, model, [brushId]);
  }

  /**
   * Records brushes whose evaluation order or inherited operation changed, so
   * they and their touch peers recompile with fresh routing tables.
   *
   * @param model Owning model.
   * @param brushIds Local brush ids.
   */
  brushesReorder(model: SolidModel, brushIds: Iterable<string>): void {
    BatchCollaborationApply.brushIdsAdd(this.brushesReordered, model, brushIds);
  }

  /**
   * Adds brush ids to the set a map keeps for a model.
   *
   * @param byModel Map of model to brush ids.
   * @param model Owning model.
   * @param brushIds Local brush ids.
   */
  private static brushIdsAdd(
    byModel: Map<SolidModel, Set<string>>,
    model: SolidModel,
    brushIds: Iterable<string>,
  ): void {
    let ids = byModel.get(model);
    if (ids === undefined) {
      ids = new Set();
      byModel.set(model, ids);
    }
    for (const brushId of brushIds) ids.add(brushId);
  }

  /**
   * Returns every model touched by the batch.
   *
   * @returns Unique models.
   */
  models(): SolidModel[] {
    return [...new Set([...this.modelsFull, ...this.brushesDirty.keys(), ...this.brushesReordered.keys()])];
  }

  /**
   * Returns whether the batch changed anything.
   *
   * @returns True when nothing was touched.
   */
  isEmpty(): boolean {
    return (
      this.parents.size === 0 &&
      this.modelsFull.size === 0 &&
      this.brushesDirty.size === 0 &&
      this.brushesReordered.size === 0 &&
      this.changedIds.size === 0
    );
  }
}
