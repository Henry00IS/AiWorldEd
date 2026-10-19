import type * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { getOutlinerContentChildren } from '@/outliner/ui/outliner_tree_hierarchy.js';
import {
  modifierBevelBoundsOverlap,
  modifierBevelBrushWorldBounds,
  modifierBevelVolumeWorldBounds,
} from '@/modifier/bevel/modifier_bevel_world_bounds.js';
import { ModifierVolumeBevel } from './modifier_volume_bevel.js';
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
 * Lists brushes and groups that touch a volume, plus saved exclusions.
 *
 * @param volume Modifier volume.
 * @param sceneRoot Scene root. The root itself is not a row.
 * @returns Rows in outliner order.
 */
export function modifierVolumeTargetRows(volume: THREE.Object3D, sceneRoot: THREE.Object3D): ModifierVolumeTargetRow[] {
  const ignored = new Set(modifierVolumeBlacklistRead(volume));
  const visible = modifierVolumeTargetVisibleSet(volume, sceneRoot, ignored);
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
 * Collects objects that should appear in the affect list.
 *
 * @param volume Modifier volume.
 * @param sceneRoot Scene root.
 * @param ignored Saved exclusion ids.
 * @returns Objects to show.
 */
function modifierVolumeTargetVisibleSet(
  volume: THREE.Object3D,
  sceneRoot: THREE.Object3D,
  ignored: ReadonlySet<string>,
): Set<THREE.Object3D> {
  const visible = new Set<THREE.Object3D>();
  sceneRoot.traverse((object) => modifierVolumeTargetConsider(object, volume, sceneRoot, ignored, visible));
  return visible;
}

/**
 * Adds one object when it touches the volume or is a saved exclusion.
 *
 * @param object Scene object.
 * @param volume Modifier volume.
 * @param sceneRoot Scene root.
 * @param ignored Saved exclusion ids.
 * @param visible Accumulator.
 */
function modifierVolumeTargetConsider(
  object: THREE.Object3D,
  volume: THREE.Object3D,
  sceneRoot: THREE.Object3D,
  ignored: ReadonlySet<string>,
  visible: Set<THREE.Object3D>,
): void {
  if (!modifierVolumeTargetIsListed(object) || object === volume) return;
  const touched = modifierVolumeTargetTouches(object, volume);
  if (!touched && !ignored.has(object.uuid)) return;
  visible.add(object);
  modifierVolumeTargetAddAncestors(object, sceneRoot, visible);
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
 * Returns whether a brush preview overlaps the volume.
 *
 * @param object Scene object.
 * @param volume Modifier volume.
 * @returns True for an overlapping solid brush.
 */
function modifierVolumeTargetTouches(object: THREE.Object3D, volume: THREE.Object3D): boolean {
  if (!SolidBrushVisual.isBrushObject(object)) return false;
  const brush = SolidModel.fromObject(object)?.findBrushByMesh(object);
  if (!brush) return false;
  const bounds = modifierBevelBrushWorldBounds(brush);
  if (!bounds) return false;
  return modifierBevelBoundsOverlap(bounds, modifierBevelVolumeWorldBounds(volume));
}

/**
 * Returns whether an object can appear in the affect list.
 *
 * @param object Scene object.
 * @returns True for brushes, solid models, and groups.
 */
function modifierVolumeTargetIsListed(object: THREE.Object3D): boolean {
  if (isEditorHelperObject(object) || ModifierVolumeBevel.isVolume(object)) return false;
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
