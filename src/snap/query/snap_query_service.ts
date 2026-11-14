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
import { snapElementOwnerId } from '@/snap/hit/snap_element_id.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';

/** Hits and occluders gathered from one scene walk. */
interface SnapSceneGather {
  hits: SnapHit[];
  occluders: THREE.Mesh[];
  /** Brush ids and mesh uuids being dragged or edited. */
  movingOwnerIds: Set<string>;
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
    const targets = dropMovingOwnerFaces(allowed, gathered.movingOwnerIds);
    const visible = filterVisibleSnapHits(targets, request.camera, gathered.occluders, gathered.movingOwnerIds);
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
  const gathered: SnapSceneGather = {
    hits: [],
    occluders: [],
    movingOwnerIds: new Set(request.excludedOwnerIds ?? []),
  };
  request.worldRoot.traverse((object) => {
    visitSnapObject(object, request, registry, gathered);
  });
  return gathered;
}

/**
 * Records one object as an occluder and, when it is a legal target, as hits.
 * Dragged objects are remembered as moving owners instead: they follow the
 * pointer, so they would otherwise hide every target under it.
 *
 * @param object Scene object.
 * @param request Active query.
 * @param registry Sources to consult.
 * @param gathered Receives hits, occluders, and moving owners.
 */
function visitSnapObject(
  object: THREE.Object3D,
  request: SnapQueryRequest,
  registry: SnapTargetSourceRegistry,
  gathered: SnapSceneGather,
): void {
  if (!snapObjectIsShown(object)) {
    return;
  }
  if (snapObjectIsExcluded(object, request.excludedRootIds)) {
    snapMovingOwnerRecord(object, gathered.movingOwnerIds);
    return;
  }
  if (snapObjectIsOccluder(object) && object instanceof THREE.Mesh && !gathered.movingOwnerIds.has(object.uuid)) {
    gathered.occluders.push(object);
  }
  registry.collectObject(object, request, gathered.hits);
}

/**
 * Remembers a dragged object as a moving owner: its brush id when it is a solid
 * brush, else its uuid.
 *
 * @param object Dragged scene object.
 * @param movingOwnerIds Receives the owner id.
 */
function snapMovingOwnerRecord(object: THREE.Object3D, movingOwnerIds: Set<string>): void {
  movingOwnerIds.add(SolidBrushVisual.getBrushId(object) ?? object.uuid);
}

/**
 * Removes face hits on geometry that is being dragged or edited, whose faces
 * sit under the pointer and would otherwise capture the snap.
 *
 * @param hits Candidate hits.
 * @param movingOwnerIds Brush ids and mesh uuids being dragged or edited.
 * @returns Remaining hits.
 */
function dropMovingOwnerFaces(hits: readonly SnapHit[], movingOwnerIds: ReadonlySet<string>): SnapHit[] {
  if (movingOwnerIds.size === 0) {
    return [...hits];
  }
  return hits.filter((hit) => hit.kind !== 'face' || !movingOwnerIds.has(snapElementOwnerId(hit.elementId)));
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
