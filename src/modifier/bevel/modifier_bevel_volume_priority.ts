import type * as THREE from 'three';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  modifierBevelReadUvPlacement,
  type ModifierBevelUvPlacement,
} from '@/modifier/volume/modifier_volume_bevel_uv_placement.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
  MODIFIER_VOLUME_BEVEL_UV_WINDING,
  type ModifierBevelUvFlow,
  type ModifierBevelUvLayout,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';

/** UV and texture taken from the volume nearest the top of the outliner. */
export interface ModifierBevelVolumeStyle {
  /** Authored face the bevel prefers. */
  flow: ModifierBevelUvFlow;
  /** How generated faces place the texture. */
  layout: ModifierBevelUvLayout;
  /** Texture on generated faces. Empty inherits the parent face. */
  textureId: string;
  /** Scale, offset, and rotation applied to generated UVs. */
  placement: ModifierBevelUvPlacement;
}

/**
 * Reads the style of the highest outliner volume.
 *
 * @param volumes Volumes cutting one brush.
 * @returns Style to bake. Defaults when the list is empty.
 */
export function modifierBevelVolumeStyle(volumes: readonly THREE.Object3D[]): ModifierBevelVolumeStyle {
  const volume = modifierBevelPriorityVolume(volumes);
  if (!volume) return modifierBevelDefaultStyle();
  return modifierBevelStyleOf(volume);
}

/**
 * Returns the volume that appears first in the outliner.
 *
 * @param volumes Candidate volumes.
 * @returns Winning volume, or null when none were given.
 */
export function modifierBevelPriorityVolume(volumes: readonly THREE.Object3D[]): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  let bestKey: number[] | null = null;
  for (const volume of volumes) {
    const key = modifierBevelPreorderKey(volume);
    if (!best || !bestKey || modifierBevelRankEarlier(key, bestKey)) {
      best = volume;
      bestKey = key;
    }
  }
  return best;
}

/**
 * Reads one volume's UV flow, layout, and texture.
 *
 * @param volume Bevel volume.
 * @returns Style stored on that volume.
 */
function modifierBevelStyleOf(volume: THREE.Object3D): ModifierBevelVolumeStyle {
  return {
    flow: ModifierVolumeBevel.readUvFlow(volume),
    layout: ModifierVolumeBevel.readUvLayout(volume),
    textureId: ModifierVolumeBevel.readTextureId(volume),
    placement: modifierBevelReadUvPlacement(volume),
  };
}

/**
 * Returns the style used when no volume is available.
 *
 * @returns Continue from face order with the parent texture.
 */
function modifierBevelDefaultStyle(): ModifierBevelVolumeStyle {
  return {
    flow: MODIFIER_VOLUME_BEVEL_UV_WINDING,
    layout: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
    textureId: '',
    placement: {
      uvScaleU: 1,
      uvScaleV: 1,
      uvOffsetU: 0,
      uvOffsetV: 0,
      uvRotation: 0,
      uvOwner: MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
      uvPivot: MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
      uvSpace: MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
    },
  };
}

/**
 * Lists content-sibling indexes from the scene root down to the volume.
 *
 * @param volume Bevel volume.
 * @returns Index path. Empty when the volume has no parent.
 */
function modifierBevelPreorderKey(volume: THREE.Object3D): number[] {
  const keys: number[] = [];
  let current: THREE.Object3D | null = volume;
  while (current?.parent) {
    keys.push(modifierBevelSiblingIndex(current));
    current = current.parent;
  }
  keys.reverse();
  return keys;
}

/**
 * Returns the content-sibling index of one object.
 *
 * @param object Hierarchy object.
 * @returns Index among outliner rows, or 0 when the object is a root.
 */
function modifierBevelSiblingIndex(object: THREE.Object3D): number {
  const parent = object.parent;
  if (!parent) return 0;
  let index = 0;
  for (const child of parent.children) {
    if (child === object) return index;
    if (!isEditorHelperObject(child)) index += 1;
  }
  return index;
}

/**
 * Returns whether the left outliner path is above the right one.
 *
 * @param left First index path.
 * @param right Second index path.
 * @returns True when left should win.
 */
function modifierBevelRankEarlier(left: readonly number[], right: readonly number[]): boolean {
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    const delta = (left[index] ?? -1) - (right[index] ?? -1);
    if (delta !== 0) return delta < 0;
  }
  return false;
}
