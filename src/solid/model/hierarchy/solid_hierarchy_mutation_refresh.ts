import * as THREE from 'three';
import type { SolidModelOpsHost } from '@/solid/model/solid_model_ops.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import {
  hierarchySeedBrushIdsByModelCollect,
  hierarchySeedBrushIdsCollectUnder,
} from './solid_hierarchy_seed_collector.js';

/**
 * After group/ungroup/reparent on one solid: resync evaluation order and
 * recompile only seed brushes plus cached touch peers. Evaluation-order changes
 * no longer force a full-map rebuild (same partial strategy as To First/Last).
 *
 * @param host Solid model host.
 * @param seedBrushIds Brushes whose hierarchy placement changed.
 */
export function hierarchyMutationRefreshOnHost(host: SolidModelOpsHost, seedBrushIds: readonly string[]): void {
  host.brushes.syncBrushOrderFromScene();
  const dirtyBrushIds = expandHierarchySeedsWithTouchPeers(host, seedBrushIds);
  host.pipeline.clearRoutingTables();
  if (dirtyBrushIds.size === 0) {
    host.markDirty();
  } else {
    host.markBrushesDirty(dirtyBrushIds);
  }
  host.rebuild(true);
}

/**
 * Expands hierarchy seeds with one-hop cached touch peers for partial CSG.
 *
 * @param host Solid model host.
 * @param seedBrushIds Moved or regrouped brush ids.
 * @returns Dirty set for markBrushesDirty.
 */
function expandHierarchySeedsWithTouchPeers(host: SolidModelOpsHost, seedBrushIds: readonly string[]): Set<string> {
  const dirtyBrushIds = new Set<string>(seedBrushIds);
  for (const brushId of seedBrushIds) {
    for (const peerId of host.pipeline.getCachedTouchPeerIds(brushId)) {
      dirtyBrushIds.add(peerId);
    }
  }
  return dirtyBrushIds;
}

/**
 * Refreshes only solid models that own the given hierarchy roots, using brush
 * descendants under those roots as partial CSG seeds. Unrelated solids are left
 * untouched.
 *
 * @param seedRoots Hierarchy nodes that moved, grouped, or ungrouped.
 */
export function hierarchyMutationRefreshFromRoots(seedRoots: readonly THREE.Object3D[]): void {
  const seedsByModel = hierarchySeedBrushIdsByModelCollect(seedRoots);
  for (const [model, seedIds] of seedsByModel) {
    model.hierarchyMutationRefresh(Array.from(seedIds));
  }
}

/**
 * Collects unique brush ids under several hierarchy roots for one solid.
 *
 * @param model Owning solid model.
 * @param seedRoots Hierarchy roots to scan.
 * @returns Unique brush instance ids.
 */
export function hierarchySeedBrushIdsCollectUnderRoots(
  model: SolidModel,
  seedRoots: readonly THREE.Object3D[],
): string[] {
  const seedIds = new Set<string>();
  for (const root of seedRoots) {
    for (const brushId of hierarchySeedBrushIdsCollectUnder(model, root)) {
      seedIds.add(brushId);
    }
  }
  return Array.from(seedIds);
}

/**
 * Resyncs evaluation order from the scene and marks only the seed brushes and
 * their cached touch peers dirty, clearing routing tables, without rebuilding.
 * An empty seed list marks the whole model dirty.
 *
 * @param model Solid model whose sibling order changed.
 * @param seedBrushIds Brushes whose evaluation order or operation changed.
 */
export function hierarchyOrderSeedsMarkDirty(model: SolidModel, seedBrushIds: Iterable<string>): void {
  model.syncBrushOrderFromScene();
  const dirtyBrushIds = new Set<string>(seedBrushIds);
  for (const brushId of [...dirtyBrushIds]) {
    for (const peerId of model.getCachedTouchPeerIds(brushId)) dirtyBrushIds.add(peerId);
  }
  model.clearRoutingTables();
  if (dirtyBrushIds.size === 0) model.markDirty();
  else model.markBrushesDirty(dirtyBrushIds);
}
