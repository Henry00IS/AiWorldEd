import type * as THREE from 'three';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import { SnapTargetSource } from './snap_target_source.js';

/** Ordered list of snap sources. New geometry types register a source here. */
export class SnapTargetSourceRegistry {
  private readonly sources: SnapTargetSource[];

  /** Creates an empty registry. */
  constructor() {
    this.sources = [];
  }

  /**
   * Registers a source consulted for every visited object.
   *
   * @param source Source to add.
   */
  register(source: SnapTargetSource): void {
    this.sources.push(source);
  }

  /**
   * Asks every source to append hits for one object.
   *
   * @param object Scene object.
   * @param request Active query.
   * @param output Hit list.
   */
  collectObject(object: THREE.Object3D, request: SnapQueryRequest, output: SnapHit[]): void {
    for (const source of this.sources) {
      source.collectObject(object, request, output);
    }
  }
}
