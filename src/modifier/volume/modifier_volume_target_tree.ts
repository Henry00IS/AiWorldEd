import type * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { ModifierVolume, modifierVolumeSceneRoot } from '@/modifier/stack/modifier_volume.js';
import {
  modifierStackGeneratorsByRoot,
  modifierStackTargetsResolve,
} from '@/modifier/stack/scope/modifier_stack_targets.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { getOutlinerContentChildren } from '@/outliner/ui/outliner_tree_hierarchy.js';
import { modifierVolumeIs } from './modifier_volume_is.js';
import { modifierVolumeBlacklistRead, modifierVolumeBlacklistWrite } from './modifier_volume_blacklist.js';

/** One row in a volume's affect list. */
export interface ModifierVolumeTargetRow {
  /** Scene object id. */
  id: string;
  /** Outliner name. */
  name: string;
  /** Indent depth inside the partial tree. */
  depth: number;
  /** True when the object is affected. */
  checked: boolean;
}

/**
 * Lists the brushes and generators a volume affects, with their groups, plus
 * saved exclusions: the same list the volume captures from before exclusions.
 *
 * @param volume Modifier volume.
 * @param sceneRoot Root the rows are listed under; the root itself is not a
 *   row.
 * @returns Rows in outliner order.
 */
export function modifierVolumeTargetRows(volume: THREE.Object3D, sceneRoot: THREE.Object3D): ModifierVolumeTargetRow[] {
  const ignored = new Set(modifierVolumeBlacklistRead(volume));
  const affected = modifierVolumeTargetAffected(volume);
  const visible = modifierVolumeTargetVisibleSet(volume, sceneRoot, ignored, affected);
  const rows: ModifierVolumeTargetRow[] = [];
  for (const child of getOutlinerContentChildren(sceneRoot)) {
    modifierVolumeTargetEmit(child, visible, ignored, 0, rows);
  }
  return rows;
}

/**
 * Drops ignored ids that no longer name a listed scene object.
 *
 * @param volume Modifier volume.
 * @param sceneRoot Scene root.
 * @returns True when the stored list changed.
 */
export function modifierVolumeBlacklistPrune(volume: THREE.Object3D, sceneRoot: THREE.Object3D): boolean {
  const next = modifierVolumeBlacklistWithoutMissing(volume, sceneRoot);
  if (!next) return false;
  modifierVolumeBlacklistWrite(volume, next);
  return true;
}

/**
 * Returns the blacklist with missing ids removed.
 *
 * @param volume Modifier volume.
 * @param sceneRoot Scene root.
 * @returns Next id list, or null when every stored id is still listed.
 */
export function modifierVolumeBlacklistWithoutMissing(
  volume: THREE.Object3D,
  sceneRoot: THREE.Object3D,
): string[] | null {
  const live = modifierVolumeTargetLiveIds(sceneRoot);
  const current = modifierVolumeBlacklistRead(volume);
  const next = current.filter((id) => live.has(id));
  if (next.length === current.length) return null;
  return next;
}

/**
 * Collects the brush meshes and generator nodes a volume affects in every solid
 * of its scene, before exclusions.
 *
 * @param volume Modifier volume.
 * @returns Affected objects.
 */
function modifierVolumeTargetAffected(volume: THREE.Object3D): Set<THREE.Object3D> {
  const affected = new Set<THREE.Object3D>();
  for (const model of SolidModelRegistry.collectUnder(modifierVolumeSceneRoot(volume))) {
    const brushes = model.getBrushes();
    const generators = modifierStackGeneratorsByRoot.get(model.root);
    const targets = modifierStackTargetsResolve(volume, model.root, brushes, generators);
    for (const brush of brushes) if (brush.mesh && targets.authoredIds.has(brush.id)) affected.add(brush.mesh);
    for (const node of targets.pieceGenerators.values()) affected.add(node);
  }
  return affected;
}

/**
 * Collects objects that should appear in the affect list.
 *
 * @param volume Modifier volume.
 * @param sceneRoot Root the rows are listed under.
 * @param ignored Saved exclusion ids.
 * @param affected Objects the volume affects.
 * @returns Objects to show.
 */
function modifierVolumeTargetVisibleSet(
  volume: THREE.Object3D,
  sceneRoot: THREE.Object3D,
  ignored: ReadonlySet<string>,
  affected: ReadonlySet<THREE.Object3D>,
): Set<THREE.Object3D> {
  const visible = new Set<THREE.Object3D>();
  sceneRoot.traverse((object) => {
    if (object === sceneRoot || object === volume || !modifierVolumeTargetIsListed(object)) return;
    if (!affected.has(object) && !ignored.has(object.uuid)) return;
    visible.add(object);
    modifierVolumeTargetAddAncestors(object, sceneRoot, visible);
  });
  return visible;
}

/**
 * Adds listed ancestors up to, but not including, the scene root.
 *
 * @param object Start object.
 * @param sceneRoot Scene root.
 * @param visible Accumulator.
 */
function modifierVolumeTargetAddAncestors(
  object: THREE.Object3D,
  sceneRoot: THREE.Object3D,
  visible: Set<THREE.Object3D>,
): void {
  let current = object.parent;
  while (current && current !== sceneRoot) {
    if (modifierVolumeTargetIsListed(current)) visible.add(current);
    current = current.parent;
  }
}

/**
 * Walks the partial tree and appends visible rows.
 *
 * @param object Current object.
 * @param visible Objects to show.
 * @param ignored Saved exclusion ids.
 * @param depth Indent of this object when it is shown.
 * @param rows Accumulator.
 */
function modifierVolumeTargetEmit(
  object: THREE.Object3D,
  visible: Set<THREE.Object3D>,
  ignored: ReadonlySet<string>,
  depth: number,
  rows: ModifierVolumeTargetRow[],
): void {
  const include = visible.has(object);
  if (include) rows.push(modifierVolumeTargetRow(object, depth, ignored));
  const nextDepth = include ? depth + 1 : depth;
  for (const child of getOutlinerContentChildren(object)) {
    modifierVolumeTargetEmit(child, visible, ignored, nextDepth, rows);
  }
}

/**
 * Builds one affect row.
 *
 * @param object Scene object.
 * @param depth Indent depth.
 * @param ignored Saved exclusion ids.
 * @returns Row.
 */
function modifierVolumeTargetRow(
  object: THREE.Object3D,
  depth: number,
  ignored: ReadonlySet<string>,
): ModifierVolumeTargetRow {
  return {
    id: object.uuid,
    name: object.name || 'Object',
    depth,
    checked: !ignored.has(object.uuid),
  };
}

/**
 * Returns whether an object can appear in the affect list.
 *
 * @param object Scene object.
 * @returns True for brushes, generator nodes, solid models, and groups.
 */
function modifierVolumeTargetIsListed(object: THREE.Object3D): boolean {
  if (ModifierVolume.isGenerator(object)) return true;
  if (isEditorHelperObject(object) || modifierVolumeIs(object)) return false;
  if (SolidBrushVisual.isBrushObject(object) || SolidModel.isSolidModelObject(object)) return true;
  return isSolidCsgGroup(object) || object.type === 'Group';
}

/**
 * Collects ids of objects that can stay in a saved exclusion list.
 *
 * @param sceneRoot Scene root.
 * @returns Live ids.
 */
function modifierVolumeTargetLiveIds(sceneRoot: THREE.Object3D): Set<string> {
  const live = new Set<string>();
  sceneRoot.traverse((object) => {
    if (modifierVolumeTargetIsListed(object)) live.add(object.uuid);
  });
  return live;
}
