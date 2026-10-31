import type * as THREE from 'three';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';

/**
 * Base class for geometry that can produce snap hits. Specialized sources
 * ignore objects they do not own.
 */
export abstract class SnapTargetSource {
  /**
   * Appends snap hits for one scene object.
   *
   * @param object Scene object visited during the query.
   * @param request Active query.
   * @param output Hit list to append to.
   */
  abstract collectObject(object: THREE.Object3D, request: SnapQueryRequest, output: SnapHit[]): void;
}
