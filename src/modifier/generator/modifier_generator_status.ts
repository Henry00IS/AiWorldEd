import type * as THREE from 'three';

/** Per-selector evaluation feedback aggregated across solid models. */
export interface GeneratorStatus {
  sources: THREE.Object3D[];
  copies: number;
  error: string;
}
/** Current selector feedback. */
export const generatorStatus = new WeakMap<THREE.Object3D, GeneratorStatus>();
const perModel = new WeakMap<THREE.Object3D, Map<string, GeneratorStatus>>();
/**
 * Replaces one solid's contribution. @param volume Selector. @param rootId
 * Solid ID. @param status Evaluation result.
 */
export function generatorStatusWrite(volume: THREE.Object3D, rootId: string, status: GeneratorStatus): void {
  const models = perModel.get(volume) ?? new Map<string, GeneratorStatus>();
  models.set(rootId, status);
  perModel.set(volume, models);
  generatorStatus.set(volume, {
    sources: [...models.values()].flatMap((entry) => entry.sources),
    copies: [...models.values()].reduce((sum, entry) => sum + entry.copies, 0),
    error: [...new Set([...models.values()].map((entry) => entry.error).filter(Boolean))].join(' '),
  });
}
/**
 * Clears stale contributions before a scene-wide refresh. @param volume
 * Selector.
 */
export function generatorStatusReset(volume: THREE.Object3D): void {
  perModel.delete(volume);
  generatorStatus.delete(volume);
}
