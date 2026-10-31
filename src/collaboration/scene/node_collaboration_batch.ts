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
  readonly changedIds: Set<string>;

  /** Creates an empty batch. */
  constructor() {
    this.parents = new Set();
    this.modelsFull = new Set();
    this.brushesDirty = new Map();
    this.changedIds = new Set();
  }

  /**
   * Records a brush whose transform or visibility changed.
   *
   * @param model Owning model.
   * @param brushId Local brush id.
   */
  brushDirty(model: SolidModel, brushId: string): void {
    let ids = this.brushesDirty.get(model);
    if (ids === undefined) {
      ids = new Set();
      this.brushesDirty.set(model, ids);
    }
    ids.add(brushId);
  }

  /**
   * Returns every model touched by the batch.
   *
   * @returns Unique models.
   */
  models(): SolidModel[] {
    return [...new Set([...this.modelsFull, ...this.brushesDirty.keys()])];
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
      this.changedIds.size === 0
    );
  }
}
