import * as THREE from 'three';
import { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import { SolidCompiledPolygon } from './solid_compiled_polygon.js';

/**
 * One spatial peer of a brush with IntersectionType (stored like
 * BrushesTouchedByBrush.brushIntersections).
 */
export interface SolidCompileTouchPeer {
  /** Peer brush instance id. */
  peerId: string;
  /** Subject-centric intersection type for this peer. */
  type: SolidAlgorithmIntersectionType;
}

/** Cached model-space brush geometry reused between partial compiles. */
export interface CachedPreparedBrush {
  /** Model-space brush clone. */
  brush: SolidBrush;
  /** Axis-aligned bounds of the model-space brush. */
  bounds: THREE.Box3;
  /** CSG operation at the time of caching. */
  operation: SolidOperation;
  /** Local position snapshot. */
  position: THREE.Vector3;
  /** Local rotation snapshot. */
  rotation: THREE.Euler;
  /** Local scale snapshot. */
  scale: THREE.Vector3;
  /** Visibility snapshot. */
  visible: boolean;
  /** Topology fingerprint for shape change detection. */
  shapeFingerprint: string;
  /**
   * Fingerprint of intermediate solid-group parent poses (empty when the brush
   * is a direct child of the solid root). Avoids per-brush matrixWorld walks
   * during prepare-cache checks on large maps.
   */
  parentChainPoseKey: string;
}

/**
 * Stores per-brush compiled polygons, touch peers, and prepared geometry so
 * only brushes affected by an edit need to be recompiled.
 */
export class SolidCompileCache {
  private readonly polygonsByBrushId = new Map<string, SolidCompiledPolygon[]>();
  private readonly touchPeersByBrushId = new Map<string, SolidCompileTouchPeer[]>();
  private readonly preparedByBrushId = new Map<string, CachedPreparedBrush>();
  private lastBrushOrder: string[] = [];
  private lastBrushOrderRevision = 0;

  /** Clears every cached entry (full rebuild baseline). */
  clear(): void {
    this.polygonsByBrushId.clear();
    this.touchPeersByBrushId.clear();
    this.preparedByBrushId.clear();
    this.lastBrushOrder = [];
    this.lastBrushOrderRevision++;
  }

  /**
   * Returns whether every listed brush has compiled polygon output cached.
   *
   * @param brushIds Brush instance ids in tree order.
   * @returns True when all ids have polygon cache entries.
   */
  hasPolygonsForAll(brushIds: string[]): boolean {
    for (const brushId of brushIds) {
      if (!this.polygonsByBrushId.has(brushId)) return false;
    }
    return brushIds.length > 0 || this.polygonsByBrushId.size === 0;
  }

  /**
   * Returns cached compiled polygons for a brush.
   *
   * @param brushId Brush instance id.
   * @returns Polygon list or undefined when missing.
   */
  getPolygons(brushId: string): SolidCompiledPolygon[] | undefined {
    return this.polygonsByBrushId.get(brushId);
  }

  /**
   * Stores compiled polygons for a brush.
   *
   * @param brushId Brush instance id.
   * @param polygons Final surface polygons for that brush.
   */
  setPolygons(brushId: string, polygons: SolidCompiledPolygon[]): void {
    this.polygonsByBrushId.set(brushId, polygons);
  }

  /**
   * Returns previously overlapping peer brush ids.
   *
   * @param brushId Brush instance id.
   * @returns Peer ids (empty when unknown).
   */
  getTouchPeerIds(brushId: string): string[] {
    return this.getTouchPeersReadonly(brushId).map((peer) => peer.peerId);
  }

  /**
   * Returns previously overlapping peer brush ids. Allocates a fresh id list.
   *
   * @param brushId Brush instance id.
   * @returns Peer ids (empty when unknown).
   */
  getTouchPeerIdsReadonly(brushId: string): readonly string[] {
    const peers = this.touchPeersByBrushId.get(brushId);
    if (!peers || peers.length === 0) {
      return [];
    }
    return peers.map((peer) => peer.peerId);
  }

  /**
   * Returns previously overlapping peers with intersection types.
   *
   * @param brushId Brush instance id.
   * @returns Touch peers (empty when unknown).
   */
  getTouchPeers(brushId: string): SolidCompileTouchPeer[] {
    return this.getTouchPeersReadonly(brushId).slice();
  }

  /**
   * Returns previously overlapping peers without copying.
   *
   * @param brushId Brush instance id.
   * @returns Touch peers (empty when unknown).
   */
  getTouchPeersReadonly(brushId: string): readonly SolidCompileTouchPeer[] {
    return this.touchPeersByBrushId.get(brushId) ?? [];
  }

  /**
   * Stores the set of peer brushes that currently overlap a brush, with
   * IntersectionType per peer.
   *
   * @param brushId Brush instance id.
   * @param peers Overlapping peers with types.
   */
  setTouchPeers(brushId: string, peers: readonly SolidCompileTouchPeer[]): void {
    this.touchPeersByBrushId.set(
      brushId,
      peers.map((peer) => ({ peerId: peer.peerId, type: peer.type })),
    );
  }

  /**
   * Stores peer ids only (legacy callers). Types default to Intersection so
   * partial update expansion remains conservative until a typed write occurs.
   *
   * @param brushId Brush instance id.
   * @param peerIds Overlapping peer instance ids.
   */
  setTouchPeerIds(brushId: string, peerIds: string[]): void {
    this.setTouchPeers(
      brushId,
      peerIds.map((peerId) => ({
        peerId,
        type: SolidAlgorithmIntersectionType.Intersection,
      })),
    );
  }

  /**
   * Returns cached prepared model-space geometry.
   *
   * @param brushId Brush instance id.
   * @returns Prepared snapshot or undefined.
   */
  getPrepared(brushId: string): CachedPreparedBrush | undefined {
    return this.preparedByBrushId.get(brushId);
  }

  /**
   * Stores prepared model-space geometry for reuse.
   *
   * @param brushId Brush instance id.
   * @param prepared Prepared snapshot.
   */
  setPrepared(brushId: string, prepared: CachedPreparedBrush): void {
    this.preparedByBrushId.set(brushId, prepared);
  }

  /**
   * Drops all cache entries for one brush (removal or full invalidation).
   *
   * @param brushId Brush instance id to drop.
   */
  removeBrush(brushId: string): void {
    this.polygonsByBrushId.delete(brushId);
    this.touchPeersByBrushId.delete(brushId);
    this.preparedByBrushId.delete(brushId);
  }

  /**
   * Removes cache entries for brushes no longer present in the model.
   *
   * @param activeIds Set of brush ids still in the model.
   */
  pruneToIds(activeIds: Set<string>): void {
    this.pruneMapKeys(this.polygonsByBrushId, activeIds);
    this.pruneMapKeys(this.touchPeersByBrushId, activeIds);
    this.pruneMapKeys(this.preparedByBrushId, activeIds);
  }

  /**
   * Returns the brush evaluation order from the last successful compile.
   *
   * @returns Ordered brush ids.
   */
  getLastBrushOrder(): string[] {
    return this.lastBrushOrder.slice();
  }

  /**
   * Records brush evaluation order after a compile.
   *
   * @param order Ordered brush ids.
   */
  setLastBrushOrder(order: string[]): void {
    this.lastBrushOrder = order.slice();
    this.lastBrushOrderRevision++;
  }

  /**
   * Returns a number that changes whenever the last brush order is set.
   *
   * @returns Order revision.
   */
  getLastBrushOrderRevision(): number {
    return this.lastBrushOrderRevision;
  }

  /**
   * Returns whether the given order matches the last compiled order.
   *
   * @param order Candidate ordered brush ids.
   * @returns True when sequences are identical.
   */
  orderMatches(order: string[]): boolean {
    if (order.length !== this.lastBrushOrder.length) return false;
    for (let index = 0; index < order.length; index++) {
      if (order[index] !== this.lastBrushOrder[index]) return false;
    }
    return true;
  }

  /**
   * Returns whether prepared brush ids match the last compiled order without
   * allocating an intermediate id list.
   *
   * @param preparedLength Prepared brush count.
   * @param preparedIdAt Index to brush id resolver.
   * @returns True when sequences are identical.
   */
  orderMatchesPrepared(preparedLength: number, preparedIdAt: (index: number) => string): boolean {
    if (preparedLength !== this.lastBrushOrder.length) {
      return false;
    }
    for (let index = 0; index < preparedLength; index++) {
      if (preparedIdAt(index) !== this.lastBrushOrder[index]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Deletes map keys that are not in the active set.
   *
   * @param map Map to prune.
   * @param activeIds Retained keys.
   */
  private pruneMapKeys<T>(map: Map<string, T>, activeIds: Set<string>): void {
    for (const key of map.keys()) {
      if (!activeIds.has(key)) map.delete(key);
    }
  }
}
