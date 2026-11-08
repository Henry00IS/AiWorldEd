import type * as THREE from 'three';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import type { ModifierStackEntry } from '@/modifier/stack/modifier_stack_types.js';

/** Marks helper visualizations a modifier draws inside its selected volume. */
export const MODIFIER_STACK_HELPER_KEY = 'isModifierStackHelper';

/** Volumes whose helpers are shown, normally the one the inspector edits. */
const modifierStackHelpersShown = new WeakSet<THREE.Object3D>();

/**
 * Returns whether a modifier's helpers are drawn: only while it is enabled and
 * its inspector card is unfolded.
 *
 * @param entry Stack entry.
 * @returns True when the modifier's helpers are visible.
 */
export function modifierStackHelpersVisible(entry: ModifierStackEntry): boolean {
  return entry.enabled && entry.expanded;
}

/**
 * Shows the helpers of every modifier in a volume whose helpers are visible, or
 * removes them all.
 *
 * @param volume Modifier volume.
 * @param show False only removes old helpers.
 */
export function modifierStackHelpersSync(volume: THREE.Object3D, show: boolean): void {
  if (show) modifierStackHelpersShown.add(volume);
  else modifierStackHelpersShown.delete(volume);
  modifierStackHelpersClear(volume);
  if (!show) return;
  volume.updateWorldMatrix(true, false);
  for (const entry of ModifierVolume.read(volume).modifiers)
    if (modifierStackHelpersVisible(entry)) modifierStackHelpersAdd(volume, entry);
}

/**
 * Redraws the helpers of volumes that show them, after a volume moved or its
 * stack changed through any path, such as undo or a collaborator.
 *
 * @param volumes Volumes that may have changed.
 */
export function modifierStackHelpersRefresh(volumes: readonly THREE.Object3D[]): void {
  for (const volume of volumes) if (modifierStackHelpersShown.has(volume)) modifierStackHelpersSync(volume, true);
}

/**
 * Removes and disposes every helper child of a volume.
 *
 * @param volume Modifier volume.
 */
function modifierStackHelpersClear(volume: THREE.Object3D): void {
  const helpers = volume.children.filter((child) => child.userData[MODIFIER_STACK_HELPER_KEY] === true);
  for (const helper of helpers) {
    volume.remove(helper);
    helper.traverse((node) => modifierStackHelperDispose(node as THREE.Mesh));
  }
}

/**
 * Frees the geometry and materials of one helper node.
 *
 * @param node Helper node.
 */
function modifierStackHelperDispose(node: THREE.Mesh): void {
  node.geometry?.dispose();
  const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
  for (const material of materials) material.dispose();
}

/**
 * Adds the helpers one modifier kind builds for an entry, marked as helpers.
 *
 * @param volume Modifier volume.
 * @param entry Stack entry whose helpers are visible.
 */
function modifierStackHelpersAdd(volume: THREE.Object3D, entry: ModifierStackEntry): void {
  const kind = modifierStackKindFind(entry.kind);
  for (const helper of kind?.helpers(volume, entry.parameters) ?? []) {
    helper.userData[MODIFIER_STACK_HELPER_KEY] = true;
    volume.add(helper);
  }
}
