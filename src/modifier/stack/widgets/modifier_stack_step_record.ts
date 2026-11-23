import type * as THREE from 'three';

/**
 * What each step of a stack made at its last evaluation, such as its sliders,
 * kept by stack owner and step id.
 */
export class ModifierStackStepRecord<T> {
  /** Items by stack owner and step id. */
  private readonly items = new WeakMap<THREE.Object3D, Map<string, T[]>>();

  /**
   * Keeps what a step made at its evaluation, replacing what it made before.
   *
   * @param owner Stack owner.
   * @param stepId Step id.
   * @param items Items.
   */
  record(owner: THREE.Object3D, stepId: string, items: readonly T[]): void {
    let steps = this.items.get(owner);
    if (!steps) this.items.set(owner, (steps = new Map()));
    steps.set(stepId, [...items]);
  }

  /**
   * Returns what a step made at its last evaluation.
   *
   * @param owner Stack owner.
   * @param stepId Step id.
   * @returns Items; empty before the step is evaluated.
   */
  recorded(owner: THREE.Object3D, stepId: string): T[] {
    return this.items.get(owner)?.get(stepId) ?? [];
  }
}
