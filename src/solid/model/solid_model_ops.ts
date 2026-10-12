import * as THREE from 'three';
import { removeDecorativeEdges } from '@/utils/mesh_edge_sync.js';
import {
  pullChangedBrushTransforms,
  collectDriftedBrushIds,
  collectParentChainDriftedBrushIds,
} from './solid_brush_transform_sync.js';
import { disposeBrushPreviewResources } from './solid_model_mesh_disposal.js';
import { SolidBrushVisual } from './solid_brush_visual.js';
import { getSolidGroupOperation, isSolidCsgGroup, isValidSolidTreeParent, markAsSolidCsgGroup } from './solid_group.js';
import { markSolidBrushPreviewValidity } from '@/edit/transform/brush_edit_convexity.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import type { SolidBrushInstance } from './solid_brush_instance.js';
import type { SolidBrushCollection } from './solid_brush_collection.js';
import type { SolidModelRebuildPipeline } from './solid_model_rebuild_pipeline.js';
import type { SolidModelPresentation } from './solid_model_presentation.js';

/** Dependencies shared by solid model private lifecycle operations. */
export interface SolidModelOpsHost {
  root: THREE.Group;
  resultMesh: THREE.Mesh;
  brushes: SolidBrushCollection;
  pipeline: SolidModelRebuildPipeline;
  presentation: SolidModelPresentation;
  findBrush: (id: string) => SolidBrushInstance | undefined;
  markBrushesDirty: (brushIds: Iterable<string>) => void;
  markDirty: () => void;
  rebuild: (force?: boolean, options?: { skipEdgeBatchRefresh?: boolean }) => void;
}

/**
 * Rebuilds partial CSG after history when brush local poses or intermediate
 * solid-group parent poses drifted (group undo/redo leaves brush TRS alone).
 *
 * @param host Solid model host.
 */
export function rebuildChangedHistoryTransforms(host: SolidModelOpsHost): void {
  const evaluationList = host.brushes.getEvaluationList();
  const localChangedIds = pullChangedBrushTransforms(evaluationList, {
    positionLock: true,
    stretchLock: true,
  });
  const parentChainChangedIds = collectParentChainDriftedBrushIds(evaluationList, (brushId) =>
    host.pipeline.getPreparedParentChainPoseKey(brushId),
  );
  const changedIds = mergeUniqueBrushIds(localChangedIds, parentChainChangedIds);
  if (changedIds.length === 0) {
    return;
  }
  host.markBrushesDirty(changedIds);
  host.rebuild(true);
}

/**
 * Merges two brush-id lists without duplicates, preserving first-seen order.
 *
 * @param firstIds First id list.
 * @param secondIds Second id list.
 * @returns Combined unique ids.
 */
function mergeUniqueBrushIds(firstIds: readonly string[], secondIds: readonly string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const id of firstIds) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    merged.push(id);
  }
  for (const id of secondIds) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

/**
 * Detaches a brush preview mesh from whatever parent owns it (solid root or a
 * nested CSG group) and optionally disposes GPU resources. Using the solid root
 * alone would leave nested brushes orphaned in the outliner with live
 * wireframes after CSG unregister.
 *
 * @param brush Removed brush instance.
 * @param disposeResources Whether to free GPU resources.
 */
export function detachAndMaybeDisposeBrushMesh(brush: SolidBrushInstance, disposeResources: boolean): void {
  if (!brush.mesh) return;
  brush.mesh.removeFromParent();
  if (disposeResources) disposeBrushPreviewResources(brush.mesh);
}

/**
 * Clones a source brush with offset and attaches a hull preview mesh under the
 * same hierarchy parent as the source (solid root or solid CSG group), inserted
 * immediately after the source sibling when possible. When {@code
 * parentOverride} is set, the clone is parented there without reordering after
 * the source (used when rebuilding a duplicated group tree).
 *
 * @param host Solid model host.
 * @param source Source brush.
 * @param offset Position offset applied after cloning.
 * @param parentOverride Optional explicit parent for the clone mesh.
 * @returns Prepared clone with mesh parented in the source tree.
 */
export function cloneBrushWithPreview(
  host: SolidModelOpsHost,
  source: SolidBrushInstance,
  offset: THREE.Vector3,
  parentOverride: THREE.Object3D | null = null,
): SolidBrushInstance {
  source.pullTransformFromMesh();
  host.brushes.nextBrushCounter();
  const name = hierarchyNameAllocator.allocateFromSourceName(source.name);
  const clone = source.cloneWithId(host.brushes.allocateBrushId(), name);
  clone.position.add(offset);
  const preview = createClonedHullPreview(clone, name);
  const parent = parentOverride ?? resolveBrushCloneParent(host.root, source);
  parent.add(preview);
  if (!parentOverride) {
    insertBrushCloneAfterSource(parent, preview, source.mesh);
  }
  return clone;
}

/**
 * Attaches a hull preview and records whether compilation should skip it.
 *
 * @param clone Cloned brush instance.
 * @param name Preview display name.
 * @returns Preview mesh parented later by the caller.
 */
function createClonedHullPreview(clone: SolidBrushInstance, name: string): THREE.Mesh {
  const preview = SolidBrushVisual.createHullPreview(name, clone.brush, clone.operation);
  clone.attachMesh(preview);
  markSolidBrushPreviewValidity(preview, clone.brush);
  return preview;
}

/**
 * Deep-clones a solid CSG group and all nested brushes/groups. New brush
 * instances are registered on the host collection. The clone group is not
 * parented; the caller attaches it in the hierarchy.
 *
 * @param host Solid model host.
 * @param sourceGroup Solid CSG group to clone.
 * @param offset Local position offset applied only to this group node.
 * @param createdBrushIds Accumulator for newly created brush ids.
 * @returns Cloned group with cloned solid children.
 */
export function cloneSolidCsgGroupSubtree(
  host: SolidModelOpsHost,
  sourceGroup: THREE.Group,
  offset: THREE.Vector3,
  createdBrushIds: string[],
): THREE.Group {
  const cloneGroup = new THREE.Group();
  cloneGroup.name = hierarchyNameAllocator.allocateFromSourceName(sourceGroup.name);
  cloneGroup.position.copy(sourceGroup.position).add(offset);
  cloneGroup.quaternion.copy(sourceGroup.quaternion);
  cloneGroup.scale.copy(sourceGroup.scale);
  markAsSolidCsgGroup(cloneGroup, getSolidGroupOperation(sourceGroup));
  const zeroOffset = new THREE.Vector3(0, 0, 0);
  for (const child of sourceGroup.children.slice()) {
    cloneSolidGroupChild(host, child, cloneGroup, zeroOffset, createdBrushIds);
  }
  return cloneGroup;
}

/**
 * Clones one solid hierarchy child into a destination group.
 *
 * @param host Solid model host.
 * @param child Source child under a solid CSG group.
 * @param destination Parent receiving the clone.
 * @param offset Offset for nested group nodes (usually zero).
 * @param createdBrushIds Accumulator for new brush ids.
 */
function cloneSolidGroupChild(
  host: SolidModelOpsHost,
  child: THREE.Object3D,
  destination: THREE.Group,
  offset: THREE.Vector3,
  createdBrushIds: string[],
): void {
  if (SolidBrushVisual.isBrushObject(child) && child instanceof THREE.Mesh) {
    const sourceBrush = host.brushes.findBrushByMesh(child);
    if (!sourceBrush) return;
    const cloned = cloneBrushWithPreview(host, sourceBrush, offset, destination);
    host.brushes.appendPreparedBrush(cloned);
    createdBrushIds.push(cloned.id);
    return;
  }
  if (isSolidCsgGroup(child) && child instanceof THREE.Group) {
    destination.add(cloneSolidCsgGroupSubtree(host, child, offset, createdBrushIds));
  }
}

/**
 * Chooses the hierarchy parent for a duplicated brush mesh.
 *
 * @param solidRoot Solid model root.
 * @param source Source brush being duplicated.
 * @returns Source mesh parent when valid, otherwise the solid root.
 */
function resolveBrushCloneParent(solidRoot: THREE.Object3D, source: SolidBrushInstance): THREE.Object3D {
  const sourceParent = source.mesh?.parent ?? null;
  if (sourceParent && isValidSolidTreeParent(solidRoot, sourceParent, solidRoot)) {
    return sourceParent;
  }
  return solidRoot;
}

/**
 * Places the clone immediately after the source among siblings when both share
 * the same parent.
 *
 * @param parent Shared parent of source and clone.
 * @param cloneMesh Newly parented clone preview mesh.
 * @param sourceMesh Source preview mesh, or null.
 */
function insertBrushCloneAfterSource(
  parent: THREE.Object3D,
  cloneMesh: THREE.Object3D,
  sourceMesh: THREE.Object3D | null,
): void {
  if (!sourceMesh || sourceMesh.parent !== parent) return;
  const sourceIndex = parent.children.indexOf(sourceMesh);
  if (sourceIndex < 0) return;
  const currentIndex = parent.children.indexOf(cloneMesh);
  if (currentIndex < 0) return;
  parent.children.splice(currentIndex, 1);
  const insertIndex = Math.min(sourceIndex + 1, parent.children.length);
  parent.children.splice(insertIndex, 0, cloneMesh);
}

/**
 * Marks visibility-related seeds dirty and rebuilds CSG.
 *
 * @param host Solid model host.
 * @param brush Brush whose visibility changed.
 */
export function markVisibilityDirtyAndRebuild(host: SolidModelOpsHost, brush: SolidBrushInstance): void {
  const seedIds = [brush.id, ...host.pipeline.getCachedTouchPeerIds(brush.id)];
  host.markBrushesDirty(seedIds);
  if (!brush.visible) {
    host.pipeline.removeMeshChunk(brush.id);
  }
  host.rebuild(true);
}

/**
 * Marks brushes dirty when their preview mesh pose no longer matches instance.
 * Covers callers that move the mesh then call rebuildLive without prepareLive.
 *
 * @param host Solid model host.
 */
export function markMeshesThatDriftedDirty(host: SolidModelOpsHost): void {
  const driftedIds = collectDriftedBrushIds(host.brushes.getEvaluationList());
  if (driftedIds.length === 0) return;
  host.markBrushesDirty(driftedIds);
}

/**
 * Moves listed brushes to first/last evaluation slots and rebuilds.
 *
 * @param host Solid model host.
 * @param brushIds Brushes to move.
 * @param end Which end of the evaluation list.
 * @returns True when order changed.
 */
export function reorderBrushesAndRebuild(
  host: SolidModelOpsHost,
  brushIds: readonly string[],
  end: 'first' | 'last',
): boolean {
  if (!host.brushes.reorderBrushesToEnd(brushIds, end)) return false;
  const dirty = new Set<string>(brushIds);
  for (const brushId of brushIds) {
    for (const peerId of host.pipeline.getCachedTouchPeerIds(brushId)) {
      dirty.add(peerId);
    }
  }
  host.pipeline.clearRoutingTables();
  host.markBrushesDirty(dirty);
  host.rebuild(true, { skipEdgeBatchRefresh: true });
  return true;
}

/**
 * Falls back to full CSG rebuild when polygon caches are missing for texture
 * remesh.
 *
 * @param host Solid model host.
 * @param brushIds Brushes that need refresh.
 * @returns Always true after rebuild.
 */
export function fallbackFullPresentationRebuild(host: SolidModelOpsHost, brushIds: readonly string[]): boolean {
  host.markBrushesDirty(brushIds);
  host.rebuild(true);
  return true;
}

/**
 * Completes presentation remesh after polygon textures updated.
 *
 * @param host Solid model host.
 * @param remeshed Brush ids with updated polygon caches.
 * @returns True when presentation was refreshed.
 */
export function finishPresentationRemesh(host: SolidModelOpsHost, remeshed: readonly string[]): boolean {
  if (!host.pipeline.remeshPresentationForBrushes(remeshed)) {
    return fallbackFullPresentationRebuild(host, remeshed);
  }
  if (host.pipeline.hasResultGeometry()) {
    applySurfaceLayoutToResult(host, true);
  }
  return true;
}

/**
 * Prepares state and pulls transforms for a full async rebuild.
 *
 * @param host Solid model host.
 */
export function prepareFullAsyncRebuild(host: SolidModelOpsHost): void {
  host.markDirty();
  host.brushes.syncBrushOrderFromScene();
  for (const brush of host.brushes.getEvaluationList()) {
    brush.pullTransformFromMesh();
  }
}

/**
 * Applies materials and clears edges after async CSG completion.
 *
 * @param host Solid model host.
 * @param onProgress Optional progress callback.
 */
export function finishAsyncRebuildPresentation(
  host: SolidModelOpsHost,
  onProgress?: (ratio: number, label: string) => void,
): void {
  if (host.pipeline.hasResultGeometry()) {
    onProgress?.(0.95, 'Applying materials…');
    applySurfaceLayoutToResult(host, true);
    clearResultContentEdges(host);
  }
  host.pipeline.resetResultLocalTransform();
  host.pipeline.clearDirtyFlag();
  host.pipeline.setInteractiveGeometryCurrent(true);
  onProgress?.(1, 'Done');
}

/**
 * Applies surface layout when result geometry exists.
 *
 * @param host Solid model host.
 * @param forceMaterials Material rebuild flag.
 */
export function applyPresentationIfGeometryExists(host: SolidModelOpsHost, forceMaterials: boolean): void {
  if (!host.pipeline.hasResultGeometry()) return;
  applySurfaceLayoutToResult(host, forceMaterials);
  clearResultContentEdges(host);
}

/**
 * Writes face maps and materials onto the result mesh.
 *
 * @param host Solid model host.
 * @param forceMaterials Reserved; solid results always preserve order.
 */
export function applySurfaceLayoutToResult(host: SolidModelOpsHost, forceMaterials: boolean): void {
  host.presentation.applySurfaceLayoutToResult(
    host.resultMesh,
    host.pipeline.getLastSurfaceRegions(),
    (id) => host.findBrush(id),
    forceMaterials,
  );
}

/**
 * Applies surface materials on the next frame after interactive commit. CSG
 * result meshes never use white content outline edges (brushes own edges).
 *
 * @param host Solid model host.
 */
export function schedulePresentationRefresh(host: SolidModelOpsHost): void {
  const mesh = host.resultMesh;
  requestAnimationFrame(() => {
    if (host.resultMesh !== mesh) return;
    if (!host.pipeline.hasResultGeometry()) return;
    applySurfaceLayoutToResult(host, true);
    clearResultContentEdges(host);
  });
}

/**
 * Removes content outline edges from the compiled result mesh.
 *
 * @param host Solid model host.
 */
export function clearResultContentEdges(host: SolidModelOpsHost): void {
  removeDecorativeEdges(host.resultMesh);
}
