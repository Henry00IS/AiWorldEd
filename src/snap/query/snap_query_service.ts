import * as THREE from 'three';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import { chooseSnapHit } from '@/snap/query/snap_query_winner.js';
import {
  filterVisibleSnapHits,
  snapObjectIsExcluded,
  snapObjectIsOccluder,
  snapObjectIsShown,
} from '@/snap/query/snap_query_visibility.js';
import { SnapTargetSource } from '@/snap/source/snap_target_source.js';
import { SnapTargetSourceBrush } from '@/snap/source/snap_target_source_brush.js';
import { SnapTargetSourceMesh } from '@/snap/source/snap_target_source_mesh.js';
import { SnapTargetSourceRegistry } from '@/snap/source/snap_target_source_registry.js';

/** Hits and occluders gathered from one scene walk. */
interface SnapSceneGather {
  hits: SnapHit[];
  occluders: THREE.Mesh[];
}

/** Finds the best vertex, edge, or face snap under the pointer. */
export class SnapQueryService {
  private readonly registry: SnapTargetSourceRegistry;

  /** Creates a service with the mesh and brush sources registered. */
  constructor() {
    this.registry = new SnapTargetSourceRegistry();
    this.registry.register(new SnapTargetSourceMesh());
    this.registry.register(new SnapTargetSourceBrush());
  }

  /**
   * Registers an additional snap source.
   *
   * @param source Source consulted for every visited object.
   */
  registerSource(source: SnapTargetSource): void {
    this.registry.register(source);
  }

  /**
   * Returns the winning snap hit, or null when geometry snap is inactive or
   * nothing is in range.
   *
   * @param request Query inputs.
   * @returns Winning hit, or null.
   */
  query(request: SnapQueryRequest): SnapHit | null {
    if (!request.policy.isGeometrySnapActive()) {
      return null;
    }
    const gathered = gatherSnapScene(request, this.registry);
    const allowed = dropExcludedElements(gathered.hits, request.excludedElementIds);
    const visible = filterVisibleSnapHits(allowed, request.camera, gathered.occluders);
    return chooseSnapHit(visible, request.policy.getScreenRadiusPixels());
  }
}

/**
 * Walks the world and collects hits plus occluder meshes.
 *
 * @param request Active query.
 * @param registry Sources to consult.
 * @returns Hits and occluders.
 */
function gatherSnapScene(request: SnapQueryRequest, registry: SnapTargetSourceRegistry): SnapSceneGather {
  const hits: SnapHit[] = [];
  const occluders: THREE.Mesh[] = [];
  request.worldRoot.traverse((object) => {
    visitSnapObject(object, request, registry, hits, occluders);
  });
  return { hits, occluders };
}

/**
 * Records one object as an occluder and, when it is a legal target, as hits.
 *
 * @param object Scene object.
 * @param request Active query.
 * @param registry Sources to consult.
 * @param hits Hit list.
 * @param occluders Occluder list.
 */
function visitSnapObject(
  object: THREE.Object3D,
  request: SnapQueryRequest,
  registry: SnapTargetSourceRegistry,
  hits: SnapHit[],
  occluders: THREE.Mesh[],
): void {
  if (!snapObjectIsShown(object)) {
    return;
  }
  if (snapObjectIsOccluder(object) && object instanceof THREE.Mesh) {
    occluders.push(object);
  }
  if (snapObjectIsExcluded(object, request.excludedRootIds)) {
    return;
  }
  registry.collectObject(object, request, hits);
}

/**
 * Removes hits whose element id is excluded.
 *
 * @param hits Candidate hits.
 * @param excludedElementIds Element ids that must not win.
 * @returns Remaining hits.
 */
function dropExcludedElements(hits: readonly SnapHit[], excludedElementIds: ReadonlySet<string>): SnapHit[] {
  const allowed: SnapHit[] = [];
  for (const hit of hits) {
    if (!excludedElementIds.has(hit.elementId)) {
      allowed.push(hit);
    }
  }
  return allowed;
}
